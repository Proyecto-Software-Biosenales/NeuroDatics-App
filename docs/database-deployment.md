# Database deployment

## Verified 2026-09-19

The database configured in the root `.env` accepts connections and is at Alembic
025 on PostgreSQL 17.6. Read-only catalog checks confirmed the nullable JSON
`projects.analytics_transform_tokens` column, all six indexes from 023 (valid and
ready), and `projects.source_folder_name` from 025. The private `backend/.env`
now uses the same working URL; its old password differed.

Migration 004 now replaces only actual, single-column sex CHECK constraints.
The full chain from an empty PostgreSQL 18 database to 025 passed, as did
constraint-preservation, token concurrency, downgrade and re-upgrade checks.
Run `.venv/Scripts/python.exe docs/perf/bench/check_postgres_migrations.py`
from the repository root to reproduce; it creates and stops a private local
cluster and disables application dotenv loading. Evidence:
`output/postgres-migration-fix.log`.

No live schema was changed and no application was restarted. Existing packaged
images were not rebuilt. Confirm the intended production project and the location
of any separate deployment before updating that deployment.

## Obtain a replacement Supabase connection

1. Sign in to the Supabase Dashboard and open the intended project. Confirm its
   organization, project name and project reference under project settings.
2. Click **Connect**. Copy the **Direct connection** URI for migrations if the
   machine can reach that endpoint. On IPv4-only networks, choose **Session pooler**
   instead (port 5432). Copy the complete hostname and username; do not guess the
   region or pooler cluster number.
3. Replace the password placeholder with the project's database password, not an
   API key or your Supabase account password. Percent-encode reserved characters
   in the password. The dashboard template does not recover an unknown password;
   if necessary, the project owner can reset it under **Database Settings**.
   A reset also requires updating other applications using that database password.
   No reset is needed for the currently working connection.
4. For this SQLAlchemy application, use the `postgresql+psycopg://` scheme and
   include `sslmode=require` (or a configured stricter certificate-verification
   mode). Direct connections use `postgres`; shared pooler connections use
   `postgres.<project-ref>`.
5. Put the completed URL in the private `DATABASE_URL` setting. Local Python and
   Alembic use `backend/.env`; root Docker Compose uses root `.env`. An exported
   `DATABASE_URL` can override file settings. A separate delivery directory/server
   has its own configuration and must be checked independently.
6. Keep the password and complete URL out of chat and version control. To identify
   a replacement target, share only the project reference, host, port, database
   and username, and say where the private URL was saved.

Official guidance:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/troubleshooting/tenant-or-user-not-found

For another PostgreSQL provider, obtain the same information from its database
connection panel: hostname, port, database, role, password and TLS requirements.

## Verify before starting a new backend

From `backend/`, with the intended private configuration loaded:

```powershell
../.venv/Scripts/python.exe -m alembic current
../.venv/Scripts/python.exe -m alembic heads
```

For this checkout, both should report 025. If the target is behind, confirm the
target and its backup, then run `../.venv/Scripts/python.exe -m alembic upgrade head`.
Do not use `alembic stamp` to skip unapplied migrations. The database already
checked at 025 needs no migration rerun. Check the actual token column and index
definitions as well as the revision before rollout; a revision marker alone is
not proof of schema correctness.
