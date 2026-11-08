# spec.md — Training Compliance Radar (v1.9)

> Source of truth for implementation. When code and spec disagree, **the spec wins** — update the spec first, then the code.

## 1. Context & Goal
L&D officers in Philippine government agencies must ensure every covered employee completes at least one qualifying training per year. Today, non-compliance is found only at year-end. This app takes three CSVs (roster, attendance, course catalog), computes a **churn-aware** compliance status as of any date, ranks units by risk, and uses AI to draft early-warning memos, recommend catalog courses, and summarize status. Users: L&D compliance officers (primary), unit heads and department heads (readers of outputs).

## 2. Inputs

### 2.1 roster.csv (required)
| Column | Type | Rules |
|---|---|---|
| employee_id | string | required, unique |
| name | string | required |
| unit | string | required (current unit; transfers counted here) |
| position | string | required |
| employment_type | `regular` \| `contractual` \| `casual` | required |
| hire_date | `YYYY-MM-DD` | required, valid date |
| separation_date | `YYYY-MM-DD` or empty | optional; if present must be ≥ hire_date |
| licensed | `yes` \| `no` | required (has e-learning license) |

### 2.2 attendance.csv (required)
| Column | Type | Rules |
|---|---|---|
| employee_id | string | required |
| training_title | string | required |
| training_date | `YYYY-MM-DD` | required |
| hours | number ≥ 0 | required |
| delivery | `classroom` \| `elearning` \| `external` | required |
| cost | number ≥ 0 (PHP) | required (0 allowed) |

### 2.3 catalog.csv (optional — enables recommendations and cost-to-close)
| Column | Type | Rules |
|---|---|---|
| course_id | string | required, unique |
| title | string | required |
| skill_area | string | required |
| duration_minutes | integer > 0 | required |
| provider | `linkedin_learning` \| `in_house` | required |
| url | https URL or empty | optional |
| cost_per_head | number ≥ 0 (PHP) | required (0 for licensed e-learning) |

Without a catalog, the dashboard and memos still work; the Recommendations panel and cost-to-close KPI show an empty state ("Upload a catalog to enable").

### 2.4 Settings (UI)
```ts
interface RulesConfig {
  year: number;                 // default: current year (Asia/Manila)
  asOfDate: string;             // YYYY-MM-DD, default: today in Asia/Manila; must fall within `year`
  lateHireCutoff: string;       // default: `${year}-10-01`; hired on/after → Exempt; must fall within `year`
  coveredTypes: EmploymentType[]; // default: ['regular','contractual','casual']; at least one
  elearningCounts: boolean;     // default: true
  minHours: number;             // default: 1 — a training counts only if hours ≥ minHours
  budgetPhp: number;            // default: 0 (budget comparison hidden if 0)
}
```
Derived (not user-editable): `deadline = ${year}-12-31`.

### 2.5 Parsing & normalization (applies to all CSVs)
- UTF-8; a leading BOM is stripped. Header names are trimmed and lower-cased; unknown extra columns are ignored.
- Every cell is trimmed; a cell that is empty after trimming counts as missing.
- Enum values are matched case-insensitively and stored lower-case (`Regular` → `regular`).
- Dates must match `^\d{4}-\d{2}-\d{2}$` **and** be a real calendar date (`2026-02-30` is an error). Dates are compared as `YYYY-MM-DD` strings; the engine never converts them to `Date` objects or time zones.
- `employee_id` is matched exactly after trimming (case-sensitive).
- Units are grouped by their trimmed value; if two unit names differ only by letter case, show a warning (not an error).
- Attendance rows dated outside `year` are valid but never qualify (not an error).
- Exact duplicate attendance rows (same `employee_id`, `training_title`, `training_date`) are counted once and reported in a warning.
- Duplicate `course_id` in the catalog → validation error listing the IDs.

## 3. Outputs

