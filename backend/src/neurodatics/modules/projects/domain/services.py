import zipfile
from io import BytesIO
from typing import Dict, Optional, Tuple, Any
from pathlib import Path


class ZipManifestEntry:
    """Represents a single entry in ZIP manifest"""

    KIND_IMAGE = "image"
    KIND_VIDEO = "video"
    KIND_CSV = "csv"
    KIND_OTHER = "other"

    IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'}
    VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm', '.m4v'}
    CSV_EXTENSIONS = {'.csv', '.tsv'}

    @classmethod
    def infer_kind(cls, extension: str) -> str:
        """Infer entry kind from file extension"""
        ext = extension.lower()

        if ext in cls.IMAGE_EXTENSIONS:
            return cls.KIND_IMAGE
        elif ext in cls.VIDEO_EXTENSIONS:
            return cls.KIND_VIDEO
        elif ext in cls.CSV_EXTENSIONS:
            return cls.KIND_CSV
        else:
            return cls.KIND_OTHER

    @staticmethod
    def to_dict(path: str, extension: str, size_bytes: int) -> Dict[str, Any]:
        """Convert entry to dictionary"""
        kind = ZipManifestEntry.infer_kind(extension)
        return {
            "path": path,
            "extension": extension,
            "kind": kind,
            "size_bytes": size_bytes,
        }


class ZipValidationService:
    """Service for validating and analyzing ZIP files"""

    MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
    ACCEPTED_MIME_TYPES = {
        'application/zip',
        'application/x-zip-compressed',
    }

    class ValidationError(Exception):
        """Raised when ZIP validation fails"""
        pass

    @classmethod
    def validate_file(cls, file_content: bytes, mime_type: str) -> None:
        """Validate ZIP file before processing"""

        if mime_type not in cls.ACCEPTED_MIME_TYPES:
            raise cls.ValidationError(
                f"Invalid MIME type. Accepted: {', '.join(cls.ACCEPTED_MIME_TYPES)}"
            )

        if len(file_content) > cls.MAX_FILE_SIZE:
            raise cls.ValidationError(
                f"File too large. Maximum size: {cls.MAX_FILE_SIZE / (1024*1024):.0f} MB"
            )

    @classmethod
    def validate_zip_structure(cls, file_content: bytes) -> None:
        """Validate ZIP file structure"""
        try:
            with zipfile.ZipFile(BytesIO(file_content), 'r') as zf:
                # Test that ZIP is readable
                test_result = zf.testzip()
                if test_result is not None:
                    raise cls.ValidationError(f"Corrupted ZIP file: {test_result}")

                # Check that ZIP is not empty
                if len(zf.namelist()) == 0:
                    raise cls.ValidationError("ZIP file is empty")
        except zipfile.BadZipFile as e:
            raise cls.ValidationError(f"Invalid ZIP file: {e}")
        except Exception as e:
            raise cls.ValidationError(f"Failed to read ZIP: {e}")

    @classmethod
    def analyze_zip(cls, file_content: bytes) -> Tuple[Dict[str, Any], int, Optional[str]]:
        """Analyze ZIP and return manifest, entry count, and root folder"""

        with zipfile.ZipFile(BytesIO(file_content), 'r') as zf:
            entries = []
            file_list = zf.namelist()
            root_folders = set()

            for entry_name in file_list:
                # Skip directories (they end with /)
                if entry_name.endswith('/'):
                    # Extract root folder name
                    parts = entry_name.split('/')
                    if len(parts) >= 1:
                        root_folders.add(parts[0])
                    continue

                # Get file extension
                path = Path(entry_name)
                extension = path.suffix.lower() or "no_extension"

                # Get file size from ZipInfo
                info = zf.getinfo(entry_name)
                size_bytes = info.file_size

                # Create entry
                entry = ZipManifestEntry.to_dict(entry_name, extension, size_bytes)
                entries.append(entry)

                # Track root folder
                parts = entry_name.split('/')
                if len(parts) > 1:
                    root_folders.add(parts[0])

            # Detect root folder name
            root_folder_name = None
            if len(root_folders) == 1:
                root_folder_name = list(root_folders)[0]

            # Build manifest with aggregated counts
            counts = {"total": len(entries)}
            for kind in ['image', 'video', 'csv', 'other']:
                counts[kind] = sum(1 for e in entries if e['kind'] == kind)

            manifest = {
                "entries": entries,
                "counts": counts,
            }

            return manifest, len(entries), root_folder_name

    @classmethod
    def validate_and_analyze(
        cls,
        file_content: bytes,
        mime_type: str
    ) -> Tuple[Dict[str, Any], int, Optional[str]]:
        """Complete validation and analysis pipeline"""

        # Validate file
        cls.validate_file(file_content, mime_type)

        # Validate ZIP structure
        cls.validate_zip_structure(file_content)

        # Analyze and return results
        manifest, entry_count, root_folder_name = cls.analyze_zip(file_content)

        return manifest, entry_count, root_folder_name
