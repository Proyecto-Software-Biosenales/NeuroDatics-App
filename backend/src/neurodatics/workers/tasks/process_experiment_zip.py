"""Background task for processing experiment ZIP uploads.

This task is scaffolded for future use when the ingestion pipeline is
decoupled from the synchronous HTTP endpoint.  Currently the endpoint
calls ``UploadExperimentZipUseCase.execute()`` directly in the request
handler.  To switch to background processing, enqueue this task via::

    from rq import Queue
    q = Queue(connection=get_redis_client())
    q.enqueue(process_experiment_zip_task, job_id=..., project_id=..., ...)
"""

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


def process_experiment_zip_task(
    job_id: str,
    project_id: str,
    owner_id: str,
    file_content: bytes,
    filename: str,
    mime_type: str,
) -> None:
    """Process an experiment ZIP upload in the RQ worker process.

    This function will create its own async event loop and DB session,
    update the corresponding ProcessingJob status and the project's
    ingestion_status through the full pipeline.

    Not actively enqueued yet — see module docstring.
    """
    logger.info(
        "process_experiment_zip_task called (job_id=%s, project_id=%s) — stub, not implemented",
        job_id,
        project_id,
    )