### 3.1 Employee status (engine)
```ts
type Status = 'COMPLIANT' | 'AT_RISK' | 'EXEMPT' | 'EXCLUDED' | 'NOT_COVERED';
interface EmployeeResult { employeeId: string; unit: string; status: Status; reason: string; qualifyingCount: number; }
```
### 3.2 Unit summary
`summarizeUnits(results, roster)` takes the roster as well as the results, because `EmployeeResult` carries no licensing; it reads `licensed` there to fill `atRiskLicensed` and `atRiskUnlicensed`.
```ts
interface UnitSummary { unit: string; covered: number; compliant: number; atRisk: number;
  atRiskLicensed: number; atRiskUnlicensed: number;
  complianceRate: number; // percent 0–100, rounded to 1 decimal; 0 if covered = 0
}
```
### 3.3 Org summary
`{ covered, compliant, atRisk, exempt, excluded, notCovered, complianceRate, monthsRemaining, deadline, unitsRanked: UnitSummary[] }`

### 3.4 AI outputs (zod schemas, server-side)
- `/api/recommend` → `{ recommendations: { unit: string; courseIds: string[] (≤3); rationale: string (≤300 chars); fallbackSearch: boolean }[] }`
- `/api/memo` → `{ subject: string; body: string; warning?: 'unverified_numbers' }` — returned body contains the literal token `{{EMPLOYEE_LIST}}` exactly once
- `/api/summary` → `{ summary: string (≤ 250 words); warning?: 'unverified_numbers' }`

## 4. Behavior Rules (compliance engine — pure functions in `lib/engine/`)
Evaluate each roster row in this order (first match wins):
1. `hire_date > asOfDate` → **NOT_COVERED** ("Not yet hired as of date")
2. `separation_date` present and `≤ asOfDate` → **EXCLUDED** ("Separated")
3. `employment_type ∉ coveredTypes` → **NOT_COVERED** ("Employment type not covered")
4. `hire_date ≥ lateHireCutoff` → **EXEMPT** ("Late hire")
5. Count **qualifying trainings**: attendance rows for this employee where `training_date` is within `year`, `training_date ≤ asOfDate`, `hours ≥ minHours`, and (`delivery ≠ 'elearning'` OR `elearningCounts`). If count ≥ 1 → **COMPLIANT**, else → **AT_RISK**.

Other rules:
- Covered = COMPLIANT + AT_RISK. `complianceRate` = compliant / covered × 100, rounded half-up to 1 decimal (0 when covered = 0). Rounding happens once, in the engine; UI and payloads use the rounded value.
- `monthsRemaining` = `12 − month(asOfDate)` (Jan → 11, Sep 1 and Sep 30 → 3, Dec → 0).
- Units ranked by `atRisk` desc, then the **unrounded** ratio compliant/covered asc, then unit name asc (locale-independent code-point order).
- Attendance rows whose employee_id is not in the roster are ignored and counted in a warning.
- Duplicate `employee_id` in roster → validation error listing the IDs; nothing processed.

### 4.1 Back-test
`backtest(roster, attendance, config, checkpointDate)` — `checkpointDate` must be within `config.year` and before `deadline`. Run the engine twice with the same config, changing only `asOfDate`: once at `checkpointDate`, once at `deadline`.
- `flaggedAtCheckpoint` = count of AT_RISK at checkpoint.
- `nonCompliantAtYearEnd` = count of AT_RISK at deadline.
- `caughtEarly` = count of employees AT_RISK at **both** runs.
- `notCoveredAtCheckpoint` = employees AT_RISK at deadline whose checkpoint status was not AT_RISK or COMPLIANT (e.g., hired after the checkpoint). They stay in the denominator.
- `recall` = caughtEarly / nonCompliantAtYearEnd; `precision` = caughtEarly / flaggedAtCheckpoint; each is `null` when its denominator is 0.
- Returns counts only (no IDs). `recall` and `precision` are 0–1 ratios (unrounded).
- **Reporting:** the app reports recall **and** precision at two checkpoints, Jun 30 and Sep 30 of `year` (two calls to `backtest`).
- **Reading precision:** `1 − precision` is the share of employees flagged at the checkpoint who were not AT_RISK at year end, i.e. who were trained before year-end (or separated). They are the group early nudges target. Recall alone is easy to satisfy because an untrained, still-covered employee stays AT_RISK until trained; precision shows how many flags were later closed.

