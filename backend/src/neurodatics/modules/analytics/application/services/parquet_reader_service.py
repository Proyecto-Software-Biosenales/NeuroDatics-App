import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .....infra.storage.gdrive_client import GoogleDriveClient
from .....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from ....integrations.google_drive.infrastructure.repository import SystemIntegrationRepository
from ....participants.domain.entities import Participant
from ....projects.domain.entities import Project, ProjectFile
from neurodatics.shared.cache_generation import normalize_generation
from ...infrastructure.parquet_cache import ParquetCacheService

logger = logging.getLogger(__name__)

GOOGLE_DRIVE_RECONNECT_MESSAGE = (
    "La conexion de Google Drive expiro o fue revocada. "
    "Reconecta Google Drive para generar un refresh token nuevo."
)

USER_PARQUET_METADATA_TYPE = "user_parquet"

# How a Parquet was matched to the requested participant. The first two are
# identity-based and exact; the third is the historical positional guess.
RESOLUTION_FILE_METADATA = "file_metadata.participant_code"
RESOLUTION_BLOCK_METADATA = "file_metadata.block_metadata.participant_code"
RESOLUTION_LEGACY_POSITIONAL = "legacy.user_index_position"


class ParquetIdentityError(ValueError):
    """Participant could not be mapped to exactly one Parquet file.

    Subclasses ``ValueError`` so the analytics routes, which already translate
    ``ValueError``/``FileNotFoundError`` into a 404 carrying the message,
    surface the reason instead of silently serving a different participant.
    """


class ParticipantParquetNotFoundError(ParquetIdentityError):
    """No Parquet file in the project belongs to the requested participant."""


class AmbiguousParquetIdentityError(ParquetIdentityError):
    """Participant identity in the stored metadata does not select one file."""


@dataclass(frozen=True)
class ParquetResolution:
    """Outcome of mapping a participant code onto a stored Parquet file."""

    project_file: ProjectFile
    participant_code: str
    strategy: str

    @property
    def is_legacy(self) -> bool:
        return self.strategy == RESOLUTION_LEGACY_POSITIONAL


@dataclass(frozen=True)
class _UserParquetCandidate:
    project_file: ProjectFile
    # Normalized participant code carried by the row, empty when the row has none.
    participant_code: str
    # Which metadata field carried the code, empty when the row has none.
    strategy: str


def _is_invalid_google_grant_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "invalid_grant" in message or "expired or revoked" in message


def _normalize_participant_code(value: Any) -> str:
    """Codes are compared exactly; only surrounding whitespace is ignored.

    The CSV importer already strips the code it extracts, so this never folds
    two genuinely different codes together - it only keeps a stray trailing
    space in a database row from hiding a file.
    """

    if value is None:
        return ""
    return str(value).strip()


def _participant_identity(metadata: Dict[str, Any]) -> Tuple[str, str]:
    """Read the participant code a Parquet row claims, newest layout first."""

    top_level = _normalize_participant_code(metadata.get("participant_code"))
    if top_level:
        return top_level, RESOLUTION_FILE_METADATA

    # Transitional: uploads made before participant_code was promoted to the top
    # level still carry it inside the serialized CSV block metadata.
    block_metadata = metadata.get("block_metadata")
    if isinstance(block_metadata, dict):
        nested = _normalize_participant_code(block_metadata.get("participant_code"))
        if nested:
            return nested, RESOLUTION_BLOCK_METADATA

    return "", ""


def _describe_files(candidates: List[_UserParquetCandidate]) -> str:
    return ", ".join(sorted(str(candidate.project_file.filename) for candidate in candidates))


