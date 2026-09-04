# Final static reports — 2026-09-04

These are observations, not blanket deletion approval. Initial unconfigured reports
remain unchanged in `../baselines/`; current reports used Ruff 0.16.6, Vulture 2.16,
deptry 0.23.1 and Knip 6.34.0.

- Ruff's selected rule families pass over all backend source and tests.
- Vulture at 100% passes with `backend/vulture_whitelist.py`. Its three references
  represent required signal/context-manager positional parameters; empty
  `vulture.txt` means the command succeeded without findings.
- Deptry scans 142 files and passes as part of `verify.ps1`. Exact DEP002 exceptions
  retain `psycopg` (SQLAlchemy DSN driver), `cryptography` (`python-jose` extra) and
  `python-multipart` (FastAPI form/upload parsing), all runtime-discovered packages.
- Knip default and production report zero unused files and zero dependency findings.
  They still exit 1 for exported symbols/types from active modules. Production
  intentionally omits test-only usage; these residual exports are review candidates,
  not deletion authority.

The authoritative executable gate is `verify.ps1`: 586 backend tests, 24 protected
snapshots, 48 frontend helper tests, 17 real Chromium component/hook cases, zero
ESLint errors, six intentional stimulus/blob image warnings and all three architecture
contracts pass. The production Next.js build passes. Six comparison-dashboard and one EEG
dashboard Playwright test pass together.

The two local reference experiments validate 14 participants, 16 scenarios, 261,194
sensor rows, 1,508 events, all three modalities, 96 numerical service calls and 110
scenario Parquets. Raw experiment files stay ignored; only aggregate evidence is
versioned. Existing historical Parquets remain readable and are not rewritten by the
new seconds/millimetres import normalization.