### 4.2 Cost-to-close
`costToClose(results, roster, catalog, config)` likewise takes the roster to read each employee's licensing.
- A catalog course **qualifies** if `duration_minutes ≥ minHours × 60`.
- Licensed AT_RISK employee → cheapest qualifying `linkedin_learning` course, **only if `elearningCounts` is true**; otherwise use the unlicensed route.
- Unlicensed AT_RISK employee → cheapest qualifying `in_house` course `cost_per_head`.
- If a route has no qualifying course, those employees are counted in `unpricedCount` and `costToClose` is shown as a lower bound with a warning.
- Output: `{ costToClose, unpricedCount, remaining: budgetPhp − costToClose, covered: remaining ≥ 0 && unpricedCount = 0 }`.
- The cost-to-close KPI shows whenever a catalog is loaded; the budget line (`remaining`, covered/short) shows only when `budgetPhp > 0`.

### 4.3 Validation & limits
- Max file size 5 MB each; max 20,000 rows per file; reject missing required columns with a message naming them.
- Row-level errors: show first 20 with row numbers; block processing if any required-field error exists.

### 4.4 Export
- Exports: at-risk list CSV (per unit and all units) and memo text.
- CSV cells starting with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with `'` (formula-injection guard). Files are UTF-8 with BOM so Excel shows names correctly.

## 5. API Contracts (Next.js Route Handlers)
All routes: POST, JSON, zod-validated, `maxDuration = 60`, request body ≤ 200 KB (else 413), in-memory rate limit **10 requests/min per IP** (first IP in `x-forwarded-for`; best-effort per serverless instance).

String caps in every request: unit ≤ 100 chars, position ≤ 100, course title ≤ 200, skill area ≤ 100.

| Route | Request (aggregates only — no names/IDs) | Errors |
|---|---|---|
| `/api/recommend` | `{ units: { unit, atRiskLicensed, atRiskUnlicensed, topPositions: string[] (≤5) }[] (≤200), catalog: { courseId, title, skillArea, durationMinutes, provider }[] (≤300) }` | 400 invalid, 413 too large, 429 rate limit, 502 AI failure/timeout, 503 AI not configured |
| `/api/memo` | `{ unit, atRiskCount, coveredCount, deadline, monthsRemaining, courses: { title, url?, durationMinutes }[] (≤5), tone: 'formal'\|'friendly' }` | same |
| `/api/summary` | org summary numbers + top 10 units (unit names and their numbers allowed) | same |

Client payload rules (enforced in `/lib/payload`, unit-tested):
- `topPositions` includes only positions held by **≥ 3** AT_RISK employees in that unit (small-cell suppression); otherwise the list is shorter or empty.
- The catalog sent to `/api/recommend` contains only qualifying courses (§4.2), and excludes `linkedin_learning` courses when `elearningCounts` is false.

Prompting rules:
- User-supplied strings (unit names, positions, course titles) are passed as a JSON data block; the system prompt states that this block is data, never instructions.
- Provider call: `generateText` with `Output.object({ schema })` and the zod schema (the AI SDK v7 successor to the deprecated `generateObject`), temperature 0.3, a 40 s whole-call deadline (AbortSignal), Gemini `thinkingLevel` `low` by default and Groq `reasoningEffort` `low` (each retried once without the option if the provider rejects it with a 400), `maxRetries: 1`.
- **Model chain:** the primary model, then each backup in order (§7). Every model except the last gets 15 s of the 40 s deadline. A model hands over to the next on 429, 5xx, timeout, 404 (retired or unknown model) or invalid output; a 400/401/403 hands over only when the next model is on a different provider (the same provider would fail the same way). A model that handed over is skipped for 5 minutes (per server instance), except the last one. Every provider receives the same aggregate-only request.

