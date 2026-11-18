# Architecture Notes — Training Compliance Radar

## Principles
1. **Code computes, AI communicates.** Compliance status is decided only by deterministic, unit-tested TypeScript. The LLM never decides who is compliant; it only drafts memos, recommends catalog courses, and writes summaries.
2. **Privacy by design.** CSV files are parsed **in the browser**. API routes receive **unit-level aggregates only** — no employee names or IDs ever leave the browser. Names are merged into memos locally.
3. **No database, no accounts (v1).** Nothing is stored server-side. This removes the need for auth and keeps employee data off third-party storage. Calendar what-if edits live in browser memory only (Export calendar CSV keeps them). Persistence and login are v2 items.
4. **Grounded AI output.** Recommendations must come from the uploaded course catalog; the server validates every returned course ID.

## System diagram
```mermaid
flowchart LR
  U[L&D Officer<br/>browser] -->|upload CSVs| P[CSV parser<br/>papaparse, client]
  P --> V[Schema validation<br/>zod, client]
  V --> E[Compliance engine<br/>pure TS, client]
  E --> D[Dashboard UI<br/>Next.js + Tailwind + Recharts]
  V -->|optional calendar.csv| CE[Calendar edits<br/>what-if, browser memory]
  CE --> PL[Plan + costing<br/>cheapest mix, client]
  E --> PL
  PL --> B[Budget burn-down<br/>commitments, balance]
  PL --> CT[Training calendar tab<br/>4 views]
  B --> D
  D -->|aggregates only| A1[/api/recommend/]
  D -->|aggregates only| A2[/api/memo/]
  D -->|aggregates only| A3[/api/summary/]
  A1 & A2 & A3 --> G[Guards: zod validation,<br/>size limits, rate limit]
  G --> L[Vercel AI SDK<br/>generateText + Output.object]
  L --> C[(Groq, Gemini or Claude<br/>chosen by env vars)]
  A1 --> K[Catalog ID check]
  D --> X[CSV / text export]
  D -. analytics .-> M[Vercel Analytics<br/>+ Speed Insights]
```

## Layers (Week 4B reference stack)
| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript (strict) + Tailwind CSS | Recommended stack; first-class Vercel support |
| Look (spec v2.9) | "Civic Ledger": the Tailwind palette is remapped once in `app/globals.css` (indigo → navy `#1E3A5F`, slate → warm paper greys, small radius, no shadows); IBM Plex Sans and Mono via `next/font` | One change restyles every screen consistently; components keep their classes |
| Charts | Recharts | Simple React charts |
| CSV | papaparse (client-side) | Keeps raw employee data in the browser |
| Validation | zod (client + server) | One schema source for CSV rows and API payloads |
| LLM layer | Vercel AI SDK (`ai`, `@ai-sdk/google` default — `gemini-3.8-flash`; `@ai-sdk/groq` — `openai/gpt-oss-120b`; `@ai-sdk/anthropic` — `claude-haiku-5-5`) | Structured output via `generateText + Output.object` + zod; provider swap by one env var (`AI_PROVIDER`); ordered backup chain across providers (`AI_FALLBACK_MODEL`) |
| Orchestration | Next.js Route Handlers (`/api/*`), serverless on Vercel | No always-on server needed |
| Data / retrieval | Curated course catalog CSV (no vector DB) | Small, controlled list; grounding by ID validation |
| Database / Auth | **None in v1 (deliberate)** | Privacy-first; nothing to store or protect |
| Testing | Vitest | Fast unit tests for engine, validation, payload builders |
| CI/CD | GitHub Actions (lint, typecheck, test, build, gitleaks) + Vercel Git deploys | Required by brief |
| Monitoring | Vercel Web Analytics + Speed Insights; structured server logs for AI calls (latency, status) | Required by brief; zero cost |

## Data flow for one memo
1. Engine computes Unit X: 12 at-risk of 85 covered; 3 months left.
2. Client sends `{ unit, atRiskCount, coveredCount, deadline, monthsRemaining, courses[] }` to `/api/memo` — **no names**.
3. Server validates, rate-limits, calls the LLM with a zod output schema → `{ subject, body }` where body contains `{{EMPLOYEE_LIST}}`.
4. Client replaces `{{EMPLOYEE_LIST}}` with the 12 names locally; user copies or exports.

## Budget and training calendar (spec v2.0–v2.9)
All of this runs in the browser, in pure functions under `lib/engine` and `lib/analysis`, with unit tests. No AI is involved and nothing is sent to a server.

