# Backend Tier A evidence — 2026-09-03

Baseline verified by the campaign coordinator: 495 backend tests, 38 frontend
tests, typecheck green and the original ESLint ratchet unchanged.

## D1: processing and uploads placeholders

The 20 tracked Python files in `modules/processing/` and `modules/uploads/`
contain only three-line placeholder definitions. Neither module is mounted by
`api/router.py`; neither has import-time registration or package re-exports.
The repository implementation classes reference undefined bases, confirming
these files cannot have been imported by the passing application bootstrap.

The make-unused step is already satisfied: there are no live call sites to
remove. This evidence commit records that no-op before the deletion commit.

Commands run from the repository root (real `.env` files are excluded):

```powershell
git grep -n -E 'modules\.processing|modules\.uploads' -- backend frontend docs delivery 'docker-compose*.yml' ':!*.env' ':!*.lock'
git grep -n -E 'register_processing_routes|ProcessingSchema|ProcessingDTO|ProcessingRepository|process_job|ParquetAdapter|enqueue_processing|get_job_status|register_upload_routes|UploadSchema|UploadDTO|UploadRepository|process_upload|R2StorageAdapter|upload_experiment_folder|validate_upload' -- backend frontend docs delivery 'docker-compose*.yml' ':!*.env' ':!*.lock'
```

The first search has no runtime references. The second finds definitions in the
candidate modules and historical descriptions in `docs/UPLOAD_PIPELINE.md`.
`ZipValidationService.validate_upload` is a different live class method, not a
caller of the uploads placeholder. Generic entity names `Job` and `Upload`
also occur as ordinary prose/types, with no import path into either candidate.
The shipped Compose file starts the real API and worker; it does not name these
modules. Frozen delivery artifacts remain unchanged.

Because `delivery/` is Git-ignored, the tracked-file search above was also
repeated with `rg -l --hidden --no-ignore` directly over `delivery/`, excluding
binary `*.tar.gz` and `*.zip` images. The combined D1/D6 symbol expression
produced zero matching filenames, including when scanning hidden environment
files. Filename-only output avoids printing any secret values. A separate
`GDRIVE_REFRESH_TOKEN` scan matched `.env` and `docker-compose.yml`, supporting
the D4 deferral below.

## D6: seven worker placeholders

The candidates are `tasks/process_experiment_folder.py`,
`tasks/generate_report_pdf.py`, `tasks/extract_metrics.py`,
`pipelines/validations.py`, `pipelines/report_builder.py`,
`pipelines/feature_extraction.py` and `pipelines/csv_to_parquet.py`.
Every file is a three-line stub. Neither worker startup nor task package
initialization discovers or imports them. No enqueue/configuration strings name
these jobs. The make-unused step is already satisfied here as well.

```powershell
git grep -n -E 'process_experiment_folder|generate_report_pdf|extract_metrics|report_builder|feature_extraction|csv_to_parquet|validate_dataset|extract_features|build_report' -- backend frontend docs delivery 'docker-compose*.yml' ':!*.env' ':!*.lock'
```

Matches outside the candidates are the unrelated report-domain placeholder
`build_report` and live executive `build_report_payload`; neither imports these
worker files. Keep `workers/entrypoint.py`, `tasks/process_experiment_zip.py`,
and Redis queue infrastructure: those are explicitly outside Tier A.

## D3: dependency declarations

The Session 0 deptry baseline reports unused `pyjwt` (DEP002) and transitive
imports of `google_auth_httplib2`, `httplib2`, `anyio`, and `numpy` (DEP003).
Source inspection confirms the four latter packages are directly imported.
Authentication uses `from jose import jwt`; no direct PyJWT import exists in
source, tests, scripts, or migrations. Preserve `python-jose`, `cryptography`,
`psycopg`, and `python-multipart`, which have runtime/extra consumers.

`backend/poetry.lock` is tracked. Relock without regenerating it so existing
versions remain stable wherever compatible. Preserve the Python `^3.9` range.

Relock completed without changing any previously locked package version. Ten
new lock entries supply the six development tools and their dependencies
(including two Python-specific Grimp versions). The explicit PyJWT dependency
was removed, but the package correctly remains transitive: the existing
`redis 5.3.1` requires `PyJWT >=2.9.0`, confirmed by
`poetry show --why --tree pyjwt`. Do not delete its lock entry or uninstall it.

Development tool pins preserve Python 3.9 and pytest 7 compatibility:
`ruff 0.16.6`, `vulture 2.16`, `deptry 0.23.1`,
`pytest-regressions 2.8.3`, `syrupy 4.6.1`, and `import-linter 2.5.2`.
Compatibility was checked against each distribution's `Requires-Python` and
dependency metadata. `poetry check` passes with only pre-existing legacy
metadata deprecation warnings. No packages were installed or removed from the
running virtual environment during this manifest/lock update.

## D4: defer the refresh-token setting deletion

The audit's zero-reference claim was incomplete: `GDRIVE_REFRESH_TOKEN` appears
in both root and shipped `delivery/NeuroDatics-App/docker-compose.yml` as
environment forwarding. No application code reads the field, but the frozen
release/configuration boundary needs an explicit compatibility decision. Keep
the field and its example entry for this session; do not modify delivery.

## Restoration

The coordinator records deletion SHAs and exact `git revert <sha>` commands in
`LEDGER.md`. Pre-deletion source remains available with
`git show safety-net-baseline:backend/src/neurodatics/<path>`.