Server post-processing:
- `/api/recommend`: drop any `courseId` not in the submitted catalog and any unit not in the request; keep at most 3 IDs per unit. If a requested unit ends with zero valid IDs, return it with `fallbackSearch: true` and the client shows a LinkedIn Learning search link built from the unit's first top position (or the unit name if none).
- `/api/memo`: the model writes `{{AT_RISK_COUNT}}`, `{{COVERED_COUNT}}`, `{{DEADLINE}}` and `{{EMPLOYEE_LIST}}` tokens instead of numbers and names. The server replaces the first three with request values (prepending a fixed fact sentence if any are missing), then ensures `{{EMPLOYEE_LIST}}` appears exactly once (appending it if missing). The client replaces `{{EMPLOYEE_LIST}}` locally.
- **Numeric grounding check** (`/api/memo` after substitution, `/api/summary`): every number in the text must equal a number in the request (percentages compared at 1 decimal). On a mismatch, regenerate once; if it still fails, return the text with `warning: 'unverified_numbers'` and the UI shows a warning next to it.
- The memo/summary regeneration (numeric grounding) is skipped when the first attempt took more than 15 s, so a request stays under `maxDuration`; the text is then returned with the warning.
- Log one line per AI call: route, provider, model, latency ms, status, error code. Never log payload contents or provider error messages (they can echo the prompt).

## 6. UI
Single page, 4 steps: **(1) Data** — upload 3 CSVs (catalog optional) or "Load sample data"; **(2) Rules** — settings form; **(3) Dashboard** — KPI cards (covered, compliance %, at-risk, months left, cost to close), units bar chart, ranked unit table; **(4) Unit panel** — at-risk employee list, recommended courses (with links), Generate memo, Copy, Export. Header button: **Executive summary**, which opens a card with the AI-written summary plus four charts drawn by the app from the engine's numbers (status breakdown, highest-risk units, back-test recall and precision at Jun 30 and Sep 30, and cost to close vs budget). The charts never depend on AI output and still show if the AI call fails. Footer: privacy note.
States: loading spinners on AI buttons; error banners with retry; empty states. If an AI route fails (503, 502, 429, timeout), the UI shows the reason with a Retry button, and the memo and executive summary views also show a clearly labeled **template draft** built locally from the engine's numbers (no AI), so the user always gets usable text. Recommend courses likewise shows clearly labeled **template picks**: for each unit, up to 3 courses from the qualifying catalog (§5 client payload rules) ranked by how many words of the unit's name and top positions (3+ letters; the same word or the same 5-letter stem) appear in the course title or skill area, then lowest cost per head, then shortest duration, then course ID; the LinkedIn Learning search link when no course qualifies. A memo drafted after a failed Recommend uses the template picks. AI buttons are never disabled permanently after a failure; the engine and dashboard keep working. Mobile-friendly layout.

