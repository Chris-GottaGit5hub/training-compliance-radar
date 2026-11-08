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
- `/lib/ai` — provider selection, prompts, structured-output (`generateText` + `Output.object`) calls, catalog-ID filtering
- `/lib/payload` — builders that turn engine results into aggregate-only API payloads
- `/components` — React UI components
- `/scripts` — seeded synthetic data generator → `/public/sample/*.csv`
- `/tests` — Vitest tests mirroring `/lib`

## Environment Variables
| Variable | Values | Default | Notes |
|---|---|---|---|
| `AI_PROVIDER` | `google` \| `anthropic` \| `groq` | `google` | Selects the primary provider for all AI routes |
| `AI_MODEL` | model ID | `gemini-3.8-flash` (google) / `claude-haiku-5-5` (anthropic) / `openai/gpt-oss-120b` (groq) | Optional override |
| `AI_THINKING_LEVEL` | `minimal` | `low` | `medium` | `high` | `low` | Gemini only: lower is faster. Raise it only if answers are poor |
| `AI_FALLBACK_MODEL` | comma-separated `model` or `provider:model` entries, or `none` | `gemini-3.6-flash` (google); `google:gemini-3.6-flash,google:gemini-3.8-flash` (groq) | Backups tried in order (max 3) on 429/5xx, timeout, 404 (retired model) or invalid output; a bad request or key also moves on when the next backup is another provider. Entries without a key for their provider are skipped |
| `GOOGLE_GENERATIVE_AI_API_KEY` | secret | — | Required when `AI_PROVIDER=google` or for a `google:` backup |
| `ANTHROPIC_API_KEY` | secret | — | Required only when `AI_PROVIDER=anthropic` or for an `anthropic:` backup |
| `GROQ_API_KEY` | secret | — | Required when `AI_PROVIDER=groq` or for a `groq:` backup |

Backups may be on another provider (`provider:model` in `AI_FALLBACK_MODEL`); unknown primary provider or missing primary key → AI routes return 503 (`spec.md` §7). Template in `.env.example`.

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