class ParquetReaderService:
    def __init__(self, db: AsyncSession):
        self._db = db
        self._cache = ParquetCacheService()

    async def resolve_cache_generation(self, project_id: UUID) -> int:
        """Read the ingestion generation the disk cache is keyed by.

        A re-upload bumps this counter so the fresh Parquet lands in a new
        directory instead of overwriting a file a concurrent reader may still
        hold open, and the previous upload's file becomes unreachable rather
        than being served as if it were current. A project row that predates
        the column reads as 0, which is the generation it already caches under.
        """

        result = await self._db.execute(
            select(Project.ingestion_generation).where(Project.id == project_id)
        )
        return normalize_generation(result.scalar_one_or_none())

    async def read(
        self,
        project_id: UUID,
        participant_code: str,
        generation: object = None,
    ) -> pd.DataFrame:
        """Load participant Parquet from cache or Drive."""
        if generation is None:
            generation = await self.resolve_cache_generation(project_id)
        cached = self._cache.read_dataframe(project_id, participant_code, generation)
        if cached is not None:
            return cached

        resolution = await self.resolve_user_parquet(project_id, participant_code)
        parquet_file = resolution.project_file

        client = await self._build_drive_client()
        if client is None:
            raise RuntimeError("Google Drive integration not configured")

        import anyio

        try:
            content = await anyio.to_thread.run_sync(
                lambda: client.download_file_content(parquet_file.external_id)
            )
        except Exception as exc:
            if _is_invalid_google_grant_error(exc):
                logger.warning("Google Drive OAuth token expired or revoked while reading parquet")
                raise RuntimeError(GOOGLE_DRIVE_RECONNECT_MESSAGE) from exc
            raise RuntimeError("No se pudo descargar el parquet desde Google Drive") from exc

        path = self._cache.put(project_id, participant_code, content, generation)
        return pd.read_parquet(path)

    async def read_from_cache_only(
        self,
        project_id: UUID,
        participant_code: str,
        generation: object = None,
    ) -> Optional[pd.DataFrame]:
        """Read only from disk cache - no Drive download. Returns None if not cached."""
        if generation is None:
            generation = await self.resolve_cache_generation(project_id)
        return self._cache.read_dataframe(project_id, participant_code, generation)

    async def resolve_user_parquet(
        self,
        project_id: UUID,
        participant_code: str,
    ) -> ParquetResolution:
        """Map a participant code onto exactly one stored user Parquet file.

        Files written by the current importer carry the participant code in
        their metadata, so resolution never depends on the order participant
        rows happen to have in the database. Files old enough to carry no
        identity at all keep the historical positional mapping, but only when
        that mapping is unambiguous.
        """

        requested = _normalize_participant_code(participant_code)
        if not requested:
            raise ParquetIdentityError("participant_code is required to select a Parquet file")

        candidates = await self._load_user_parquet_candidates(project_id)
        if not candidates:
            raise ParticipantParquetNotFoundError(
                f"No processed Parquet file for participant='{requested}'"
            )

        identified = [candidate for candidate in candidates if candidate.participant_code]
        if identified:
            return self._resolve_by_identity(requested, identified, candidates)

        return await self._resolve_by_legacy_position(project_id, requested, candidates)

    def _resolve_by_identity(
        self,
        requested: str,
        identified: List[_UserParquetCandidate],
        candidates: List[_UserParquetCandidate],
    ) -> ParquetResolution:
        matches = [
            candidate for candidate in identified if candidate.participant_code == requested
        ]
        if len(matches) == 1:
            match = matches[0]
            return ParquetResolution(
                project_file=match.project_file,
                participant_code=requested,
                strategy=match.strategy,
            )

        if len(matches) > 1:
            raise AmbiguousParquetIdentityError(
                f"{len(matches)} Parquet files claim participant '{requested}' "
                f"({_describe_files(matches)}); the stored participant metadata is "
                "duplicated, so no file can be selected safely. Re-upload the project ZIP."
            )

        known_codes = sorted({candidate.participant_code for candidate in identified})
        known = ", ".join(known_codes) if known_codes else "none"

        unidentified = [candidate for candidate in candidates if not candidate.participant_code]
        if unidentified:
            raise AmbiguousParquetIdentityError(
                f"Participant '{requested}' matches no Parquet file, and "
                f"{len(unidentified)} Parquet file(s) in this project carry no participant "
                f"metadata ({_describe_files(unidentified)}). Selecting one by position "
                f"could return another participant's data. Known participants: {known}. "
                "Re-upload the project ZIP."
            )

        raise ParticipantParquetNotFoundError(
            f"No Parquet file for participant='{requested}' in this project. "
            f"Known participants: {known}"
        )

    async def _resolve_by_legacy_position(
        self,
        project_id: UUID,
        requested: str,
        candidates: List[_UserParquetCandidate],
    ) -> ParquetResolution:
        """Historical mapping for Parquets stored before identity was recorded.

        The only link those files have to a participant is the position of the
        participant row, so this refuses to answer whenever that position is not
        uniquely determined rather than returning a plausible wrong file.
        """

        participants = await self._load_participants(project_id)
        codes = [
            _normalize_participant_code(participant.participant_code)
            for participant in participants
        ]

        if requested not in codes:
            raise ParticipantParquetNotFoundError(
                f"Participant '{requested}' not found in project"
            )

        if codes.count(requested) > 1:
            raise AmbiguousParquetIdentityError(
                f"Participant code '{requested}' appears {codes.count(requested)} times in this "
                "project and its Parquet files carry no participant metadata, so the file "
                "belonging to this participant cannot be identified. Re-upload the project ZIP."
            )

        if len(codes) != len(candidates):
            raise AmbiguousParquetIdentityError(
                f"This project has {len(codes)} participant(s) but {len(candidates)} Parquet "
                "file(s) without participant metadata, so they cannot be matched by position. "
                "Re-upload the project ZIP."
            )

        user_index = codes.index(requested) + 1
        target_filename = f"user{user_index}.parquet"
        matches = [
            candidate
            for candidate in candidates
            if candidate.project_file.filename == target_filename
        ]

        if len(matches) > 1:
            raise AmbiguousParquetIdentityError(
                f"{len(matches)} Parquet files are named '{target_filename}' in this project; "
                "the legacy positional mapping is ambiguous. Re-upload the project ZIP."
            )
        if not matches:
            raise ParticipantParquetNotFoundError(
                f"No processed Parquet file for participant='{requested}'"
            )

        logger.warning(
            "Resolved participant '%s' in project %s by legacy position (%s): these Parquet "
            "files carry no participant metadata. Re-upload the project ZIP to make the "
            "mapping explicit.",
            requested,
            project_id,
            target_filename,
        )
        return ParquetResolution(
            project_file=matches[0].project_file,
            participant_code=requested,
            strategy=RESOLUTION_LEGACY_POSITIONAL,
        )

    async def _load_user_parquet_candidates(
        self,
        project_id: UUID,
    ) -> List[_UserParquetCandidate]:
        result = await self._db.execute(
            select(ProjectFile).where(
                ProjectFile.project_id == project_id,
                ProjectFile.kind == "processed_parquet",
                ProjectFile.deleted_at.is_(None),
            )
        )

        candidates: List[_UserParquetCandidate] = []
        for project_file in result.scalars().all():
            metadata = project_file.file_metadata or {}
            if metadata.get("type") != USER_PARQUET_METADATA_TYPE:
                continue
            code, strategy = _participant_identity(metadata)
            candidates.append(
                _UserParquetCandidate(
                    project_file=project_file,
                    participant_code=code,
                    strategy=strategy,
                )
            )
        return candidates

    async def _load_participants(self, project_id: UUID) -> List[Participant]:
        result = await self._db.execute(
            select(Participant)
            .where(Participant.project_id == project_id)
            .order_by(Participant.created_at, Participant.id)
        )
        return list(result.scalars().all())

    async def _build_drive_client(self) -> Optional[GoogleDriveClient]:
        """Create isolated Drive client (same pattern as projects module)."""
        repository = SystemIntegrationRepository(self._db)
        integration = await repository.get_by_provider("google_drive")
        if not integration:
            return None

        refresh_token = integration.get("refresh_token")
        if not refresh_token:
            return None

        credentials = build_google_drive_oauth_credentials(
            refresh_token=refresh_token,
            scope=integration.get("scope"),
        )
        client = GoogleDriveClient()
        client.set_oauth_credentials(credentials)
        return client