## 7. Constraints
- Next.js (App Router) + TypeScript strict + Tailwind; Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/groq`); Vitest; Node LTS.
- **AI provider configuration (env vars):**

  | Variable | Values | Default | Notes |
  |---|---|---|---|
  | `AI_PROVIDER` | `google` \| `anthropic` \| `groq` | `google` | Selects the primary provider for all AI routes |
  | `AI_MODEL` | model ID | `gemini-3.8-flash` when `google`; `claude-haiku-5-5` when `anthropic`; `openai/gpt-oss-120b` when `groq` | Optional override |
  | `AI_THINKING_LEVEL` | `minimal` | `low` | `medium` | `high` | `low` | Gemini only; lower is faster |
  | `AI_FALLBACK_MODEL` | comma-separated backups, each `model` (same provider as the primary) or `provider:model`; or `none` | `gemini-3.6-flash` when `google`; `google:gemini-3.6-flash,google:gemini-3.8-flash` when `groq`; none when `anthropic` | Backups tried in order (Model chain, §5), at most 3. Entries with an unknown provider or no key for their provider, duplicates and the primary itself are skipped |
  | `GOOGLE_GENERATIVE_AI_API_KEY` | secret | — | Required when `AI_PROVIDER=google`, or for a `google:` backup |
  | `ANTHROPIC_API_KEY` | secret | — | Required when `AI_PROVIDER=anthropic`, or for an `anthropic:` backup |
  | `GROQ_API_KEY` | secret | — | Required when `AI_PROVIDER=groq`, or for a `groq:` backup |

  Switching provider = set `AI_PROVIDER` (plus its key). Backups may be on another provider when listed with a `provider:` prefix and that provider's key is set. Unknown primary provider or missing primary key → AI routes return 503 `{ error: 'ai_not_configured' }`. `GET /api/status` lists the primary and the backups by name only (`provider:model`), never keys, and makes no model call.
- No database, no auth, no server-side storage of uploaded data.
- Synthetic sample data only (generated by `scripts/generate-sample-data.ts`, seeded, ~300 employees, ~12 units, includes mid-year hires, separations, late hires, and attendance across the full year so the back-test is meaningful).

## 8. Acceptance Criteria (Given / When / Then)
1. Given sample data and asOf = Sep 30, when processed, then dashboard KPIs equal engine outputs and units are ranked per §4.
2. Given an employee hired Oct 15 (cutoff Oct 1) and an as-of date of Nov 30, then status = EXEMPT. (Evaluated as of Sep 30 the same employee is NOT_COVERED by rule 1, because rules are applied in order.)
3. Given an employee separated Mar 31 and asOf = Sep 30, then status = EXCLUDED.
4. Given an employee with one e-learning course of 0.5 h and minHours = 1, then status = AT_RISK.
5. Given elearningCounts = false and only e-learning attended, then status = AT_RISK.
6. Given roster with duplicate employee_id, then an error lists the duplicates and nothing is processed.
7. Given an AI response containing an unknown courseId, then it is removed and never displayed.
8. Given any AI request payload built by the client, then it contains no employee names or IDs, and no position held by fewer than 3 at-risk employees in that unit (unit test on payload builders).
9. Given 11 requests in a minute from one IP, then the 11th returns 429.
10. Given the deployed URL in an incognito window, then "Load sample data" → dashboard → memo works end-to-end.
11. Given only `GOOGLE_GENERATIVE_AI_API_KEY` set and `AI_PROVIDER`/`AI_MODEL` unset, then AI calls use `google` / `gemini-3.8-flash` (visible in the AI call log line).
12. Given no API key for the selected provider, then AI routes return 503 and the dashboard still works.
13. Given elearningCounts = false, then cost-to-close prices licensed at-risk employees on the in-house route.
14. Given an exported name starting with `=`, then the CSV cell is prefixed with `'`.
15. Given a memo, then the displayed at-risk count and deadline equal the engine values (token substitution, not model text).
16. Given `AI_PROVIDER=groq` with Groq and Google keys set and `AI_FALLBACK_MODEL` unset, when Groq returns 429 or 404, then `gemini-3.6-flash` answers, and `gemini-3.8-flash` if that also fails (unit test with fake models).
17. Given Recommend courses fails, then each unit shows labeled template picks drawn only from qualifying catalog courses.

## 9. Test Plan (Vitest, ≥ 10 tests)
Engine: rules 1–5 each, monthsRemaining (Jan/Sep/Dec), rounding, ranking order, back-test (recall, precision, null denominators, hires after checkpoint), cost-to-close (both routes, elearningCounts = false, minHours filter, unpriced). Validation: missing columns, duplicates, bad and impossible dates, normalization (BOM, case, whitespace). API helpers: catalog ID filtering, memo token substitution and `{{EMPLOYEE_LIST}}` enforcement, numeric grounding check, payload builders exclude PII and suppress small cells, rate limiter, provider/model resolution from env (backup list, cross-provider keys), model-chain hand-over rules (404, cross-provider 400, cooldown), template recommendations, CSV export escaping.

