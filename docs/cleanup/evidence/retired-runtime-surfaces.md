# Retiring unused runtime surfaces

Decision date: 2026-09-04. The user explicitly requested removing RQ and old Drive
HTTP endpoints if they contribute nothing to current functionality, while
preserving the current application. This deliberate retirement replaces the
earlier requirement to wait for a production tombstone observation window; it
does not establish that any deployment observation occurred.

## RQ: evidence before removal

- The only production RQ import is `workers/entrypoint.py` (`rq.Worker`). No live
  application code enqueues a job. The sole `Queue.enqueue` text is an example in
  `workers/tasks/process_experiment_zip.py`, whose function only logs a stub.
- `projects/api/routes.py` awaits `UploadExperimentZipUseCase.execute()` within
  the HTTP request. Upload, analytics, reports and deletion call Drive services
  directly; none depend on worker completion or on `/health/worker`.
- Current `docker-compose.yml` and `docker-compose.delivery.yml` independently
  start the same unused worker. `backend/Dockerfile` is shared with the API and
  requires no worker-specific edit. No tracked smoke script invokes the worker;
  the current deployment guide contained its network-preflight command.
- The read-only, filename-only scan of ignored `delivery/` found references in
  `NeuroDatics-App/docker-compose.yml`, `docs/NETWORK_DEPLOYMENT.md`,
  `Final-Instructions.md`, and its real `.env`. The frozen release and real
  environment files are intentionally preserved; they are not current source.
- `JOB_TIMEOUT` and `JOB_RESULT_TTL` have no runtime reader. Worker socket timeout
  and worker memory limits only configure the retired service.
- Redis remains required by analytics caching and readiness checks. Its service,
  URL, API connection pool, short read/connect timeouts and volumes are retained.
- Database migrations and the historical `processing_jobs` table are preserved;
  retiring a worker does not authorize dropping existing deployment data.

Stage A removes the worker service from both current Compose files and removes
its unused forwarding/root example keys. Current operational guides now describe
the four services; the older upload audit retains its history with a correction
note. Source, dependency and worker-only tests remain until Stage B so the two
commits separate disconnection from deletion. Updating deployments should use
`docker compose up -d --build --remove-orphans` to remove an old worker container.

Stage A was committed as `e89a975`. Stage B was completed in `5b9b450`: the RQ
entrypoint/task/package, queue placeholders, worker-only configuration and dependency
were removed after both Compose definitions passed validation. Redis remains in both
definitions for analytics caching and readiness.

## Drive audit: a dependency requiring a decision

The frontend has no `/api/integrations/google-drive` callers. Google login uses
`GET /api/auth/google/login-url` and `POST /api/auth/google/authorize`. That login
requests only `openid email profile` and does not persist a Drive refresh token.

The old integration callback is the only caller of
`SystemIntegrationRepository.upsert_provider_connection`. Existing upload,
Parquet analytics, report media and project deletion read that persisted global
Drive connection through `configure_gdrive_client_with_oauth`, the repository and
`infra/storage/gdrive_oauth_credentials.py`. Therefore existing credentials keep
working without the old routes, but deleting authorization/callback also removes
the current in-app way to create or reconnect that connection. This distinction
was reported before changing any Drive route; zero frontend callers alone is
insufficient evidence to retire the bootstrap/reconnection capability.

`GDRIVE_REFRESH_TOKEN` is not read by runtime code (including `getattr` and raw
environment lookups). Its old retention was based only on Compose/frozen-release
forwarding. The user has now authorized removing the unused current setting and
examples while retaining real environment files and the frozen release.

The final Drive decision kept `GET /authorize` and `GET /callback`. The seven other
operations (`status`, `disconnect`, `create-folder`, `sync-folder`,
`sync-folder-scheduled`, `sync-status`, `sync-tasks`) were unmounted in `bd6b2cd` and
their unused services/schemas/configuration deleted in `5b9b450`. Each retired path is
covered by an authenticated 404 contract; callback security tests still pass. Mounted
HTTP operations fell from 53 to 46 solely through these seven deliberate removals.
