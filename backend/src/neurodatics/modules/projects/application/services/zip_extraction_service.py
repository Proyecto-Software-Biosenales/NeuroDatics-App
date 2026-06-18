import shutil
import tempfile
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Generator, List

from .zip_validation_service import ZipManifestEntry


@dataclass
class ExtractedZipContext:
    temp_dir: str
    extracted_root: str
    files_by_entry_path: Dict[str, str]
    folders: List[str]


class ZipExtractionService:
    class ExtractionError(Exception):
        pass

    @classmethod
    def _is_unsafe_relative_path(cls, relative_path: str) -> bool:
        normalized = relative_path.replace("\\", "/")
        if normalized.startswith("/"):
            return True
        if ":" in normalized.split("/")[0]:
            return True
        parts = [part for part in normalized.split("/") if part]
        return any(part == ".." for part in parts)

    @classmethod
    @contextmanager
    def extract_to_temp(
        cls,
        file_content: bytes,
        manifest_entries: List[ZipManifestEntry],
    ) -> Generator[ExtractedZipContext, None, None]:
        with tempfile.TemporaryDirectory(prefix="neurodatics-ingestion-") as tmp_dir:
            extraction_root = Path(tmp_dir) / "extracted"
            extraction_root.mkdir(parents=True, exist_ok=True)

            files_by_entry_path: Dict[str, str] = {}
            folder_set = set()

            try:
                placeholder_zip = Path(tmp_dir) / "payload.zip"
                placeholder_zip.write_bytes(file_content)

                with zipfile.ZipFile(placeholder_zip, "r") as zip_file:
                    for entry in manifest_entries:
                        rel_path = entry.source_entry_path
                        if cls._is_unsafe_relative_path(rel_path):
                            raise cls.ExtractionError(f"Ruta insegura detectada en ZIP: {rel_path}")

                        destination = extraction_root / Path(rel_path)
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        folder_set.add(str(destination.parent.relative_to(extraction_root)).replace("\\", "/"))

                        with zip_file.open(rel_path, "r") as src, destination.open("wb") as dst:
                            shutil.copyfileobj(src, dst)

                        files_by_entry_path[rel_path] = str(destination)

                yield ExtractedZipContext(
                    temp_dir=tmp_dir,
                    extracted_root=str(extraction_root),
                    files_by_entry_path=files_by_entry_path,
                    folders=sorted(folder for folder in folder_set if folder and folder != "."),
                )
            except KeyError as exc:
                raise cls.ExtractionError("No se pudo extraer una entrada del ZIP") from exc