## 10. Revision Log
| Version | Date | Change | Reason |
|---|---|---|---|
| 1.0 | 2026-11-07 | Initial spec | — |
| 1.1 | 2026-11-07 | Default AI provider → Google Gemini (`AI_PROVIDER=google`, `GOOGLE_GENERATIVE_AI_API_KEY`, default model `gemini-3.8-flash`); Anthropic kept as one-env-var alternative with its own default model; no runtime fallback; 503 when AI not configured. Cost-to-close respects `elearningCounts`/`minHours` and handles missing routes. Back-test fully defined (adds precision, null rules). Dates handled as strings in Asia/Manila; `monthsRemaining` formula; `deadline` defined; rounding rule. CSV normalization rules; catalog made optional. Memo numbers via server-filled tokens; numeric grounding check for memo/summary. Small-cell suppression for positions; prompt-injection, string, body-size, timeout and log rules. CSV export formula-injection guard. Acceptance criteria 11–15 and test plan updated. | senior-engineer review |
| 1.2 | 2026-11-08 | Acceptance criterion 2 now states the Nov 30 as-of date (a Sep 30 evaluation gives NOT_COVERED by rule 1). Back-test reports recall and precision at Jun 30 and Sep 30, with a note that 1 − precision is the group early nudges target. `summarizeUnits` and `costToClose` take the roster to read licensing. | clarifications from engine implementation |
| 1.3 | 2026-11-08 | Provider call uses `generateText` with `Output.object` instead of `generateObject`, which the installed AI SDK (v7) marks deprecated. Behavior and schemas are unchanged. | clarifications from AI route implementation |
| 1.4 | 2026-11-08 | AI call deadline 25 s → 40 s for the whole call; Gemini `thinkingLevel` set to `low` by default (env `AI_THINKING_LEVEL`) because Gemini 3 reasoning made memo generation exceed 25 s on the live site; memo/summary regeneration skipped after a slow first attempt; summary and memo prompts ask for plain-English labels. 503 responses carry a `reason`, 502 a short `code`, and `GET /api/status` reports configuration. | bug found on live site |
| 1.5 | 2026-11-08 | Same-provider model fallback (`AI_FALLBACK_MODEL`, default `gemini-3.6-flash` for Gemini): live testing showed `gemini-3.8-flash` returning 503 or hanging while `gemini-3.6-flash` answered in about 1 s. There is still no fallback between providers. 502 bodies carry the underlying provider code (e.g. `timeout_after_http_503`); `GET /api/status?probe=1` tests the provider. | bug found on live site |
| 1.6 | 2026-11-08 | Executive summary card now includes four engine-drawn charts (status breakdown, highest-risk units, back-test, cost vs budget) that do not depend on the AI. Summary prompt asks for plain-English labels, ₱ amounts, and a plain statement of whether the budget covers the cost to close. | user request |
| 1.7 | 2026-11-08 | Removed the `GET /api/status?probe=1` model probe: Google's free tier allows only 20 requests per day per model, and a public probe could use that up. `/api/status` now only reports configuration and makes no model call. AI errors distinguish the free-tier daily cap (`http_429_daily`) with a clear message. | found on live site |
| 1.8 | 2026-11-08 | No-AI fallback: when a memo or summary AI call fails, the UI shows a labeled template draft built from the engine's numbers (memo keeps the `{{EMPLOYEE_LIST}}` token, names merged locally). Replaces "AI buttons disabled when not configured" with "error + Retry + template", since the free Gemini tier allows only about 20 requests per day. | user request |
| 1.9 | 2026-11-08 | Groq added as a third provider (`AI_PROVIDER=groq`, `GROQ_API_KEY`, default `openai/gpt-oss-120b`, `reasoningEffort` low). `AI_FALLBACK_MODEL` becomes an ordered list of up to 3 backups that may be on another provider (`provider:model`), replacing the single same-provider backup and the "no fallback between providers" rule. A 404 (retired model) and invalid output now hand over to the next model; a 400/401/403 hands over when the next model is on a different provider. Recommend courses gets labeled template picks when the AI fails. Acceptance 16-17. | Gemini free tier is 5 requests/min and 20/day per model and `gemini-3.6-flash` may retire; Groq's free plan allows 30/min and 1,000/day |
