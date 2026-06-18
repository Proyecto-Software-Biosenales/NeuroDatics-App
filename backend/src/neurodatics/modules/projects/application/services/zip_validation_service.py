import mimetypes
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
from typing import Dict, List, Optional, Tuple

from .....config.settings import settings


KIND_BY_EXTENSION = {
    ".jpg": "scenario_image",
    ".jpeg": "scenario_image",
    ".png": "scenario_image",
    ".gif": "scenario_image",
    ".bmp": "scenario_image",
    ".webp": "scenario_image",
    ".tif": "scenario_image",
    ".tiff": "scenario_image",
    ".svg": "scenario_image",
    ".mp4": "scenario_video",
    ".avi": "scenario_video",
    ".mov": "scenario_video",
    ".mkv": "scenario_video",
    ".webm": "scenario_video",
    ".m4v": "scenario_video",
    ".csv": "raw_csv",
    ".pdf": "report_pdf",
}

SCENARY_ALLOWED_FOLDERS = {"images", "videos"}


@dataclass
class ZipManifestEntry:
    source_entry_path: str
    filename: str
    extension: str
    mime_type: str
    size_bytes: int
    kind: str


class ZipValidationService:
    ACCEPTED_MIME_TYPES = {
        "application/zip",
        "application/x-zip-compressed",
    }

    class ValidationError(Exception):
        pass

    @classmethod
    def get_max_file_size_bytes(cls) -> int:
        return int(settings.project_zip_max_size_mb) * 1024 * 1024

    @classmethod
    def infer_kind(cls, extension: str) -> str:
        return KIND_BY_EXTENSION.get(extension.lower(), "other_asset")

    @classmethod
    def infer_mime_type(cls, filename: str) -> str:
        guessed, _ = mimetypes.guess_type(filename)
        return guessed or "application/octet-stream"

    @classmethod
    def validate_upload(cls, filename: str, mime_type: str, file_content: bytes) -> None:
        if not filename.lower().endswith(".zip"):
            raise cls.ValidationError("El archivo debe tener extension .zip")

        if mime_type and mime_type not in cls.ACCEPTED_MIME_TYPES:
            raise cls.ValidationError("MIME type no soportado para ZIP")

        max_size = cls.get_max_file_size_bytes()
        if len(file_content) > max_size:
            raise cls.ValidationError(f"ZIP excede el maximo permitido de {settings.project_zip_max_size_mb}MB")

    @classmethod
    def validate_zip_integrity(cls, file_content: bytes) -> zipfile.ZipFile:
        try:
            zip_file = zipfile.ZipFile(BytesIO(file_content), "r")
        except zipfile.BadZipFile as exc:
            raise cls.ValidationError("No se puede abrir el ZIP") from exc

        entries = zip_file.infolist()
        if not entries:
            zip_file.close()
            raise cls.ValidationError("El ZIP esta vacio")

        corrupted = zip_file.testzip()
        if corrupted:
            zip_file.close()
            raise cls.ValidationError(f"ZIP corrupto en entrada: {corrupted}")

        return zip_file

    @classmethod
    def normalize_entry_path(cls, path: str) -> str:
        normalized = path.replace("\\", "/").strip("/")
        return normalized

    @classmethod
    def _is_inside_scenary_folder(cls, entry_path: PurePosixPath) -> bool:
        """True when file is inside an Images or Videos directory (case-insensitive)."""
        parent_parts = [part.lower() for part in entry_path.parent.parts]
        return any(part in SCENARY_ALLOWED_FOLDERS for part in parent_parts)

    @classmethod
    def is_useful_entry(cls, entry_path: str) -> bool:
        normalized = cls.normalize_entry_path(entry_path)
        if not normalized:
            return False
        if normalized.startswith("__MACOSX/"):
            return False
        return True

    @classmethod
    def validate_structure(cls, entries: List[ZipManifestEntry], counts: Dict[str, int]) -> None:
        """
        Validate that the ZIP has the required structure:
        1. At least one .csv file
        2. At least one Images and/or Videos folder (i.e., at least one image or video)
        """
        # Check for .csv file
        if counts["csv"] == 0:
            raise cls.ValidationError(
                "El ZIP debe contener obligatoriamente un archivo .csv"
            )

        # Check for Images and/or Videos folders
        has_images_or_videos = counts["images"] > 0 or counts["videos"] > 0
        if not has_images_or_videos:
            raise cls.ValidationError(
                "El ZIP debe contener obligatoriamente archivos en carpetas 'Images' y/o 'Videos'"
            )

    @classmethod
    def build_manifest(cls, zip_file: zipfile.ZipFile) -> Tuple[List[ZipManifestEntry], Dict[str, int]]:
        entries: List[ZipManifestEntry] = []
        counts: Dict[str, int] = {
            "images": 0,
            "videos": 0,
            "csv": 0,
            "other": 0,
        }

        for info in zip_file.infolist():
            if info.is_dir():
                continue

            source_entry_path = cls.normalize_entry_path(info.filename)
            if not cls.is_useful_entry(source_entry_path):
                continue

            path = PurePosixPath(source_entry_path)
            extension = path.suffix.lower()
            kind = cls.infer_kind(extension)

            # Only files under Images/Videos folders can be classified as scenario assets.
            if kind in {"scenario_image", "scenario_video"} and not cls._is_inside_scenary_folder(path):
                kind = "other_asset"

            if kind == "scenario_image":
                counts["images"] += 1
            elif kind == "scenario_video":
                counts["videos"] += 1
            elif kind == "raw_csv":
                counts["csv"] += 1
            else:
                counts["other"] += 1

            entries.append(
                ZipManifestEntry(
                    source_entry_path=source_entry_path,
                    filename=path.name,
                    extension=extension,
                    mime_type=cls.infer_mime_type(path.name),
                    size_bytes=info.file_size,
                    kind=kind,
                )
            )

        if not entries:
            raise cls.ValidationError("El ZIP no contiene archivos utiles")

        return entries, counts

    @classmethod
    def validate_and_analyze(
        cls,
        filename: str,
        mime_type: Optional[str],
        file_content: bytes,
    ) -> Tuple[List[ZipManifestEntry], Dict[str, int]]:
        cls.validate_upload(filename=filename, mime_type=mime_type or "", file_content=file_content)
        zip_file = cls.validate_zip_integrity(file_content)
        try:
            entries, counts = cls.build_manifest(zip_file)
            cls.validate_structure(entries, counts)
            return entries, counts
        finally:
            zip_file.close()
