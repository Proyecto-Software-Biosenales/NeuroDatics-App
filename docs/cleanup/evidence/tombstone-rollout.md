# Tier B observation — prepared 2026-09-03

> **Superseded 2026-09-04.** The user explicitly chose to retire RQ and the seven
> non-OAuth Drive operations after reviewing their current role. The observation
> instructions below are retained as historical evidence; no deployment observation
> or hit count is claimed. OAuth `authorize`/`callback`, Redis caching and synchronous
> ZIP ingestion remain. See `retired-runtime-surfaces.md` for the executed decision.

Nine Google Drive HTTP handlers and `WorkerManager.start` now emit
`TOMBSTONE 2026-09-03 codex <name> caller=<file>:<line> pid=<pid>` at WARNING.
Labels are deduplicated per process and safe under concurrent calls. Logging
does not include request parameters, authorization headers, tokens or user data.
Routes, services, worker tasks and Redis infrastructure remain available.

Local tests exercise an authenticated API request and the actual worker entry
method with a controlled queue client. They assert both the log and the preserved
response/start behavior. Additional tests prove concurrent deduplication and
separate process identities. These checks prove local instrumentation; they do
not prove collection from deployed containers.

## Deployment gate still open

The Docker client exists, but both `docker info` and `docker ps` report that
`dockerDesktopLinuxEngine` is unavailable. No running containers were modified,
and the frozen `delivery/` release was not rebuilt or overwritten. A production
observation window has **not started**.

Before scheduling the harvest:

1. Deploy the reviewed source with normal release procedures.
2. Deliberately exercise a Drive handler using a test account and confirm its
   label in API container logs. Start the worker and confirm `workers.entrypoint`
   in its logs. Keep evidence that the log collector retains both streams.
3. Record deployment time and a harvest date 14–28 days later in `LEDGER.md`.
4. During that window, exercise the shipped frontend's screens and a real,
   appropriately authorized multi-modality experiment. Record which labels fire.

A hit proves a candidate is used. Deduplication means label occurrences are
process-level evidence, **not request counts**. Zero hits only justify deletion
after confirmed log collection, the full observation window and the active sweep.
The integration services behind the Drive routes stay regardless of handler use.

**Harvest date:** pending deployment and verified log collection; never calculated
from the date this instrumentation was merely committed.
