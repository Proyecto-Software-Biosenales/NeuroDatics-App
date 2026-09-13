"""The single transaction that makes a prepared ingestion authoritative."""

from datetime import datetime, timezone
from copy import deepcopy

from ....scenaries.domain.entities import AOI


def preserve_unchanged_stimulus_annotations(project, files, scenaries):
    """Carry AOIs forward only for the exact same stimulus bytes and geometry."""
    old_files = {
        file.id: file
        for file in getattr(project, "files", [])
        if file.deleted_at is None
    }
    new_files = {file.id: file for file in files}
    candidates = {}
    for old in getattr(project, "scenaries", []):
        candidates.setdefault(old.source_entry_path, []).append(old)
    for current in scenaries:
        matches = candidates.get(current.source_entry_path, [])
        if len(matches) != 1:
            continue
        previous = matches[0]
        old_file, new_file = old_files.get(previous.file_id), new_files.get(
            current.file_id
        )
        if old_file is None or new_file is None or not old_file.checksum_sha256:
            continue
        if old_file.checksum_sha256 != new_file.checksum_sha256:
            continue
        if (previous.type, previous.width, previous.height) != (
            current.type,
            current.width,
            current.height,
        ):
            continue
        current.aois = [
            AOI(
                scenaries_id=current.id,
                name=aoi.name,
                color=aoi.color,
                shape_type=aoi.shape_type,
                shape=deepcopy(aoi.shape),
            )
            for aoi in previous.aois
        ]


async def publish_ingestion(
    repository, lifecycle, files, scenaries, participant_codes, sensors, root
):
    project_id = lifecycle.project_id
    await lifecycle.check_canceled()
    # Take the attempt row before project/file rows so recovery takes locks in
    # the same order. This receipt remains invisible until the entire swap commits.
    await lifecycle.prepare_publication()
    await repository.soft_delete_active_files(project_id)
    await repository.purge_files_by_kind(project_id, "experiment_zip")
    await repository.clear_project_scenaries(project_id)
    await repository.add_files(files)
    await repository.add_scenaries(scenaries)
    await repository.reconcile_ingestion_metadata(
        project_id, participant_codes, sensors
    )
    await lifecycle.check_canceled()
    await repository.update_project_ingestion(
        project_id,
        {
            "ingestion_status": "READY",
            "ingestion_error": None,
            "last_ingested_at": datetime.now(timezone.utc),
            "storage_provider": "gdrive",
            "drive_root_folder_id": root["id"],
            "drive_root_folder_name": root["name"],
            "drive_root_folder_url": root["url"],
        },
    )
    generation = await repository.bump_ingestion_generation(project_id)
    await repository.commit()
    lifecycle.published = True
    return generation
