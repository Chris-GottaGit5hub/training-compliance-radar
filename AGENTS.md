# AGENTS.md

## Project Overview
Training Compliance Radar — a privacy-first web app for L&D officers. Upload roster, attendance, and course catalog CSVs → deterministic engine computes churn-aware "≥1 training per year" compliance → AI drafts unit memos, recommends catalog courses, writes an executive summary. Full requirements: `spec.md` (source of truth) and `docs/prd.md`.

## Commands
- dev: `npm run dev`
- test: `npm test` (Vitest)
- lint: `npm run lint`
- typecheck: `npm run typecheck` (`tsc --noEmit`)
- build: `npm run build`
- sample data: `npm run sample-data`

## Architecture
- `/app` — Next.js App Router pages and `/app/api/*` route handlers (recommend, memo, summary)
- `/lib/engine` — pure compliance engine (no I/O, no AI) + back-test + cost-to-close
- `/lib/schemas` — zod schemas for CSV rows, settings, API requests/responses
- `/lib/ai` — provider selection, prompts, `generateObject` calls, catalog-ID filtering
- `/lib/payload` — builders that turn engine results into aggregate-only API payloads
- `/components` — React UI components
- `/scripts` — seeded synthetic data generator → `/public/sample/*.csv`
- `/tests` — Vitest tests mirroring `/lib`

## Constraints (never violate)
1. Compliance status is computed ONLY in `/lib/engine`. Never ask the LLM to decide compliance or compute counts.
2. API payloads must never contain employee names or IDs — aggregates only. Names are merged client-side into `{{EMPLOYEE_LIST}}`.
3. No secrets in code. Read keys from env vars only; never use the `NEXT_PUBLIC_` prefix for secrets; never commit `.env*` except `.env.example`.
4. Every API route validates input with zod server-side, enforces size limits and rate limiting, and sets `maxDuration = 60`.
5. Course recommendations must be filtered against the submitted catalog before returning.
6. No database, auth, or server-side storage in v1.
7. Use synthetic data only.

## Conventions
- TypeScript strict; no `any`. Functional React components; Tailwind only (no inline styles).
- Small files (< 200 lines) and pure functions where possible.
- Tests for every exported function in `/lib`.
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`, `refactor:`.
- If the spec is ambiguous, ask or update `spec.md` (with a Revision Log entry) before coding.
