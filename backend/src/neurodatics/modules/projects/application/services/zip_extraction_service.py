import zipfile
import zlib
import lzma
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Generator, List
import tempfile

from .....config.settings import settings
from .zip_validation_service import ZipManifestEntry, ZipValidationService


@dataclass
class ExtractedZipContext:
    temp_dir: str
    extracted_root: str
    files_by_entry_path: Dict[str, str]
    folders: List[str]


class ZipExtractionService:
    COPY_CHUNK_SIZE = 1024 * 1024

    class ExtractionError(Exception):
        pass

    @classmethod
    def _is_unsafe_relative_path(cls, relative_path: str) -> bool:
        return ZipValidationService.is_unsafe_entry_path(relative_path)

    @classmethod
    def _copy_bounded(
        cls,
        source,
        destination,
        entry_path: str,
        entry_budget: int,
        remaining_total: int,
    ) -> int:
        """Stream one member out, refusing to write more than it is allowed to.

        The ZIP central directory is attacker-controlled, so the declared sizes
        that `enforce_archive_limits` checked cannot be trusted during the actual
        decompression. This counts the bytes that really come out.
        """
        written = 0
        while True:
            chunk = source.read(cls.COPY_CHUNK_SIZE)
            if not chunk:
                break

            written += len(chunk)
            if written > entry_budget:
                raise cls.ExtractionError(
                    f"La entrada '{entry_path}' se descomprime a mas de lo declarado en el ZIP "
                    "(posible archivo malicioso)"
                )
            if written > remaining_total:
                raise cls.ExtractionError(
                    "El contenido descomprimido del ZIP supera el maximo permitido de "
                    f"{settings.project_zip_max_uncompressed_mb}MB"
                )

            destination.write(chunk)

        return written

    @classmethod
    @contextmanager
    def extract_to_temp(
        cls,
        zip_path: str,
        manifest_entries: List[ZipManifestEntry],
    ) -> Generator[ExtractedZipContext, None, None]:
        """Extract only the manifest entries, streamed and byte-budgeted.

        Reading each member to EOF also makes `zipfile` verify its CRC, so this
        single pass replaces the old separate `testzip()` scan.
        """
        max_total_bytes = int(settings.project_zip_max_uncompressed_mb) * 1024 * 1024
        max_entry_bytes = int(settings.project_zip_max_entry_uncompressed_mb) * 1024 * 1024

        with tempfile.TemporaryDirectory(prefix="neurodatics-ingestion-") as tmp_dir:
            extraction_root = Path(tmp_dir) / "extracted"
            extraction_root.mkdir(parents=True, exist_ok=True)

            files_by_entry_path: Dict[str, str] = {}
            folder_set = set()
            total_written = 0

            try:
                with zipfile.ZipFile(zip_path, "r") as zip_file:
                    members = ZipValidationService.archive_members_by_path(zip_file)
                    for entry in manifest_entries:
                        rel_path = entry.source_entry_path
                        if cls._is_unsafe_relative_path(rel_path):
                            raise cls.ExtractionError(f"Ruta insegura detectada en ZIP: {rel_path}")
                        if rel_path in files_by_entry_path:
                            raise cls.ExtractionError(f"Entrada duplicada en manifiesto: {rel_path}")
                        member = members[rel_path]
                        if member.file_size != entry.size_bytes:
                            raise cls.ExtractionError(
                                f"El tamaño de '{rel_path}' no coincide con lo declarado en el manifiesto"
                            )

                        destination = extraction_root / Path(rel_path)
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        folder_set.add(str(destination.parent.relative_to(extraction_root)).replace("\\", "/"))

                        # ZIP sizes are exact byte counts; a margin hides a mismatch
                        # between the manifest, progress accounting, and stored bytes.
                        entry_budget = min(
                            max_entry_bytes,
                            max(0, int(entry.size_bytes or 0)),
                        )

                        with zip_file.open(member, "r") as src, destination.open("xb") as dst:
                            written = cls._copy_bounded(
                                src,
                                dst,
                                entry_path=rel_path,
                                entry_budget=entry_budget,
                                remaining_total=max_total_bytes - total_written,
                            )
                        if written != entry.size_bytes:
                            raise cls.ExtractionError(
                                f"El tamaño de '{rel_path}' no coincide con lo declarado en el ZIP"
                            )
                        total_written += written

                        files_by_entry_path[rel_path] = str(destination)

            except ZipValidationService.ValidationError as exc:
                raise cls.ExtractionError(str(exc)) from exc
            except KeyError as exc:
                raise cls.ExtractionError("No se pudo extraer una entrada del ZIP") from exc
            except (zipfile.BadZipFile, zlib.error, lzma.LZMAError, EOFError, RuntimeError) as exc:
                raise cls.ExtractionError("ZIP corrupto o con compresion no soportada") from exc

            yield ExtractedZipContext(
                temp_dir=tmp_dir,
                extracted_root=str(extraction_root),
                files_by_entry_path=files_by_entry_path,
                folders=sorted(folder for folder in folder_set if folder and folder != "."),
            )
