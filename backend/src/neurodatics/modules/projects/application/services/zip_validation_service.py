import mimetypes
import os
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Tuple

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

IMAGES_FOLDER_NAME = "images"
VIDEOS_FOLDER_NAME = "videos"
ACQUISITION_FOLDER_NAME = "acquisition"
SCENARY_ALLOWED_FOLDERS = {IMAGES_FOLDER_NAME, VIDEOS_FOLDER_NAME}

# Acquisition sub-folders are named like:
#   Sujet_1001014126_Scenario_Scenario 1_Rec1
# The scenario segment may itself contain underscores and spaces, so it is matched
# lazily between the "_Scenario_" marker and the trailing "_Rec<n>".
ACQUISITION_FOLDER_PATTERN = re.compile(
    r"^sujet[_\s]*(?P<subject>[^_]+)_scenario[_\s]*(?P<scenario>.+?)_rec[_\s]*(?P<recording>\d+)$",
    re.IGNORECASE,
)


@dataclass
class ZipManifestEntry:
    source_entry_path: str
    filename: str
    extension: str
    mime_type: str
    size_bytes: int
    kind: str


@dataclass
class AcquisitionRecording:
    """One `Sujet_..._Scenario_..._RecN` folder found under `Acquisition/`."""

    folder_name: str
    subject_code: Optional[str]
    scenario_name: Optional[str]
    recording_index: Optional[int]
    documents: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "folder_name": self.folder_name,
            "subject_code": self.subject_code,
            "scenario_name": self.scenario_name,
            "recording_index": self.recording_index,
            "documents": list(self.documents),
        }


@dataclass
class AcquisitionSummary:
    """Defaults derived from `Acquisition/`. Never persisted, only echoed back."""

    folder_path: Optional[str] = None
    recordings: List[AcquisitionRecording] = field(default_factory=list)

    @property
    def present(self) -> bool:
        return self.folder_path is not None

    def default_participant_codes(self) -> List[str]:
        codes = [rec.subject_code for rec in self.recordings if rec.subject_code]
        return list(dict.fromkeys(codes))

    def default_scenario_names(self) -> List[str]:
        names = [rec.scenario_name for rec in self.recordings if rec.scenario_name]
        return list(dict.fromkeys(names))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "present": self.present,
            "folder_path": self.folder_path,
            "recordings": [rec.to_dict() for rec in self.recordings],
            "default_participant_codes": self.default_participant_codes(),
            "default_scenario_names": self.default_scenario_names(),
        }


@dataclass
class UploadSelection:
    """The answers a client gives to the structure questions below."""

    csv_entry_path: Optional[str] = None
    images_folder: Optional[str] = None
    videos_folder: Optional[str] = None
    acquisition_folder: Optional[str] = None
    allow_missing_images: bool = False
    allow_missing_videos: bool = False


@dataclass
class ClarificationQuestion:
    code: str
    field: str
    kind: str  # "choice" | "confirm"
    message: str
    options: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "field": self.field,
            "kind": self.kind,
            "message": self.message,
            "options": list(self.options),
        }


@dataclass
class StructureReport:
    csv_paths: List[str] = field(default_factory=list)
    images_folders: List[str] = field(default_factory=list)
    videos_folders: List[str] = field(default_factory=list)
    acquisition_folders: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "csv_files": list(self.csv_paths),
            "images_folders": list(self.images_folders),
            "videos_folders": list(self.videos_folders),
            "acquisition_folders": list(self.acquisition_folders),
        }


