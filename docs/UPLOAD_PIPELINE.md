# File Upload Pipeline — End to End

Audit of how an experiment folder travels from the user's disk to Google Drive,
PostgreSQL and the analytics layer, plus an explicit account of what the pipeline
defends against and what it does not.

- **Scope**: the experiment-ZIP ingestion path (`POST /api/projects/{id}/files/experiment-zip`)
  and the media read-back path (`/files/{id}/image`, `/files/{id}/preview`).
- **Status**: reflects the code on branch `dashboard` as of 2026-08-07. Findings
  §5.1, §5.2, §5.3, §5.11 and §5.14 have since been fixed and are marked as such;
  everything else in §5 is still open. See §6 for the running list.
- **Audience**: developers and whoever signs off on the deployment.

---

## 1. Summary

There is exactly **one** file upload entry point in the product. It accepts a single
ZIP archive per project, validates its structure, extracts it to a temp directory,
converts the experiment CSV into Parquet, mirrors everything into a fresh Google
Drive folder, and records one `project_files` row per stored object. Ingestion runs
**synchronously inside the HTTP request** — the RQ worker task exists but is an
explicit stub.

Two other modules look like upload paths but are dead code: `modules/uploads/*`
(all placeholders — `routes.py` is `def register_upload_routes(app): pass`,
`r2_storage_adapter.py` is `class R2StorageAdapter: pass`) and
`workers/tasks/process_experiment_zip.py` (logs "stub, not implemented").

Cleanup update (2026-09-03): the unmounted `modules/uploads/` and
`modules/processing/` placeholders have been removed after reference checks and
verification. The ZIP worker stub remains pending the product/runtime decision;
see [the cleanup ledger](cleanup/LEDGER.md).

