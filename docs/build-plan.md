# Build Plan — Training Compliance Radar

Runbook for finishing **AIM Graded Assignment 4.2** (deadline **Nov 9, 2026**).
Source of truth for behavior is [`spec.md`](../spec.md); project rules are in [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md).

## Status

| # | Checkpoint | Status |
|---|---|---|
| 0 | Spec, PRD, architecture, validation docs; scaffold; schemas, engine, sample data, tests | ✅ Complete |
| 1 | UI per spec §6 | ✅ Complete (pushed, `5468db9`) |
| 2 | AI routes per spec §5 and UI wiring | ⬜ Not started |
| 3 | CI and security | ⬜ Not started |
| 4 | Docs, reflection, demo script, v2 issue | ⬜ Not started |

Update this table as each checkpoint lands.

## Working rules

- One feature per task; small, reviewable, conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`, `refactor:`).
- Before every commit batch: `npm run lint && npm run typecheck && npm test && npm run build` must be green.
- Tests with every `/lib` change. If the spec is unclear or wrong, change `spec.md` first and add a Revision Log row.
- Hard rules: the LLM never computes compliance or counts; no employee names or IDs in any API request or log; no secrets in code or git; no database, auth, or new paid service; synthetic data only.

## Checkpoint 1 — UI ✅

Single page, four steps (spec §6): data upload or sample data → rules form → dashboard (KPIs, at-risk chart, ranked units, back-test card) → unit panel (at-risk list, CSV export). AI buttons were disabled placeholders.

Done when: sample data loads, KPIs equal engine output, errors are row-numbered, layout works on mobile. Verified in the browser on the production build.

## Checkpoint 2 — AI routes

Scope (spec §3.4, §5, §7):

- `/api/recommend`, `/api/memo`, `/api/summary`: POST, JSON, zod-validated, `maxDuration = 60`.
- Vercel AI SDK structured output with zod schemas; provider from env (`AI_PROVIDER`, default `google`; model default `gemini-3.8-flash`; Anthropic is a one-env-var alternative).
- Aggregates-only payload builders in `lib/payload` (small-cell suppression of positions).
- Server post-processing: catalog-ID filtering with search fallback, `{{EMPLOYEE_LIST}}` enforcement, memo fact tokens, numeric grounding check.
- Guards: 200 KB body limit, string caps, in-memory rate limit of 10 requests per minute per IP, 503 when AI is not configured.
- One-line AI call logs (route, provider, model, latency, status); never payloads.
- Client wiring: Generate memo (names merged locally), Recommend courses, Executive summary, Copy/Export.
- Tests: payload builders (no names or IDs), catalog filtering, memo token, rate limiter, provider resolution, grounding.

Done when: lint, typecheck, test, build are green; with no API key the UI shows "AI not configured" and the rest still works.

## Checkpoint 3 — CI and security

- `.github/workflows/ci.yml`: `npm ci`, lint, typecheck, test, build, `npm audit --audit-level=high` (report-only), gitleaks.
- Confirm no secrets exist in git history.
- CI badge in the README.

Done when: the workflow file is valid and the history scan is clean.

## Checkpoint 4 — Docs

- `README.md`: problem, live URL, screenshots placeholder, features, architecture link, setup, env vars, tests, back-test results, privacy note (including the Gemini free-tier note), limitations, roadmap, submission checklist mapped to the brief.
- `docs/reflection.md` (draft with `[CHRIS: personalize]` markers).
- `docs/demo-script.md` (2 minutes, timestamps).
- GitHub issue "v2: persistence, auth, LinkedIn Learning API sync, explanation-reply analyzer, slot matchmaker" (or `docs/v2-issue.md`).

## Final deliverable

`docs/overnight-report.md`: what was completed, spec deviations, anything failed or skipped, and an exact checklist of what to verify on the live site.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Lint / types / tests / build | `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` |
| Regenerate sample data | `npm run sample-data` |
