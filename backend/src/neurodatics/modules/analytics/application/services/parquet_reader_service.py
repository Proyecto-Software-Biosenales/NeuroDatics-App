import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .....config.settings import settings
from ....integrations.storage_provider import build_isolated_drive_client
from ....participants.domain.entities import Participant
from ....projects.domain.entities import Project, ProjectFile
from neurodatics.shared.cache_generation import normalize_generation
from ...domain.parquet_projection import ParquetProjection
from ...infrastructure.parquet_cache import ParquetCacheService, read_parquet_frame
from ...infrastructure.singleflight import parquet_flights, settled_thread

logger = logging.getLogger(__name__)

GOOGLE_DRIVE_RECONNECT_MESSAGE = (
    "La conexion de Google Drive expiro o fue revocada. "
    "Reconecta Google Drive para generar un refresh token nuevo."
)

USER_PARQUET_METADATA_TYPE = "user_parquet"

STORAGE_NAME = "el almacenamiento local" if settings.is_local else "Google Drive"

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
class PreparedParquetRead:
    """Scalar-only input safe to consume after request DB work has finished."""

    project_id: UUID
    participant_code: str
    generation: int
    cached_path: Optional[Path] = None
    file_id: str = ""
    external_id: str = ""


@dataclass(frozen=True)
class PreparedParquetBatch:
    reads: Dict[str, PreparedParquetRead]
    errors: Dict[str, ParquetIdentityError]
    storage_client: Any


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
        *, projection: Optional[ParquetProjection] = None,
    ) -> pd.DataFrame:
        """Load a full frame or projection; download still transfers the full file."""
        if generation is None:
            generation = await self.resolve_cache_generation(project_id)
        cached = await settled_thread(
            lambda: self._cache.read_dataframe(
                project_id, participant_code, generation,
                **({"projection": projection} if projection is not None else {}),
            )
        )
        if cached is not None:
            return cached

        resolution = await self.resolve_user_parquet(project_id, participant_code)
        parquet_file = resolution.project_file

        client = await self._build_drive_client()
        prepared = PreparedParquetRead(
            project_id=project_id,
            participant_code=participant_code,
            generation=normalize_generation(generation),
            file_id=str(getattr(parquet_file, "id", parquet_file.external_id)),
            external_id=str(parquet_file.external_id),
        )
        return await self.read_prepared(prepared, client, projection=projection)

    async def read_prepared(
        self,
        prepared: PreparedParquetRead,
        storage_client: Any,
        *,
        projection: Optional[ParquetProjection] = None,
    ) -> pd.DataFrame:
        """Read a pre-authorized scalar descriptor without DB/ORM access."""

        if prepared.cached_path is not None:
            try:
                return await settled_thread(
                    lambda: read_parquet_frame(prepared.cached_path, projection)
                )
            except OSError:
                # A cache janitor can unlink between prepare/get and decode. The
                # descriptor already carries the exact file identity/generation,
                # so recovery remains DB-free and cannot switch ingestions.
                logger.info(
                    "Prepared Parquet cache path disappeared for project=%s participant=%s generation=%s; retrying exact storage identity",
                    prepared.project_id,
                    prepared.participant_code,
                    prepared.generation,
                )
        if storage_client is None:
            raise RuntimeError(f"{STORAGE_NAME} integration not configured")

        cache = self._cache
        key = (
            str(prepared.project_id),
            prepared.participant_code,
            prepared.file_id,
            prepared.external_id,
            prepared.generation,
        )

        async def obtain():
            # Another endpoint/projection may have published the complete file.
            path = cache.get(
                prepared.project_id,
                prepared.participant_code,
                prepared.generation,
            )
            if path is not None:
                return path
            try:
                content = await settled_thread(
                    lambda: storage_client.download_file_content(prepared.external_id)
                )
            except Exception as exc:
                if _is_invalid_google_grant_error(exc):
                    logger.warning("Google Drive OAuth token expired or revoked while reading parquet")
                    raise RuntimeError(GOOGLE_DRIVE_RECONNECT_MESSAGE) from exc
                raise RuntimeError(f"No se pudo descargar el parquet desde {STORAGE_NAME}") from exc
            # Publish atomically as before; never decode partial temp bytes.
            return await settled_thread(
                lambda: cache.put(
                    prepared.project_id,
                    prepared.participant_code,
                    content,
                    prepared.generation,
                )
            )

        path = await parquet_flights.run(key, obtain)
        # Only the immutable file location is shared, never a mutable frame.
        return await settled_thread(lambda: read_parquet_frame(path, projection))

    async def prepare_batch(
        self,
        project_id: UUID,
        participant_codes: List[str],
        generation: object,
    ) -> PreparedParquetBatch:
        """Resolve cache/identity/OAuth once before concurrent report reads."""

        if generation is None:
            generation = await self.resolve_cache_generation(project_id)
        resolved_generation = normalize_generation(generation)
        ordered_codes = list(dict.fromkeys(str(code) for code in participant_codes))
        cached_paths = await settled_thread(
            lambda: {
                code: self._cache.get(project_id, code, resolved_generation)
                for code in ordered_codes
            }
        )
        # Resolve every identity before workers, even for a warm path. Besides
        # pinning exact/legacy semantics, these scalars allow DB-free recovery if
        # the media janitor removes a path between prepare and decode.
        resolutions, errors = await self.resolve_user_parquets(project_id, ordered_codes)
        reads = {}
        for code, resolution in resolutions.items():
            project_file = resolution.project_file
            reads[code] = PreparedParquetRead(
                project_id=project_id,
                participant_code=code,
                generation=resolved_generation,
                cached_path=cached_paths.get(code),
                file_id=str(getattr(project_file, "id", project_file.external_id)),
                external_id=str(project_file.external_id),
            )
        client = await self._build_drive_client() if resolutions else None
        return PreparedParquetBatch(reads=reads, errors=errors, storage_client=client)

    async def read_from_cache_only(
        self,
        project_id: UUID,
        participant_code: str,
        generation: object = None,
        *, projection: Optional[ParquetProjection] = None,
    ) -> Optional[pd.DataFrame]:
        """Read only from disk cache - no Drive download. Returns None if not cached."""
        if generation is None:
            generation = await self.resolve_cache_generation(project_id)
        return await settled_thread(
            lambda: self._cache.read_dataframe(
                project_id, participant_code, generation,
                **({"projection": projection} if projection is not None else {}),
            )
        )

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

        resolved, errors = await self.resolve_user_parquets(project_id, [participant_code])
        if participant_code in errors:
            raise errors[participant_code]
        return resolved[participant_code]

    async def resolve_user_parquets(
        self,
        project_id: UUID,
        participant_codes: List[str],
    ) -> Tuple[Dict[str, ParquetResolution], Dict[str, ParquetIdentityError]]:
        """Resolve a participant batch with one candidate query (plus legacy rows)."""

        requested_items = list(
            dict.fromkeys(
                (str(code), _normalize_participant_code(code))
                for code in participant_codes
            )
        )
        resolved: Dict[str, ParquetResolution] = {}
        errors: Dict[str, ParquetIdentityError] = {}
        valid_items = []
        for original, requested in requested_items:
            if requested:
                valid_items.append((original, requested))
            else:
                errors[original] = ParquetIdentityError(
                    "participant_code is required to select a Parquet file"
                )
        if not valid_items:
            return resolved, errors

        candidates = await self._load_user_parquet_candidates(project_id)
        if not candidates:
            for original, requested in valid_items:
                errors[original] = ParticipantParquetNotFoundError(
                    f"No processed Parquet file for participant='{requested}'"
                )
            return resolved, errors

        identified = [candidate for candidate in candidates if candidate.participant_code]
        participants = None
        if not identified:
            participants = await self._load_participants(project_id)

        for original, requested in valid_items:
            try:
                if identified:
                    resolution = self._resolve_by_identity(requested, identified, candidates)
                else:
                    resolution = self._resolve_by_legacy_position(
                        project_id,
                        requested,
                        candidates,
                        participants or [],
                    )
                resolved[original] = resolution
            except ParquetIdentityError as exc:
                errors[original] = exc
        return resolved, errors

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

    def _resolve_by_legacy_position(
        self,
        project_id: UUID,
        requested: str,
        candidates: List[_UserParquetCandidate],
        participants: List[Participant],
    ) -> ParquetResolution:
        """Historical mapping for Parquets stored before identity was recorded.

        The only link those files have to a participant is the position of the
        participant row, so this refuses to answer whenever that position is not
        uniquely determined rather than returning a plausible wrong file.
        """

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

    async def _build_drive_client(self):
        """Isolated store handle: a Drive client in server mode, the local store otherwise."""
        return await build_isolated_drive_client(self._db)
