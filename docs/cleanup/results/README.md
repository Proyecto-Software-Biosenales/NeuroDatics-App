# Final static reports — 2026-09-03

These are observations, not blanket deletion approval. Initial unconfigured
reports remain unchanged in `../baselines/`; current reports used Ruff 0.16.6,
Vulture 2.16, deptry 0.23.1 and Knip 6.34.0.

- Ruff's selected rule families pass.
- Vulture at 100% passes with `backend/vulture_whitelist.py`. Its three references
  represent required signal/context-manager positional parameters; no production
  handler or schema was deleted to silence a finding. Empty `vulture.txt` means
  the command succeeded without findings.
- Knip default and production both report **zero unused files**. They still exit
  1 for export/type/dependency candidates. Production intentionally omits test-only
  usage. Public exports and live UI primitives were not indiscriminately removed.
- Knip's `hooks` unlisted dependency is the browser harness's local in-memory
  CommonJS module identifier, not an npm package. `postcss-load-config` comes from
  the pre-existing PostCSS JSDoc type reference. The pre-existing direct
  `@eslint/eslintrc` development declaration remains a separate review candidate.
- deptry has no remaining transitive-import findings after four dependencies were
  declared. Its unconfigured namespace detection calls the project's own
  `neurodatics` imports missing dependencies; do not install a package to satisfy
  these. It also reports `psycopg` (SQLAlchemy DSN driver), `cryptography`
  (`python-jose` extra) and `python-multipart` (FastAPI form/upload parsing).
  Those are runtime dependencies and remain. Deptry's exit 1 is therefore retained
  as diagnostic output rather than used as a deletion gate.

The authoritative executable gate is `verify.ps1`: 593 backend tests, 24 snapshots,
48 frontend helper tests, six hook browser cases, zero ESLint errors and all three
architecture contracts passed. Six separate dashboard e2e tests also passed.
Real data and deployed-container coverage remain explicitly open in the ledger.
