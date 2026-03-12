# Project Guidelines

## Architecture

- This workspace is a monorepo with a production-oriented frontend in `frontend/` and an in-progress backend scaffold in `backend/`.
- Frontend code uses Next.js App Router with feature-based folders under `frontend/features/`. Keep route files in `frontend/app/` thin and place most UI and logic inside the matching feature folder.
- Shared frontend primitives live under `frontend/components/ui/`. Prefer reusing these wrappers before adding new ad hoc UI primitives.
- Frontend auth is handled with Supabase client code through `frontend/lib/providers/AuthProvider.tsx` and `frontend/lib/utils/supabase.ts`.
- Backend code is organized by module under `backend/src/neurodatics/modules/` with `api`, `application`, `domain`, and `infrastructure` layers. Preserve that separation when adding backend code.
- Shared backend concerns belong in `backend/src/neurodatics/shared/` or `backend/src/neurodatics/infra/`, not inside a feature module unless the dependency is truly feature-specific.

## Build And Test

- Frontend setup: `cd frontend && npm install`
- Frontend dev server: `cd frontend && npm run dev`
- Frontend production build: `cd frontend && npm run build`
- Frontend lint: `cd frontend && npm run lint`
- Frontend type-check: `cd frontend && npm run typecheck`
- Frontend format: `cd frontend && npm run format`
- Treat frontend scripts in `frontend/package.json` as authoritative.
- Backend scripts in `backend/scripts/` and the backend `pyproject.toml` are placeholders right now. Do not assume the backend is fully runnable without first checking or wiring missing setup.

## Conventions

- Follow the existing feature-based frontend structure: keep feature types, components, hooks, and helpers close to the feature that owns them.
- Prefer TypeScript path aliases like `@/features/...`, `@/components/...`, and `@/lib/...` instead of deep relative imports.
- Match the local file style when editing frontend files. Existing files currently mix quote styles, so preserve the style already used in the file instead of reformatting unrelated code.
- Use named exports for reusable React components and utilities unless a file already follows a different pattern.
- For client-side interactive components in the App Router, add `'use client'` only when required by hooks, browser APIs, or client-only auth flows.
- Reuse the shared `cn` utility and existing UI wrappers before introducing duplicate styling helpers or new component abstractions.
- Keep route pages and layout files focused on composition. Put substantial UI logic in feature components.
- On the backend, keep HTTP schemas and route handlers in `api/`, orchestration in `application/`, business rules in `domain/`, and persistence or adapters in `infrastructure/`.

## Project-Specific Notes

- The frontend is the most complete part of the repo. Prefer grounding changes in existing frontend patterns such as `frontend/features/auth/components/LoginForm.tsx`, `frontend/lib/providers/AuthProvider.tsx`, and `frontend/features/projects/components/ProjectsGrid.tsx`.
- Several backend files are still placeholders, including `backend/src/neurodatics/main.py` and the shell scripts under `backend/scripts/`. When working in the backend, verify whether a file is scaffold-only before building on top of it.
- The workspace path contains `Bioseñales`. Be careful with terminal commands and scripts on Windows if a tool has path encoding issues.
- If a task spans frontend and backend, call out any missing integration contract explicitly rather than inventing backend behavior that is not implemented yet.

## Guidance For Agents

- Prefer minimal, focused edits that preserve the current structure and naming patterns.
- Do not rewrite large areas just to normalize style.
- When a requested backend change depends on missing runtime setup, implement only what is grounded in the current scaffold and note any missing pieces.
- When adding new instructions later, prefer area-specific files under `.github/instructions/` only if conventions for frontend and backend start to diverge enough that repo-wide guidance becomes noisy.