The single most serious finding in this review was unrelated to the ZIP endpoint
itself: the entire Google Drive integration router had no authentication, and one of
its endpoints uploaded an arbitrary server-side directory to Drive. That is now fixed
— see [§5.1](#51-critical--the-google-drive-integration-router-has-no-authentication--fixed).

The archive is also no longer accepted blindly. When its structure is ambiguous —
several `.csv` data sources, several or zero `Images`/`Videos` folders — ingestion
stops and asks the user which one to use rather than guessing. An optional
`Acquisition/` folder is read for default values (subject codes, scenario names) but
never stored.

---

## 2. The pipeline, stage by stage

```mermaid
flowchart TD
    A["User picks folder<br/>webkitdirectory / drag-drop"] --> B["analyzeFolderStructure<br/>CSVs, Images/Videos, Acquisition"]
    B -->|ambiguous| B2["Ask the user in Step 1<br/>which CSV / which folder / no media?"]
    B2 --> B
    B --> C["JSZip packaging in browser<br/>compression: STORE"]
    C --> D["POST /api/projects/ → draft project"]
    D --> E["XHR multipart POST<br/>file + selected_* / allow_missing_*"]
    E --> F["Next.js rewrite /api/:path*<br/>proxyClientMaxBodySize 550mb"]
    F --> G0["UploadAdmissionControl<br/>per-user + global concurrency, rate limit"]
    G0 -->|rejected| G1["429 Retry-After"]
    G0 --> G["Stream part to temp file<br/>1 MB chunks, cap enforced live"]
    G -->|over cap| G2["413 — transfer cut off"]
    G --> H["ZipValidationService<br/>size / MIME / bomb guards / structure"]
    H -->|invalid| H2["400 — nothing written anywhere"]
    H -->|ambiguous| H3["409 structure_clarification_required<br/>questions + detected options"]
    H --> L["ZipExtractionService → temp dir<br/>path-traversal guard, byte budget, CRC"]
    L -->|corrupt or over budget| H2
    L --> I["Configure Drive OAuth client<br/>force_refresh=True"]
    I --> J["ingestion_status = PROCESSING<br/>COMMIT"]
    J --> K["Create fresh Drive root folder"]
    K --> M["CsvProcessingService<br/>CSV → Parquet per user + scenario"]
    M --> N["Stream to Drive:<br/>original ZIP, media, parquets"]
    N --> O["DB swap: soft-delete old files,<br/>purge zip row, clear scenaries,<br/>insert new rows"]
    O --> P["Delete previous Drive root"]
    P --> Q["ingestion_status = READY<br/>COMMIT"]
    Q --> R["Response summary + acquisition defaults<br/>→ wizard step 2"]
    N -.->|any failure| X["Compensation: rollback DB,<br/>delete every uploaded Drive object,<br/>status = FAILED"]
```

Validation **and** extraction now happen before the `PROCESSING` transition, so an
archive that is invalid, ambiguous, corrupt or over budget produces no Drive object,
no DB mutation and no status change.

### Stage 0 — Folder selection (browser)

[CreateProjectStep1.tsx](../frontend/features/projects/create-project/CreateProjectStep1.tsx)

A hidden `<input type="file" webkitdirectory mozdirectory>` or a directory drag-drop
(`webkitGetAsEntry()` + recursive `readDirectoryEntries`, which reconstructs a
`_relativePath` on each `File` because dropped files have no `webkitRelativePath`).

`handleFolder` then applies four client-side rules:

| Rule | Implementation |
| --- | --- |
| Drop hidden files and macOS resource forks | `!file.name.startsWith(".") && !relativePath.includes("__MACOSX/")` |
| Total size ≤ 500 MB | sum of `file.size` vs `500 * 1024 * 1024` |
| At least one `.csv` | path suffix check |
| At least one file under `Images/` or `Videos/` | `path.toLowerCase().includes("/images/" \| "/videos/")` |

It then narrows the selection to only what the backend needs — `.csv` files plus
anything under `/images/` or `/videos/` — and stores that array in wizard state.
Everything else in the chosen folder is silently discarded before packaging.

### Stage 1 — ZIP packaging (browser)

[useCreateProjectWizard.ts:268-291](../frontend/features/projects/create-project/useCreateProjectWizard.ts#L268-L291)

`jszip` is dynamically imported, each file added with its root-folder prefix stripped
so archive entries are relative (`Images/a.png`, not `MyExperiment/Images/a.png`), and
**`compression: "STORE"`** — no compression, so the ZIP is roughly the sum of input
sizes. The blob becomes a `File` named `${folderName}.zip` with type `application/zip`.

This happens entirely in browser memory. A 450 MB folder means ~900 MB of browser heap
between the source `File` objects and the generated blob.

### Stage 2 — Draft project

`POST /api/projects/` creates the project in `draft` / `ingestion_status=PENDING`
before any bytes are sent, so the upload has an ID to attach to. Name collisions per
owner return 409. On resume, `PATCH /api/projects/{id}` is used instead.

If step 1 fails and the draft was created in this attempt, the wizard deletes it
(`keepDraftOnFailure` is only set to `true` after a successful ingestion).

### Stage 3 — HTTP transfer

[apiFetch.ts:118-285](../frontend/lib/api/apiFetch.ts#L118-L285)

`apiUploadFormWithProgress` uses raw `XMLHttpRequest` (not `fetch`) purely to get
`xhr.upload.onprogress`:

- `POST` `multipart/form-data`, single part named `file`
- `Authorization: Bearer <jwt>` from the session store; token expiry is pre-checked
  client-side and a 401 forces a redirect to `/login`
- `xhr.timeout = 30 min`
- An `AbortSignal` is wired in so the wizard's cancel button aborts the XHR
- After `upload.onload`, the UI switches to a "processing" phase with a 1 s ticker,
  because the browser→backend leg finishes long before ingestion does

The request goes to the **same origin**. Next.js rewrites `/api/:path*` to
`http://backend:8000/api/:path*` with `experimental.proxyClientMaxBodySize: "550mb"`
and `proxyTimeout: 30 * 60_000` ([next.config.mjs](../frontend/next.config.mjs)). The
backend port is never published — `docker-compose.yml` uses `expose: "8000"`, not `ports`.

### Stage 4 — Backend receives

[routes.py](../backend/src/neurodatics/modules/projects/api/routes.py)

The request first has to pass `upload_admission_control.slot(current_user)`, which
enforces the per-user and global concurrency caps and the minimum gap between attempts;
a rejection is **429** with `Retry-After`.

The multipart part is then streamed to a temp file in 1 MB chunks by
`_spool_upload_to_disk`, which aborts with **413** the moment the running total passes
`PROJECT_ZIP_MAX_SIZE_MB` — so an oversized body is cut off mid-transfer rather than
buffered in full. Nothing downstream ever holds the archive in memory; every later
stage works from `zip_path`.

The route also accepts the structure answers as optional form fields:
`selected_csv_path`, `selected_images_folder`, `selected_videos_folder`,
`selected_acquisition_folder`, `allow_missing_images`, `allow_missing_videos`.

### Stage 5 — Validation (before anything is written)

[zip_validation_service.py](../backend/src/neurodatics/modules/projects/application/services/zip_validation_service.py)

`ZipValidationService.validate_and_analyze` is deliberately the **first** thing the use
case does — before the project status changes and before any Drive call — so an invalid
archive leaves zero side effects.

1. **`validate_upload`** — filename must end in `.zip`; a supplied `content_type` must
   be `application/zip` or `application/x-zip-compressed`; on-disk size must be within
   `PROJECT_ZIP_MAX_SIZE_MB` (default **500 MB**).
2. **`enforce_archive_limits`** — the zip-bomb guard (§5.2). Reads the central
   directory only; decompresses nothing.
3. **`scan_structure`** — inventories the archive: candidate `.csv` data sources,
   every distinct `Images` / `Videos` / `Acquisition` folder, and the
   `Sujet_<id>_Scenario_<name>_Rec<n>` sub-folders under `Acquisition/`.
4. **`resolve_structure`** — turns that inventory plus the user's answers into one
   unambiguous plan:
   - **zero** `.csv` → `ValidationError` → **400** (unresolvable)
   - **more than one** `.csv` → `ClarificationRequired` unless `selected_csv_path` picks one
   - **zero** `Images` (or `Videos`) folders → `ClarificationRequired` unless the
     matching `allow_missing_*` flag confirms it
   - **more than one** `Images` (or `Videos`) folder → `ClarificationRequired` unless
     `selected_*_folder` picks one
   - **more than one** `Acquisition` folder → `ClarificationRequired`

   `ClarificationRequired` becomes a **409** whose `detail` carries
   `error: "structure_clarification_required"`, the list of questions (each with the
   form field that answers it and the available options) and what was detected. The
   client re-sends the same archive with those fields filled in.
5. **`build_manifest`** — for each non-directory entry: normalise the path
   (`\` → `/`, strip leading/trailing `/`), skip `__MACOSX/`, classify by extension via
   `KIND_BY_EXTENSION`, and **demote** any image/video to `other_asset` unless one of its
   parent path components is literally `images` or `videos` (case-insensitive).
   Entries the user did not pick — the other CSVs, non-selected scenario folders, and
   **everything under `Acquisition/`** — are dropped from the manifest and reported in
   `excluded_entries`, so they are never decompressed, uploaded or recorded.

Kind mapping: `.jpg/.jpeg/.png/.gif/.bmp/.webp/.tif/.tiff/.svg` → `scenario_image`;
`.mp4/.avi/.mov/.mkv/.webm/.m4v` → `scenario_video`; `.csv` → `raw_csv`;
`.pdf` → `report_pdf`; everything else → `other_asset`.

#### The `Acquisition/` folder

`Acquisition/` is **reference-only**. It is scanned with exactly the same security
rules as the rest of the archive (bomb guards, path-traversal checks), but nothing in
it is uploaded to Drive or written to the database. Its sub-folder names are parsed —
`Sujet_1001014126_Scenario_Scenario 1_Rec1` yields subject `1001014126`, scenario
`Scenario 1`, recording `1` — and returned in the response as `acquisition`, where the
wizard uses `default_participant_codes` to seed the participant list when the CSV
metadata does not supply one. Sub-folders that do not match the pattern are ignored,
and an `Acquisition/Images` or `Acquisition/*.csv` never competes with the real
scenario folders or the real data source.

### Stage 6 — Drive credentials and status transition

[upload_experiment_zip.py:74-125](../backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py#L74-L125)

- `configure_gdrive_client_with_oauth(db, silent=True, force_refresh=True)` loads the
  refresh token from `system_integrations` and injects OAuth credentials into the global
  `gdrive_client`. If not connected → `GoogleDriveConfigurationError` → **503**.
- `ingestion_status = PROCESSING`, `ingestion_error = NULL`, `storage_provider = gdrive`,
  committed immediately so the UI can lock its inputs.
- A **new** Drive root folder is always created, named
  `{project.name}-{project.id[:8]}-{YYYYMMDDHHMMSS}`, parented to `GDRIVE_FOLDER_ID`
  when set, otherwise the connected account's Drive root. Re-uploading never mutates the
  previous folder — it builds a fresh one and deletes the old one at the end.

### Stage 7 — Extraction to a temp directory

[zip_extraction_service.py](../backend/src/neurodatics/modules/projects/application/services/zip_extraction_service.py)

Inside `tempfile.TemporaryDirectory(prefix="neurodatics-ingestion-")`:

- the spooled `zip_path` is opened directly — no second copy of the archive is made
- for every manifest entry, `_is_unsafe_relative_path` rejects absolute paths,
  Windows drive letters (`C:`), and any `..` component
- extraction is manual — `zip_file.open(rel_path)` + a **bounded** chunked copy into
  `extracted/<rel_path>`. Nothing calls `ZipFile.extract*`, so archive-declared
  symlinks/permissions are never honoured.
- `_copy_bounded` counts the bytes that really come out and aborts if an entry exceeds
  its declared size or the run exceeds `PROJECT_ZIP_MAX_UNCOMPRESSED_MB`, so a lying
  central directory cannot get past the Stage 5 guard
- reading each member to EOF makes `zipfile` verify its CRC, which is why the separate
  `testzip()` pass no longer exists
- the directory (and everything in it) is removed by the context manager on exit,
  success or failure

This whole block now runs **before** the project status changes and before the Drive
root folder is created, so a corrupt or over-budget archive still leaves zero side
effects.

### Stage 8 — CSV → Parquet

[csv_processing_service.py](../backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py),
run per CSV via `asyncio.to_thread`.

- **Decoding**: tries `utf-16`, then `utf-8`, then `latin-1`.
- **User blocks**: the file is split at every line whose first cell normalises to
  `time`. Each block is one participant.
- **Participant code**: regex `[Gg]rabaci[oó]n\s*:\s*(\d+)` over the metadata lines
  directly above the header; falls back to `participante_{n}`.
- **Sensor detection** from the first header row: `EEG`, `GSR`, `EyeTracker`.
- **Parsing**: delimiter auto-chosen among `;`, `,`, `\t` by column count;
  `pd.read_csv(engine="python", decimal=",", on_bad_lines="skip")`; columns renamed via
  `STD_MAP`; string columns coerced to numeric when ≥80 % of non-empty values parse.
- **Cleaning**: eye-tracker blackout rows (`gx == 0 and gy == 0`) blanked except
  `time/distance/lx_pupil/rx_pupil/scenario`; negative fixations clamped to `-100`;
  single-pass sentinel propagation to the rows adjacent to original `-100` rows.
- **Output**: `user{n}.parquet` plus one `escenarios/{scenario}.parquet` per distinct
  scenario value, snappy-compressed, written under the temp dir.

A CSV that raises `CsvProcessingError` increments `csv_summary.failed` and is **skipped** —
ingestion continues. Outputs are deduped by `user_index` and by `(user_index, clean scenario name)`.

### Stage 9 — Upload to Google Drive

Progress accounting starts here: `total_bytes` = uncompressed size of all non-CSV
manifest entries + all generated Parquet sizes + the original ZIP if it will be saved.

Upload order:

1. **Original ZIP** (only if `INGESTION_SAVE_ORIGINAL_ZIP=true`, the default) →
   `ProjectFile(kind="experiment_zip")` carrying a SHA-256 and the full manifest JSON.
2. **Folder tree** rebuilt via `_ensure_folder_path`, which memoises path → Drive ID and
   reuses an existing child folder when `find_child_folder_by_name` matches.
3. **Every non-CSV manifest entry** uploaded from its extracted temp path. Images and
   videos additionally produce a `Scenaries` row named after the entry's stem.
4. **Parquets** to `processed/user{n}/user{n}.parquet` and
   `processed/user{n}/escenarios/{name}.parquet`, `kind="processed_parquet"`.

> **Raw CSVs are counted but never uploaded to Drive.** Only the derived Parquet files
> are stored. The original CSV survives only inside the archived ZIP, and only when
> `INGESTION_SAVE_ORIGINAL_ZIP` is on.

Each stored object gets a `project_files` row with `external_id` (Drive file ID),
`checksum_sha256`, `mime_type`, `size_bytes`, `drive_web_view_link` and
`drive_download_link`.

`gdrive_client.upload_file` streams from disk with `MediaFileUpload(..., chunksize=8 MB,
resumable=True)` when handed a `local_path`, closing the file handle afterwards, and
returns the SHA-256 it computed while streaming — so callers do not read each file a
second time to checksum it. The in-memory `MediaIoBaseUpload` path remains only for the
`file_content=` callers.

### Stage 10 — Database swap

All in one transaction, only after every Drive upload succeeded:

```
soft_delete_active_files(project_id)      # deleted_at = now() on previous rows
purge_files_by_kind(project_id, "experiment_zip")   # hard delete — unique constraint
clear_project_scenaries(project_id)       # deletes AOIs then Scenaries
add_files(files_to_insert)
add_scenaries(scenaries_to_insert)
```

Then the **previous Drive root folder** is deleted if it differs from the new one. If
that delete fails the whole ingestion is aborted rather than reporting success with
stale remote content.

Finally `ingestion_status = READY`, `last_ingested_at`, and the three
`drive_root_folder_*` columns are written and committed;
`drive_upload_progress_registry.complete(project_id)` flips progress to 100 %.

> Note: clearing scenaries also deletes their AOIs. **Re-uploading a folder destroys all
> AOI annotations the user had drawn.** That is intentional in the current design but is
> not surfaced in the UI.

### Stage 11 — Response and wizard continuation

`UploadedProjectZipSummaryResponse` returns counts, the manifest summary, the created
file list, `detected_sensors` and `participants`. The wizard then re-fetches project
detail, auto-fills sensors and participants, **persists them immediately** (so a closed
wizard can be resumed via "Continuar"), builds step-4 image scenarios and advances to
step 2.

### Progress and cancellation channel

[drive_upload_progress_registry.py](../backend/src/neurodatics/modules/projects/application/services/drive_upload_progress_registry.py)

A module-level, thread-locked dict keyed by project ID, holding phase, bytes, percent,
speed, ETA, elapsed, error and a `cancel_requested` flag; entries pruned after 6 hours.

- `GET /files/experiment-zip/progress` — polled once per second by the wizard. When no
  live snapshot exists it deliberately reports `idle` rather than inferring `completed`
  from a historical `READY`, so a new upload never shows a false 100 %.
- `POST /files/experiment-zip/cancel` — sets the flag; the use case calls
  `_raise_if_canceled` at ~10 checkpoints (between CSVs, before each folder, before each
  file, before the DB swap) and raises `UploadCanceledError` → **409**, which then runs
  the same compensation path and marks the project `FAILED`.

Percent is capped at 99 while uploading so the bar only reaches 100 on real completion.

### Failure handling and compensation

The `except` block in `UploadExperimentZipUseCase.execute`:

1. marks progress `failed` with a user-facing message
2. `repository.rollback()`
3. deletes **every** Drive object created during this run, in reverse order
   (`uploaded_drive_ids`), best-effort with warnings
4. re-raises `ValidationError` untouched (it happened before any writes)
5. for cancellation, sets `ingestion_status=FAILED / "Upload canceled by user"`
6. otherwise sets `FAILED` + the error text, and converts Google `invalid_grant`
   into `GoogleDriveReconnectRequiredError`

Route-level status mapping: `ValueError` → 404, `UploadCanceledError` → 409,
Drive config/reconnect → 503, `ValidationError` → 400, anything else → 500.

### Read-back path (how uploaded media is served)

Uploaded media is **never** served directly from Drive to the browser. Two authenticated
proxy endpoints exist, both gated by `_load_project_file`, which joins
`ProjectFile → Project` on `Project.owner_id == current_user`:

- `GET /projects/{pid}/files/{fid}/image` — three-tier cache: disk
  (`/data/image_cache`, no TTL) → in-memory LRU (300 s TTL, 256 items, 64 MB) → Drive
  download under a per-key `asyncio.Lock` so concurrent misses download once. Responds
  with `Cache-Control: private, max-age=300`, an ETag, and an `X-Image-Cache` hit marker.
- `GET /projects/{pid}/files/{fid}/preview?time_s&scenario&participant_code` — same path
  for images; for videos it caches the source to `/data/video_cache`, resolves the
  scenario-relative timestamp against the participant's Parquet, and shells out to
  `ffprobe` + `ffmpeg` (argument list, no shell; 10 s / 45 s timeouts) to extract a
  single JPEG frame into `/data/video_frame_cache`.

Parquet is read back by `ParquetReaderService`, which downloads from Drive on a cache
miss into `/data/parquet_cache`. Every analytics route calls `_verify_ownership`.

---

## 3. Configuration surface

| Setting | Default | Effect on the pipeline |
| --- | --- | --- |
| `PROJECT_ZIP_MAX_SIZE_MB` | `500` | Hard cap on the **compressed** upload |
| `PROJECT_ZIP_MAX_UNCOMPRESSED_MB` | `2000` | Cap on total expanded size (zip-bomb guard) |
| `PROJECT_ZIP_MAX_ENTRY_UNCOMPRESSED_MB` | `600` | Cap on any single expanded entry |
| `PROJECT_ZIP_MAX_ENTRIES` | `20000` | Cap on member count |
| `PROJECT_ZIP_MAX_COMPRESSION_RATIO` | `100` | Max per-entry and overall expansion ratio |
| `UPLOAD_MAX_CONCURRENT_PER_USER` | `1` | Simultaneous ingestions one user may run |
| `UPLOAD_MAX_CONCURRENT_GLOBAL` | `4` | Simultaneous ingestions across all users |
| `UPLOAD_MIN_SECONDS_BETWEEN_UPLOADS` | `5` | Minimum gap between one user's attempts |
| `GDRIVE_SYNC_ALLOWED_ROOT` | unset | Only directory `sync-folder*` may read; unset ⇒ endpoints 404 |
| `BACKEND_MEM_LIMIT` / `WORKER_MEM_LIMIT` | `2g` | Container memory ceilings (compose) |
| `INGESTION_SAVE_ORIGINAL_ZIP` | `true` | Whether the source ZIP is archived to Drive |
| `GDRIVE_FOLDER_ID` | unset | Parent for project root folders; unset ⇒ Drive root |
| `GDRIVE_HTTP_TIMEOUT_SECONDS` | `300` | Per-request Drive timeout |
| `GDRIVE_REQUEST_RETRIES` | `5` | `num_retries` on every Drive call |
| `proxyClientMaxBodySize` (Next) | `550mb` | Proxy body cap, must stay above the ZIP cap |
| `proxyTimeout` (Next) | `30 min` | Must cover full ingestion, not just transfer |
| `ZIP_UPLOAD_TIMEOUT_MS` (client) | `30 min` | `xhr.timeout` |
| `IMAGE_/VIDEO_/VIDEO_FRAME_/PARQUET_CACHE_DIR` | `/data/*` | Unbounded on-disk caches |
| `AUTH_ACCESS_TOKEN_EXP_MINUTES` | `20160` (14 d) | Upload credential lifetime |

---

## 4. What **is** protected

1. **Authentication on every project endpoint.** Each route takes
   `Depends(get_current_user)` → `HTTPBearer` → HS256 JWT verified for signature,
   `iss`, `typ == "access"`, `exp`, and a non-empty `sub`. There is no anonymous
   upload path.
2. **Tenant isolation.** Every project read/write goes through
   `repository.get_by_id(project_id, owner_id)` or an explicit
   `Project.owner_id == UUID(current_user)` predicate, and returns **404** (not 403) for
   another user's project, so IDs are not confirmable. `_load_project_file` applies the
   same join, so media proxying cannot be used to read someone else's files.
3. **Validate-before-write ordering.** Structure validation is the first operation;
   an invalid archive produces no Drive object, no DB mutation and no status change.
   This is called out in a code comment and is genuinely honoured.
4. **Server-side size cap.** 500 MB enforced on the received bytes. The client's 500 MB
   check is UX only and is not trusted. The Next.js proxy caps at 550 MB above it.
5. **Container type allowlist.** `.zip` extension required; declared MIME must be one of
   two ZIP types when present.
6. **Archive integrity.** `testzip()` CRC-checks every member; corrupt archives are
   rejected with the offending entry name.
7. **Path traversal defence.** Absolute paths, Windows drive letters and `..` segments
   are rejected; `__MACOSX/` is skipped; extraction is manual `open()` + `copyfileobj`,
   so no symlink, hardlink or permission bit from the archive is ever applied.
8. **Content-role allowlist.** Images and videos are only treated as scenario assets when
   they sit under an `Images`/`Videos` path component; anything else is demoted to
   `other_asset`, so a stray file cannot silently become a stimulus.
9. **Integrity records.** SHA-256 stored per uploaded object in
   `project_files.checksum_sha256`.
10. **Consistent replacement.** Old rows soft-deleted, the `experiment_zip` row purged
    (DB enforces one per project), scenaries cleared and new rows inserted in a single
    transaction; the previous Drive root is deleted only afterwards, and a failed delete
    aborts rather than reporting success.
11. **Compensating deletes.** Every Drive object created during a failed run is deleted
    in reverse order, so failures do not leave orphans consuming quota.
12. **Cooperative cancellation** with ~10 checkpoints, wired to both an `AbortController`
    on the client and a server-side flag, so aborting the XHR does not leave the backend
    uploading forever.
13. **No public object storage.** Media is served only through authenticated proxies with
    `Cache-Control: private`; Drive files are not shared publicly.
14. **Drive credentials stay server-side.** The refresh token is never sent to the
    browser. Read paths build isolated per-request clients rather than sharing the
    mutable singleton.
15. **Network posture.** Backend/DB/Redis ports are unpublished (`expose`, plus an
    `internal: true` data network); the browser only ever talks to the frontend origin.
    CORS uses an explicit allowlist with `allow_credentials=False` and only
    `Content-Type`/`Authorization` headers.
16. **Production config guardrails.** `Settings.validate_production_security` refuses to
    boot with `DEBUG=true`, a known-insecure or <32-char `AUTH_JWT_SECRET`, or an
    external `DATABASE_URL` without `sslmode=require|verify-ca|verify-full`.
17. **CSRF is structurally absent.** The credential is a bearer token in a header, not a
    cookie, and `allow_credentials=False`. No CSRF token is needed.
18. **No shell injection in media handling.** `ffmpeg`/`ffprobe` are invoked with an
    argument list and bounded timeouts; filenames are passed as separate argv entries.

---

## 5. What is **not** protected

Ordered by severity.

### 5.1 ~~CRITICAL — the Google Drive integration router has no authentication~~ — FIXED

[modules/integrations/google_drive/api/routes.py](../backend/src/neurodatics/modules/integrations/google_drive/api/routes.py)

**Was**: not one endpoint in this router declared `Depends(get_current_user)`, so any
unauthenticated visitor of the frontend host could read an arbitrary server directory
into the connected Drive account (`/data`, which holds `auth_users.json`, `/app`,
`/etc`), disconnect Drive for the whole install, or leak the connected account email
and scope.

**Now**: the router carries a router-level `dependencies=[Depends(get_current_user)]`,
so every route returns 401 without a valid bearer token. The OAuth `callback` moved to
a separate `public_router` — Google redirects the browser there with no Authorization
header, and it is still guarded by the HMAC-signed, TTL-bounded `state` it validates.

`sync-folder` / `sync-folder-scheduled` are additionally **disabled by default**: they
404 unless `GDRIVE_SYNC_ALLOWED_ROOT` is set, and `resolve_syncable_folder` then
confines the caller's path to that root with `Path.resolve()` (so symlinks cannot
escape) and returns an identical error whether a rejected path exists or not, so the
endpoint cannot be used to probe the filesystem. `os.walk` runs with
`followlinks=False` and symlinked files are skipped.

An admin role still does not exist in the codebase; connect/disconnect/sync are
available to any authenticated user.

Covered by [test_upload_pipeline_hardening.py](../backend/tests/unit/test_upload_pipeline_hardening.py).

### 5.2 ~~HIGH — no zip-bomb or decompression-ratio guard~~ — FIXED

`ZipValidationService.enforce_archive_limits` now runs before anything is
decompressed, rejecting an archive on any of:

| Bound | Setting | Default |
| --- | --- | --- |
| Entry count | `PROJECT_ZIP_MAX_ENTRIES` | 20000 |
| Per-entry uncompressed size | `PROJECT_ZIP_MAX_ENTRY_UNCOMPRESSED_MB` | 600 |
| Total uncompressed size | `PROJECT_ZIP_MAX_UNCOMPRESSED_MB` | 2000 |
| Per-entry and overall compression ratio | `PROJECT_ZIP_MAX_COMPRESSION_RATIO` | 100:1 |

Those checks read the central directory only, which is attacker-controlled, so they
are not trusted on their own: `ZipExtractionService` re-counts the bytes that really
come out of each member and aborts if an entry exceeds its declared size or the run
exceeds the total budget.

The separate `testzip()` pass is gone. It decompressed the whole archive a second
time; extraction now reads each member to EOF, which makes `zipfile` verify the same
CRC in the one pass that has to happen anyway. Extraction also moved *ahead* of the
first project write, so a corrupt archive still leaves zero side effects.

### 5.3 ~~HIGH — whole-file in-memory handling, several times over~~ — FIXED

The route streams the multipart part to a temp file in 1 MB chunks
(`_spool_upload_to_disk`), aborting mid-transfer once the cap is passed rather than
after the whole body has been buffered. Validation, extraction and the archival Drive
upload all work from that path, so the archive is never held in RAM. Peak usage for a
500 MB upload is one chunk instead of ~1.5 GB.

`gdrive_client.upload_file` uses `MediaFileUpload` when given a `local_path`, streaming
from disk instead of `read_bytes()`, and returns the SHA-256 it computed while
streaming so callers no longer read each file a second time to checksum it.

`UploadAdmissionControl` caps uploads per user (`UPLOAD_MAX_CONCURRENT_PER_USER`,
default 1) and globally (`UPLOAD_MAX_CONCURRENT_GLOBAL`, default 4), with a minimum
gap between attempts (`UPLOAD_MIN_SECONDS_BETWEEN_UPLOADS`, default 5 s); rejections
are 429 with `Retry-After`. Both compose files now set `mem_limit` / `mem_reservation`
on `backend` and `worker`.

Like the progress registry (§5.8), admission control is process-local and must move to
Redis if the API is ever scaled out.

### 5.4 HIGH — ingestion runs synchronously in the request

The queue infrastructure exists (Redis, an RQ worker service, `JOB_TIMEOUT=3600`,
a `processing_jobs` table) but `process_experiment_zip_task` is a stub and nothing
enqueues it. Consequences:

- a DB session is held open for up to 30 minutes per upload
- a client disconnect does not stop the work — only the explicit cancel endpoint does
- a backend restart or crash mid-ingestion strands the project in `PROCESSING`
  **permanently**; there is no reaper, no timeout, and no way for the user to recover
  except deleting the project
- the in-flight Drive objects from a crashed run are never compensated, because
  compensation lives in the request's `except` block

### 5.5 MEDIUM — no content sniffing, no malware scanning

Type decisions come exclusively from the filename: `KIND_BY_EXTENSION[ext]` and
`mimetypes.guess_type(filename)`. The client-supplied `content_type` is trusted for the
container check. There is no magic-byte verification, no image decode/re-encode, and no
AV scan anywhere in the pipeline.

Consequences: arbitrary bytes named `payload.png` inside `Images/` are stored in Drive,
recorded with `mime_type: image/png`, and served back with that `Content-Type` from
`/files/{id}/image`. Those responses set no `X-Content-Type-Options: nosniff`, no
`Content-Disposition`, and no CSP.

Note specifically that **`.svg` is classified as `scenario_image`**. An SVG served as
`image/svg+xml` from the app's own origin is an active-content vector. Today the
frontend fetches it as a blob and renders it in `<img>`, which neuters script execution —
but the endpoint is directly navigable with a bearer token, and nothing prevents a future
component from rendering it inline.

### 5.6 MEDIUM — attacker-supplied media reaches ffmpeg as root

`/preview` runs `ffprobe` and `ffmpeg` over uploaded video files inside the API
container. The Dockerfile declares no `USER`, so both run as **root**. Invocation is
safe from shell injection and has timeouts, but decoder vulnerabilities in ffmpeg are a
real and recurring class, and there is no seccomp profile, no dropped capabilities, no
read-only filesystem and no separate sandbox.

Also, `ffmpeg`/`ffprobe` are only installed in the backend image — a preview request on
a host missing them raises `RuntimeError("FFmpeg is not installed…")` → 503.

### 5.7 MEDIUM — unbounded on-disk caches

`/data/image_cache`, `/data/video_cache`, `/data/video_frame_cache` and
`/data/parquet_cache` are written on demand and **never evicted**. Only the in-memory
image cache is bounded (64 MB / 256 items / 300 s). The comment in
[routes.py:56](../backend/src/neurodatics/modules/projects/api/routes.py#L56) says the
disk cache is "cleared on container restart", but it lives in the `neurodatics_data`
named volume, which survives restarts.

Video sources are cached at full size, and every distinct `time_s` (rounded to 0.1 s)
produces another JPEG on disk. A user scrubbing a video timeline generates thousands of
files. Disk exhaustion is user-reachable through normal use.

### 5.8 MEDIUM — the progress registry is process-local

`DriveUploadProgressRegistry` is a module-level dict guarded by a `threading.Lock`.
That is correct for one uvicorn process and wrong the moment the deployment scales:
with multiple workers or replicas, the progress poll and the cancel request will
frequently land on a process that knows nothing about the upload — so the bar shows
`idle` and **cancel silently does nothing**. It also does not survive a restart.

The endpoints themselves do verify project ownership before returning a snapshot, so
this is a correctness/DoS-of-UX issue, not an information leak.

### 5.9 MEDIUM — raw exception text is returned and persisted

```python
detail=f"Error procesando el archivo: {e}"          # generic 500 path
```

and `ingestion_error` — set from `str(exc)` — is stored on the project and returned by
`GET /projects/{id}` and the progress endpoint. Google API error bodies, container
filesystem paths, SQL fragments and library internals can all surface in the UI. The
`invalid_grant` case is the only one mapped to a curated message.

### 5.10 MEDIUM — Drive refresh token stored in plaintext with full-account scope

`system_integrations.refresh_token` is a plain column — no encryption at rest, no KMS,
no envelope. And the requested scope is:

```python
GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"   # full account access
```

not `drive.file` (which would limit the app to files it created). Notably the
**service-account fallback path in `gdrive_client` does use the narrower `drive.file`** —
the OAuth path is the broad one.

So any read of that one column — a DB backup, a log dump, a future SQLi, or the
unauthenticated `/status` + `/sync-folder` combination in §5.1 — yields full read/write
access to the connected Google account's entire Drive, not just NeuroDatics data.

### 5.11 ~~LOW — Drive query injection via ZIP folder names~~ — FIXED

[gdrive_client.py](../backend/src/neurodatics/infra/storage/gdrive_client.py)

`find_child_folder_by_name` now escapes the backslash before the single quote:

```python
safe_name = name.replace("\\", "\\\\").replace("'", "\\'")
```

Previously only the quote was escaped, so a ZIP folder name ending in `\` produced
`name = 'a\\'` — the escaped quote let the literal run on into attacker-influenced
query syntax.

### 5.12 LOW — no quotas, partial rate limiting

Upload *concurrency* and a minimum gap between attempts are now enforced per user and
globally (§5.3), but nothing still caps projects per user, uploads per day, or total
bytes pushed to Drive. All users share **one** Google Drive account, so a single user
can exhaust the shared storage quota and break ingestion for everyone. There is no
accounting table.

### 5.13 LOW — 14-day access tokens with no refresh or revocation

`auth_access_token_exp_minutes = 14 * 24 * 60`. There is no refresh-token rotation, no
`jti` denylist and no logout-server-side. A token captured from browser storage grants
upload and read access to that user's projects for two weeks.

### 5.14 ~~LOW — client and server validation rules have drifted~~ — MOSTLY FIXED

The client rules now live in one module,
[folderStructure.ts](../frontend/features/projects/create-project/folderStructure.ts),
written as a deliberate mirror of `ZipValidationService`. Scenario-folder detection
agrees on both sides (whole **path component** equal to `images`/`videos`, never a
substring), `Acquisition/` is treated identically, and the clarification questions the
wizard asks are the same ones the backend would answer 409 with.

The remaining differences are intentional: the client still strips dotfiles and
non-relevant files before packaging (a transfer-size optimisation), and its size check
is on the source files rather than the resulting ZIP. The backend remains the
authority — it re-runs every structure rule on the uploaded archive, so a direct API
caller cannot bypass them.

### 5.15 LOW — a fully-failed CSV run still reports READY

If every CSV raises `CsvProcessingError`, `csv_summary.failed` is incremented, no Parquet
is produced, and ingestion still completes with `ingestion_status = READY`. The user
sees `0/1 CSV procesados` in a green panel and only discovers the problem later, when
every analytics endpoint returns "No processed Parquet file for participant".

### 5.16 LOW — re-upload silently destroys AOI annotations

`clear_project_scenaries` deletes AOIs before scenaries on every ingestion. Editing a
project's folder wipes hand-drawn AOIs with no warning and no backup.

### 5.17 Informational

- **Checksums are write-only.** `checksum_sha256` is computed and stored but never
  re-verified against Drive, so silent remote corruption is undetectable.
- **`size_bytes` is self-reported.** It comes from the ZIP central directory
  (`info.file_size`), not from the bytes actually written — so progress totals and
  stored sizes trust the archive's own header.
- **Global mutable Drive client.** The write path reconfigures the module-level
  `gdrive_client` singleton while read paths deliberately build isolated clients. With a
  single integration the practical risk is low, but the inconsistency is a trap for a
  future multi-account feature.
- **Drive file IDs are exposed to the browser** (`external_id`, `drive_web_view_link`,
  and the `drive.google.com/thumbnail?id=` fallback in the wizard). They are not secrets
  by themselves — access still requires Drive permissions — but they are inventory
  information about the shared account.
- **TLS is out of scope of the repo.** `docs/NETWORK_DEPLOYMENT.md` assumes an external
  HTTPS reverse proxy; nothing in the code enforces HTTPS, sets HSTS, or rejects plain
  HTTP, and compose publishes frontend port 3000 directly.

---

## 6. Recommended order of work

| # | Action | Severity | Effort | Status |
| --- | --- | --- | --- | --- |
| 1 | Add `Depends(get_current_user)` to every Google Drive integration route; delete or root-restrict `sync-folder*` | Critical | XS | **Done** — §5.1 |
| 2 | Cap total uncompressed size, per-entry size and entry count in `build_manifest` | High | XS | **Done** — §5.2 |
| 3 | Narrow the OAuth scope to `drive.file`; encrypt `refresh_token` at rest | High | S | Open |
| 4 | Move ingestion to the existing RQ worker; add a `PROCESSING` reaper for stranded projects | High | M | Open |
| 5 | Stream the upload to a temp file instead of `await file.read()`; stream Drive uploads from disk | High | M | **Done** — §5.3 |
| 6 | Set container memory limits; add per-user upload concurrency/rate limits | High | S | **Done** — §5.3 |
| 7 | Magic-byte verification for images/videos; drop `.svg` or force `Content-Disposition: attachment` + `nosniff` | Medium | S | Open |
| 8 | Add `USER` to the backend Dockerfile; drop capabilities on the container | Medium | S | Open |
| 9 | Bound the four on-disk caches (size cap + LRU eviction) | Medium | S | Open |
| 10 | Move the progress registry (and `UploadAdmissionControl`) to Redis | Medium | S | Open |
| 11 | Replace raw `str(exc)` in `detail`/`ingestion_error` with curated messages plus a correlation ID | Medium | S | Open |
| 12 | Escape backslashes in `find_child_folder_by_name` | Low | XS | **Done** — §5.11 |
| 13 | Fail ingestion (or mark `PARTIAL`) when every CSV fails | Low | XS | Open |
| 14 | Warn before re-upload destroys AOIs | Low | S | Open |

---

## 7. File map

| Concern | Path |
| --- | --- |
| Folder picker + clarification UI | [frontend/features/projects/create-project/CreateProjectStep1.tsx](../frontend/features/projects/create-project/CreateProjectStep1.tsx) |
| Client-side structure rules (mirror of the server) | [frontend/features/projects/create-project/folderStructure.ts](../frontend/features/projects/create-project/folderStructure.ts) |
| Wizard orchestration, ZIP packaging, progress polling | [frontend/features/projects/create-project/useCreateProjectWizard.ts](../frontend/features/projects/create-project/useCreateProjectWizard.ts) |
| Edit-mode re-upload | [frontend/features/projects/components/EditProjectDialog.tsx](../frontend/features/projects/components/EditProjectDialog.tsx) |
| HTTP client, XHR upload with progress | [frontend/lib/api/apiFetch.ts](../frontend/lib/api/apiFetch.ts) |
| Typed API surface | [frontend/features/projects/api/projectsApi.ts](../frontend/features/projects/api/projectsApi.ts) |
| Same-origin proxy, body size, timeouts | [frontend/next.config.mjs](../frontend/next.config.mjs) |
| Upload/cancel/progress routes, media proxy | [backend/src/neurodatics/modules/projects/api/routes.py](../backend/src/neurodatics/modules/projects/api/routes.py) |
| Ingestion orchestration + compensation | [backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py](../backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py) |
| ZIP validation and manifest | [backend/src/neurodatics/modules/projects/application/services/zip_validation_service.py](../backend/src/neurodatics/modules/projects/application/services/zip_validation_service.py) |
| Safe extraction | [backend/src/neurodatics/modules/projects/application/services/zip_extraction_service.py](../backend/src/neurodatics/modules/projects/application/services/zip_extraction_service.py) |
| CSV → Parquet | [backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py](../backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py) |
| Progress/cancel registry | [backend/src/neurodatics/modules/projects/application/services/drive_upload_progress_registry.py](../backend/src/neurodatics/modules/projects/application/services/drive_upload_progress_registry.py) |
| Upload concurrency + rate limiting | [backend/src/neurodatics/modules/projects/application/services/upload_throttle.py](../backend/src/neurodatics/modules/projects/application/services/upload_throttle.py) |
| Drive SDK wrapper | [backend/src/neurodatics/infra/storage/gdrive_client.py](../backend/src/neurodatics/infra/storage/gdrive_client.py) |
| Drive OAuth connect/status/sync (authenticated; callback on `public_router`) | [backend/src/neurodatics/modules/integrations/google_drive/api/routes.py](../backend/src/neurodatics/modules/integrations/google_drive/api/routes.py) |
| Structure / bomb-guard / extraction tests | [backend/tests/unit/test_zip_validation_service.py](../backend/tests/unit/test_zip_validation_service.py) |
| Auth / path-confinement / throttle tests | [backend/tests/unit/test_upload_pipeline_hardening.py](../backend/tests/unit/test_upload_pipeline_hardening.py) |
| Credential injection into the global client | [backend/src/neurodatics/modules/integrations/google_drive/infrastructure/configure_client.py](../backend/src/neurodatics/modules/integrations/google_drive/infrastructure/configure_client.py) |
| JWT verification | [backend/src/neurodatics/config/security.py](../backend/src/neurodatics/config/security.py) |
| Settings + production guardrails | [backend/src/neurodatics/config/settings.py](../backend/src/neurodatics/config/settings.py) |
| DB entities (`Project`, `ProjectFile`) | [backend/src/neurodatics/modules/projects/domain/entities.py](../backend/src/neurodatics/modules/projects/domain/entities.py) |
| Parquet read-back | [backend/src/neurodatics/modules/analytics/application/services/parquet_reader_service.py](../backend/src/neurodatics/modules/analytics/application/services/parquet_reader_service.py) |
| Dead code — R2/uploads module | [backend/src/neurodatics/modules/uploads/](../backend/src/neurodatics/modules/uploads/) |
| Dead code — background ingestion stub | [backend/src/neurodatics/workers/tasks/process_experiment_zip.py](../backend/src/neurodatics/workers/tasks/process_experiment_zip.py) |