| Feature | Module | What it computes |
|---|---|---|
| Trained vs untrained, milestones | `lib/engine/milestones.ts` | Trained and untrained among regular staff in scope; targets of 25/50/85/100% by Mar 31, Jun 30, Sep 30 and Nov 30 (met, missed, upcoming, people still needed) |
| Slicers | `lib/analysis/breakdown.ts`, `lib/engine/bands.ts` | Trained and untrained by pay-grade band, pay grade, department, group and sector (on screen only, never sent to the AI) |
| Recommended-course windows | `lib/analysis/windows.ts` | One window per sector a year for a recommended course (e.g. AMLA), spread so LinkedIn is not loaded all at once; completed, pending, missed |
| Calendar costing | `lib/analysis/costing.ts` | In-house runs: ₱500 per speaker per 2 hours plus snacks (₱75 per 4 hours, ₱150 cap); external runs: fee per participant; 3 : 1 external to in-house mix |
| Plan and cost to close | `lib/analysis/plan.ts` | Licensed staff close through LinkedIn at ₱0; unlicensed staff fill future runs cheapest first, then a paid LinkedIn course; runs below minimum enrolment or after Dec 14 are not held |
| Budget burn-down | `lib/analysis/budget.ts`, `commitments.ts` | Spent by month (attendance costs plus January subscriptions), commitments (future runs, nominations, LinkedIn fees), outstanding and projected year-end balance |
| Collapsed Data and Rules | `lib/analysis/setup.ts`, `components/SetupBar.tsx` | When steps 1 and 2 fold (everything loaded, valid and analyzed, not opened for the same files), and the one-line summary of files and key rules |
| The Money panel | `lib/analysis/money.ts`, `components/MoneyPanel.tsx` | Spent, promised (commitments plus any catalog estimate) and projected left, with shares of the allocation and bar widths that always fill; count and cost of calendar runs still to come |
| Calendar tab | `lib/analysis/calendar-view.ts`, `calendar-timeline.ts` | Run states (completed, planned, standby, blocked after Dec 14), cost at expected enrolment, monthly chart, alerts; year grid, list, course timeline and by-quarter views |
| What-if editing | `lib/analysis/calendar-edit.ts`, `components/CalendarEditor.tsx` | Add, edit, move, duplicate or remove runs with undo, restore and reset. The app analyzes `applyCalendarEdits(calendar, edits)`, so the dashboard, plan, budget and calendar views all recalculate. Edits are validated with the same schema as an uploaded calendar |

Data flow: upload or sample → validated rows → engine results → plan (uses the effective calendar) → budget and calendar views. Changing a rule or editing a run reruns the pipeline in about 300 ms for the 12,000-employee sample.

## Environment variables
| Variable | Values | Default | Notes |
|---|---|---|---|
| `AI_PROVIDER` | `google` \| `anthropic` \| `groq` | `google` | Selects the primary provider for all AI routes |
| `AI_MODEL` | model ID | `gemini-3.8-flash` (google) / `claude-haiku-5-5` (anthropic) / `openai/gpt-oss-120b` (groq) | Optional override |
| `AI_THINKING_LEVEL` | `minimal` | `low` | `medium` | `high` | `low` | Gemini only: lower is faster. Raise it only if answers are poor |
| `AI_FALLBACK_MODEL` | comma-separated `model` or `provider:model` entries, or `none` | `gemini-3.6-flash` (google); `google:gemini-3.6-flash,google:gemini-3.8-flash` (groq) | Backups tried in order (max 3) on 429/5xx, timeout, 404 (retired model) or invalid output; a bad request or key also moves on when the next backup is another provider. Entries without a key for their provider are skipped |
| `GOOGLE_GENERATIVE_AI_API_KEY` | secret | — | Required when `AI_PROVIDER=google` or for a `google:` backup |
| `ANTHROPIC_API_KEY` | secret | — | Required only when `AI_PROVIDER=anthropic` or for an `anthropic:` backup |
| `GROQ_API_KEY` | secret | — | Required when `AI_PROVIDER=groq` or for a `groq:` backup |

Backups run in order and may be on another provider (`provider:model`); unknown primary provider or missing primary key → AI routes return 503 and the engine/dashboard keep working.

## Security
- API key only in env vars (`.env.local` locally; Vercel project settings in prod); never in client code (`NEXT_PUBLIC_` prefix forbidden for secrets).
- Server-side zod validation + payload size limits on every route; `maxDuration` raised for AI routes.
- Best-effort in-memory rate limit per IP (documented limitation on serverless; v2: Upstash/Vercel KV).
- gitleaks in CI; `npm audit` reported in CI.
- Synthetic data only in the public repo.

## Trade-offs accepted
| Choice | Benefit | Cost |
|---|---|---|
| No DB / no auth | Privacy, speed of build | Data must be re-uploaded each session; calendar edits are lost on reload unless exported |
| Cheapest-first calendar plan | Simple, explainable, testable | Not a global optimum; moving or removing one run can change which other runs are needed |
| Client-side parsing | Raw data never leaves the browser | Large files limited by browser memory (cap: 20,000 rows) |
| Catalog CSV, no LinkedIn API | Buildable today, no approval needed | Catalog maintained manually |
| In-memory rate limit | No extra service | Not shared across serverless instances |
| Groq free plan as primary (production), Gemini free tier as backups | ₱0 AI cost; about 1,000 requests a day on Groq versus 20 a day per Gemini model; a retired Gemini model cannot break the AI buttons | Groq caps 8,000 tokens a minute; Google may use free-tier prompts to improve its products. Acceptable because only aggregates and synthetic data are sent |