class ZipValidationService:
    ACCEPTED_MIME_TYPES = {
        "application/zip",
        "application/x-zip-compressed",
    }

    _INTEGRITY_CHUNK_SIZE = 1024 * 1024

    class ValidationError(Exception):
        pass

    class ClarificationRequired(Exception):
        """The archive is well-formed but ambiguous; the user has to choose."""

        def __init__(self, questions: List[ClarificationQuestion], report: StructureReport):
            self.questions = questions
            self.report = report
            super().__init__("; ".join(question.message for question in questions))

        def to_dict(self) -> Dict[str, Any]:
            return {
                "error": "structure_clarification_required",
                "message": (
                    "La carpeta necesita una confirmacion antes de procesarse."
                ),
                "questions": [question.to_dict() for question in self.questions],
                "detected": self.report.to_dict(),
            }

    # ------------------------------------------------------------------ limits

    @classmethod
    def get_max_file_size_bytes(cls) -> int:
        return int(settings.project_zip_max_size_mb) * 1024 * 1024

    @classmethod
    def get_max_uncompressed_bytes(cls) -> int:
        return int(settings.project_zip_max_uncompressed_mb) * 1024 * 1024

    @classmethod
    def get_max_entry_uncompressed_bytes(cls) -> int:
        return int(settings.project_zip_max_entry_uncompressed_mb) * 1024 * 1024

    # -------------------------------------------------------------- classifying

    @classmethod
    def infer_kind(cls, extension: str) -> str:
        return KIND_BY_EXTENSION.get(extension.lower(), "other_asset")

    @classmethod
    def infer_mime_type(cls, filename: str) -> str:
        guessed, _ = mimetypes.guess_type(filename)
        return guessed or "application/octet-stream"

    @classmethod
    def normalize_entry_path(cls, path: str) -> str:
        return path.replace("\\", "/").strip("/")

    @classmethod
    def is_useful_entry(cls, entry_path: str) -> bool:
        normalized = cls.normalize_entry_path(entry_path)
        if not normalized:
            return False
        if normalized.startswith("__MACOSX/"):
            return False
        return True

    @classmethod
    def _named_ancestor(cls, entry_path: PurePosixPath, folder_name: str) -> Optional[str]:
        """Return the deepest ancestor directory of `entry_path` named `folder_name`."""
        parts = entry_path.parent.parts
        for index in range(len(parts) - 1, -1, -1):
            if parts[index].lower() == folder_name:
                return "/".join(parts[: index + 1])
        return None

    @classmethod
    def _is_inside_scenary_folder(cls, entry_path: PurePosixPath) -> bool:
        """True when file is inside an Images or Videos directory (case-insensitive)."""
        parent_parts = [part.lower() for part in entry_path.parent.parts]
        return any(part in SCENARY_ALLOWED_FOLDERS for part in parent_parts)

    # ------------------------------------------------------------- entry checks

    @classmethod
    def validate_upload(cls, filename: str, mime_type: str, size_bytes: int) -> None:
        if not filename.lower().endswith(".zip"):
            raise cls.ValidationError("El archivo debe tener extension .zip")

        if mime_type and mime_type not in cls.ACCEPTED_MIME_TYPES:
            raise cls.ValidationError("MIME type no soportado para ZIP")

        if size_bytes <= 0:
            raise cls.ValidationError("El archivo ZIP esta vacio")

        if size_bytes > cls.get_max_file_size_bytes():
            raise cls.ValidationError(
                f"ZIP excede el maximo permitido de {settings.project_zip_max_size_mb}MB"
            )

    @classmethod
    def open_archive(cls, zip_path: str) -> zipfile.ZipFile:
        try:
            zip_file = zipfile.ZipFile(zip_path, "r")
        except zipfile.BadZipFile as exc:
            raise cls.ValidationError("No se puede abrir el ZIP") from exc

        if not zip_file.infolist():
            zip_file.close()
            raise cls.ValidationError("El ZIP esta vacio")

        return zip_file

    @classmethod
    def enforce_archive_limits(cls, zip_file: zipfile.ZipFile, compressed_size_bytes: int) -> None:
        """Zip-bomb guard, evaluated from the central directory only.

        Nothing is decompressed here, so a hostile archive is rejected before it
        can cost any CPU or disk. The declared sizes are not trusted afterwards:
        `ZipExtractionService` re-checks the real byte count while extracting.
        """
        infos = [info for info in zip_file.infolist() if not info.is_dir()]

        max_entries = max(1, int(settings.project_zip_max_entries))
        if len(infos) > max_entries:
            raise cls.ValidationError(
                f"El ZIP contiene demasiadas entradas ({len(infos)}). Maximo permitido: {max_entries}"
            )

        max_entry_bytes = cls.get_max_entry_uncompressed_bytes()
        max_total_bytes = cls.get_max_uncompressed_bytes()
        max_ratio = max(1.0, float(settings.project_zip_max_compression_ratio))

        total_uncompressed = 0
        for info in infos:
            declared = max(0, int(info.file_size or 0))

            if declared > max_entry_bytes:
                raise cls.ValidationError(
                    f"La entrada '{info.filename}' se descomprime a "
                    f"{declared // (1024 * 1024)}MB y supera el maximo por archivo de "
                    f"{settings.project_zip_max_entry_uncompressed_mb}MB"
                )

            compressed = max(0, int(info.compress_size or 0))
            if compressed > 0 and (declared / compressed) > max_ratio:
                raise cls.ValidationError(
                    f"La entrada '{info.filename}' tiene una tasa de compresion sospechosa "
                    f"({declared / compressed:.0f}:1). Maximo permitido: {max_ratio:.0f}:1"
                )

            total_uncompressed += declared
            if total_uncompressed > max_total_bytes:
                raise cls.ValidationError(
                    "El contenido descomprimido del ZIP supera el maximo permitido de "
                    f"{settings.project_zip_max_uncompressed_mb}MB"
                )

        if compressed_size_bytes > 0:
            overall_ratio = total_uncompressed / compressed_size_bytes
            if overall_ratio > max_ratio:
                raise cls.ValidationError(
                    f"El ZIP tiene una tasa de compresion sospechosa ({overall_ratio:.0f}:1). "
                    f"Maximo permitido: {max_ratio:.0f}:1"
                )

    # ----------------------------------------------------------- structure scan

    @classmethod
    def _parse_acquisition_folder_name(cls, folder_name: str) -> AcquisitionRecording:
        match = ACQUISITION_FOLDER_PATTERN.match(folder_name.strip())
        if not match:
            return AcquisitionRecording(
                folder_name=folder_name,
                subject_code=None,
                scenario_name=None,
                recording_index=None,
            )

        try:
            recording_index = int(match.group("recording"))
        except (TypeError, ValueError):
            recording_index = None

        return AcquisitionRecording(
            folder_name=folder_name,
            subject_code=match.group("subject").strip() or None,
            scenario_name=match.group("scenario").strip() or None,
            recording_index=recording_index,
        )

    @classmethod
    def scan_structure(
        cls,
        zip_file: zipfile.ZipFile,
    ) -> Tuple[StructureReport, AcquisitionSummary]:
        """Inventory the archive: CSVs, scenario folders and the Acquisition tree."""
        report = StructureReport()
        seen_images: Dict[str, str] = {}
        seen_videos: Dict[str, str] = {}
        seen_acquisition: Dict[str, str] = {}
        recordings_by_folder: Dict[str, AcquisitionRecording] = {}

        for info in zip_file.infolist():
            source_entry_path = cls.normalize_entry_path(info.filename)
            if not cls.is_useful_entry(source_entry_path):
                continue

            path = PurePosixPath(source_entry_path)

            # Directory entries still carry structure information even though they
            # hold no bytes, so scenario/acquisition folders are detected from both.
            search_path = path if not info.is_dir() else PurePosixPath(source_entry_path + "/_")

            acquisition_folder = cls._named_ancestor(search_path, ACQUISITION_FOLDER_NAME)

            # Anything nested under Acquisition/ is reference material. An
            # `Acquisition/Images` folder must not compete with the real one.
            if not acquisition_folder:
                images_folder = cls._named_ancestor(search_path, IMAGES_FOLDER_NAME)
                if images_folder:
                    seen_images.setdefault(images_folder.lower(), images_folder)

                videos_folder = cls._named_ancestor(search_path, VIDEOS_FOLDER_NAME)
                if videos_folder:
                    seen_videos.setdefault(videos_folder.lower(), videos_folder)

            if acquisition_folder:
                seen_acquisition.setdefault(acquisition_folder.lower(), acquisition_folder)

                relative = search_path.parent.parts[len(PurePosixPath(acquisition_folder).parts):]
                if relative:
                    recording_folder = relative[0]
                    recording = recordings_by_folder.get(recording_folder.lower())
                    if recording is None:
                        parsed = cls._parse_acquisition_folder_name(recording_folder)
                        # Only `Sujet_..._Scenario_..._RecN` folders are recordings.
                        # Anything else under Acquisition/ is unrelated reference
                        # material and must not inflate the recording count.
                        if parsed.subject_code is None:
                            continue
                        recording = parsed
                        recordings_by_folder[recording_folder.lower()] = recording
                    if not info.is_dir() and path.name not in recording.documents:
                        recording.documents.append(path.name)

            if not info.is_dir() and path.suffix.lower() == ".csv":
                # A CSV that lives inside Acquisition/ is reference material, not the
                # experiment data source, so it never becomes a processing candidate.
                if not acquisition_folder:
                    report.csv_paths.append(source_entry_path)

        report.images_folders = sorted(seen_images.values())
        report.videos_folders = sorted(seen_videos.values())
        report.acquisition_folders = sorted(seen_acquisition.values())
        report.csv_paths.sort()

        acquisition = AcquisitionSummary(
            folder_path=report.acquisition_folders[0] if len(report.acquisition_folders) == 1 else None,
            recordings=sorted(
                recordings_by_folder.values(),
                key=lambda rec: (rec.recording_index is None, rec.recording_index or 0, rec.folder_name),
            ),
        )

        return report, acquisition

    @classmethod
    def resolve_structure(
        cls,
        report: StructureReport,
        selection: UploadSelection,
    ) -> UploadSelection:
        """Turn the inventory + the user's answers into one unambiguous selection.

        Raises `ValidationError` when the archive can never be processed and
        `ClarificationRequired` when only the user can break the tie.
        """
        questions: List[ClarificationQuestion] = []

        # --- data source (.csv): exactly one, no way around it -----------------
        if not report.csv_paths:
            raise cls.ValidationError(
                "El ZIP debe contener obligatoriamente un archivo .csv con los datos del experimento"
            )

        resolved_csv = selection.csv_entry_path
        if len(report.csv_paths) == 1:
            resolved_csv = report.csv_paths[0]
        elif resolved_csv:
            if resolved_csv not in report.csv_paths:
                raise cls.ValidationError(
                    f"El archivo .csv seleccionado no existe en el ZIP: {resolved_csv}"
                )
        else:
            questions.append(
                ClarificationQuestion(
                    code="multiple_csv",
                    field="selected_csv_path",
                    kind="choice",
                    message=(
                        f"La carpeta contiene {len(report.csv_paths)} archivos .csv. "
                        "Selecciona cual debe procesar la aplicacion."
                    ),
                    options=list(report.csv_paths),
                )
            )

        resolved_images = cls._resolve_scenary_folder(
            folders=report.images_folders,
            chosen=selection.images_folder,
            allow_missing=selection.allow_missing_images,
            label="Images",
            choice_field="selected_images_folder",
            confirm_field="allow_missing_images",
            multiple_code="multiple_images_folders",
            missing_code="no_images_folder",
            missing_message=(
                "La carpeta no contiene ninguna subcarpeta 'Images'. "
                "Confirma si quieres continuar sin imagenes."
            ),
            questions=questions,
        )

        resolved_videos = cls._resolve_scenary_folder(
            folders=report.videos_folders,
            chosen=selection.videos_folder,
            allow_missing=selection.allow_missing_videos,
            label="Videos",
            choice_field="selected_videos_folder",
            confirm_field="allow_missing_videos",
            multiple_code="multiple_videos_folders",
            missing_code="no_videos_folder",
            missing_message=(
                "La carpeta no contiene ninguna subcarpeta 'Videos'. "
                "Confirma si quieres continuar sin videos."
            ),
            questions=questions,
        )

        # --- Acquisition: optional, but must not be ambiguous ------------------
        resolved_acquisition = selection.acquisition_folder
        if len(report.acquisition_folders) == 1:
            resolved_acquisition = report.acquisition_folders[0]
        elif len(report.acquisition_folders) > 1:
            if resolved_acquisition and resolved_acquisition in report.acquisition_folders:
                pass
            else:
                questions.append(
                    ClarificationQuestion(
                        code="multiple_acquisition_folders",
                        field="selected_acquisition_folder",
                        kind="choice",
                        message=(
                            f"La carpeta contiene {len(report.acquisition_folders)} subcarpetas "
                            "'Acquisition'. Selecciona cual debe usarse como referencia."
                        ),
                        options=list(report.acquisition_folders),
                    )
                )
        else:
            resolved_acquisition = None

        if questions:
            raise cls.ClarificationRequired(questions, report)

        return UploadSelection(
            csv_entry_path=resolved_csv,
            images_folder=resolved_images,
            videos_folder=resolved_videos,
            acquisition_folder=resolved_acquisition,
            allow_missing_images=resolved_images is None,
            allow_missing_videos=resolved_videos is None,
        )

    @classmethod
    def _resolve_scenary_folder(
        cls,
        *,
        folders: List[str],
        chosen: Optional[str],
        allow_missing: bool,
        label: str,
        choice_field: str,
        confirm_field: str,
        multiple_code: str,
        missing_code: str,
        missing_message: str,
        questions: List[ClarificationQuestion],
    ) -> Optional[str]:
        if len(folders) == 1:
            return folders[0]

        if not folders:
            if not allow_missing:
                questions.append(
                    ClarificationQuestion(
                        code=missing_code,
                        field=confirm_field,
                        kind="confirm",
                        message=missing_message,
                    )
                )
            return None

        if chosen:
            if chosen not in folders:
                raise cls.ValidationError(
                    f"La carpeta '{label}' seleccionada no existe en el ZIP: {chosen}"
                )
            return chosen

        questions.append(
            ClarificationQuestion(
                code=multiple_code,
                field=choice_field,
                kind="choice",
                message=(
                    f"La carpeta contiene {len(folders)} subcarpetas '{label}'. "
                    "Selecciona cual debe procesar la aplicacion."
                ),
                options=list(folders),
            )
        )
        return None

    # ---------------------------------------------------------------- manifest

    @classmethod
    def build_manifest(
        cls,
        zip_file: zipfile.ZipFile,
        selection: UploadSelection,
    ) -> Tuple[List[ZipManifestEntry], Dict[str, int], List[str]]:
        """Build the ingestion manifest from the resolved selection.

        Entries the user did not pick — extra CSVs, non-selected Images/Videos
        folders and everything under Acquisition/ — are reported as excluded and
        never uploaded, stored or decompressed.
        """
        entries: List[ZipManifestEntry] = []
        excluded: List[str] = []
        counts: Dict[str, int] = {"images": 0, "videos": 0, "csv": 0, "other": 0}

        for info in zip_file.infolist():
            if info.is_dir():
                continue

            source_entry_path = cls.normalize_entry_path(info.filename)
            if not cls.is_useful_entry(source_entry_path):
                continue

            path = PurePosixPath(source_entry_path)
            extension = path.suffix.lower()
            kind = cls.infer_kind(extension)

            # Acquisition is reference-only: parsed for defaults, never ingested.
            if cls._named_ancestor(path, ACQUISITION_FOLDER_NAME):
                excluded.append(source_entry_path)
                continue

            if kind == "raw_csv" and selection.csv_entry_path:
                if source_entry_path != selection.csv_entry_path:
                    excluded.append(source_entry_path)
                    continue

            # Only files under the selected Images/Videos folder are scenario assets.
            if kind == "scenario_image":
                folder = cls._named_ancestor(path, IMAGES_FOLDER_NAME)
                if not folder:
                    kind = "other_asset"
                elif selection.images_folder and folder != selection.images_folder:
                    excluded.append(source_entry_path)
                    continue
            elif kind == "scenario_video":
                folder = cls._named_ancestor(path, VIDEOS_FOLDER_NAME)
                if not folder:
                    kind = "other_asset"
                elif selection.videos_folder and folder != selection.videos_folder:
                    excluded.append(source_entry_path)
                    continue

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
                    size_bytes=max(0, int(info.file_size or 0)),
                    kind=kind,
                )
            )

        if not entries:
            raise cls.ValidationError("El ZIP no contiene archivos utiles")

        if counts["csv"] == 0:
            raise cls.ValidationError(
                "El ZIP debe contener obligatoriamente un archivo .csv con los datos del experimento"
            )

        return entries, counts, sorted(excluded)

    # ------------------------------------------------------------- entry point

    @classmethod
    def validate_and_analyze(
        cls,
        filename: str,
        mime_type: Optional[str],
        zip_path: str,
        selection: Optional[UploadSelection] = None,
    ) -> Tuple[List[ZipManifestEntry], Dict[str, int], UploadSelection, AcquisitionSummary, List[str]]:
        """Validate an on-disk archive and resolve it into an ingestion plan."""
        selection = selection or UploadSelection()
        compressed_size = os.path.getsize(zip_path)

        cls.validate_upload(filename=filename, mime_type=mime_type or "", size_bytes=compressed_size)

        zip_file = cls.open_archive(zip_path)
        try:
            cls.enforce_archive_limits(zip_file, compressed_size)
            report, acquisition = cls.scan_structure(zip_file)
            resolved = cls.resolve_structure(report, selection)

            if resolved.acquisition_folder is None:
                acquisition = AcquisitionSummary()
            else:
                acquisition.folder_path = resolved.acquisition_folder

            entries, counts, excluded = cls.build_manifest(zip_file, resolved)
            return entries, counts, resolved, acquisition, excluded
        finally:
            zip_file.close()
