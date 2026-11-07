# spec.md — Training Compliance Radar (v1.0)

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

### 2.3 catalog.csv (required for recommendations)
| Column | Type | Rules |
|---|---|---|
| course_id | string | required, unique |
| title | string | required |
| skill_area | string | required |
| duration_minutes | integer > 0 | required |
| provider | `linkedin_learning` \| `in_house` | required |
| url | https URL or empty | optional |
| cost_per_head | number ≥ 0 (PHP) | required (0 for licensed e-learning) |

### 2.4 Settings (UI)
```ts
interface RulesConfig {
  year: number;                 // default: current year
  asOfDate: string;             // YYYY-MM-DD, default: today; must fall within `year`
  lateHireCutoff: string;       // default: `${year}-10-01`; hired on/after → Exempt
  coveredTypes: EmploymentType[]; // default: ['regular','contractual','casual']
  elearningCounts: boolean;     // default: true
  minHours: number;             // default: 1 — a training counts only if hours ≥ minHours
  budgetPhp: number;            // default: 0 (cost view hidden if 0)
}
```

## 3. Outputs

### 3.1 Employee status (engine)
```ts
type Status = 'COMPLIANT' | 'AT_RISK' | 'EXEMPT' | 'EXCLUDED' | 'NOT_COVERED';
interface EmployeeResult { employeeId: string; unit: string; status: Status; reason: string; qualifyingCount: number; }
```
### 3.2 Unit summary
```ts
interface UnitSummary { unit: string; covered: number; compliant: number; atRisk: number;
  atRiskLicensed: number; atRiskUnlicensed: number; complianceRate: number; // compliant/covered, 0 if covered=0
}
```
### 3.3 Org summary
`{ covered, compliant, atRisk, exempt, excluded, notCovered, complianceRate, monthsRemaining, unitsRanked: UnitSummary[] }`

### 3.4 AI outputs (zod schemas, server-side)
- `/api/recommend` → `{ recommendations: { unit: string; courseIds: string[]; rationale: string }[] }`
- `/api/memo` → `{ subject: string; body: string }` — body MUST contain the literal token `{{EMPLOYEE_LIST}}`
- `/api/summary` → `{ summary: string }` (≤ 250 words)

## 4. Behavior Rules (compliance engine — pure functions in `lib/engine/`)
Evaluate each roster row in this order (first match wins):
1. `hire_date > asOfDate` → **NOT_COVERED** ("Not yet hired as of date")
2. `separation_date` present and `≤ asOfDate` → **EXCLUDED** ("Separated")
3. `employment_type ∉ coveredTypes` → **NOT_COVERED** ("Employment type not covered")
4. `hire_date ≥ lateHireCutoff` → **EXEMPT** ("Late hire")
5. Count **qualifying trainings**: attendance rows for this employee where `training_date` is within `year`, `training_date ≤ asOfDate`, `hours ≥ minHours`, and (`delivery ≠ 'elearning'` OR `elearningCounts`). If count ≥ 1 → **COMPLIANT**, else → **AT_RISK**.

Other rules:
- Covered = COMPLIANT + AT_RISK. Compliance rate = compliant / covered (0 when covered = 0), rounded to 1 decimal %.
- `monthsRemaining` = whole months from asOfDate to Dec 31 of `year` (Dec 15 → 0; Sep 30 → 3).
- Units ranked by `atRisk` desc, then `complianceRate` asc, then name asc.
- Attendance rows whose employee_id is not in the roster are ignored and counted in a warning.
- Duplicate `employee_id` in roster → validation error listing the IDs; nothing processed.
- **Back-test:** `backtest(roster, attendance, config, checkpointDate)` returns `{ flaggedAtCheckpoint, nonCompliantAtYearEnd, caughtEarly, recall }` where recall = caughtEarly / nonCompliantAtYearEnd.

### 4.1 Cost-to-close
- Licensed AT_RISK employee → cheapest `linkedin_learning` course cost (normally ₱0).
- Unlicensed AT_RISK employee → cheapest `in_house` course `cost_per_head`.
- `costToClose` = sum; show `budgetPhp − costToClose` and a covered / short flag.

### 4.2 Validation & limits
- Max file size 5 MB each; max 20,000 rows per file; reject missing required columns with a message naming them.
- Row-level errors: show first 20 with row numbers; block processing if any required-field error exists.

## 5. API Contracts (Next.js Route Handlers)
All routes: POST, JSON, zod-validated, `maxDuration = 60`, in-memory rate limit **10 requests/min per IP**.
| Route | Request (aggregates only — no names/IDs) | Errors |
|---|---|---|
| `/api/recommend` | `{ units: { unit, atRiskLicensed, atRiskUnlicensed, topPositions: string[] (≤5) }[] (≤200), catalog: { courseId, title, skillArea, durationMinutes, provider }[] (≤300) }` | 400 invalid, 413 too large, 429 rate limit, 502 AI failure |
| `/api/memo` | `{ unit, atRiskCount, coveredCount, deadline, monthsRemaining, courses: { title, url?, durationMinutes }[] (≤5), tone: 'formal'\|'friendly' }` | same |
| `/api/summary` | org summary numbers + top 10 units (names of units allowed) | same |

Server post-processing:
- `/api/recommend`: drop any `courseId` not in the submitted catalog; if a unit ends with zero valid IDs, return `fallbackSearch: true` and the client shows a LinkedIn Learning search link built from the unit's top position.
- `/api/memo`: if `{{EMPLOYEE_LIST}}` is missing, append it to the end of the body.
- Log one line per AI call: route, provider, model, latency ms, status (no payload contents).

## 6. UI
Single page, 4 steps: **(1) Data** — upload 3 CSVs or "Load sample data"; **(2) Rules** — settings form; **(3) Dashboard** — KPI cards (covered, compliance %, at-risk, months left, cost to close), units bar chart, ranked unit table; **(4) Unit panel** — at-risk employee list, recommended courses (with links), Generate memo, Copy, Export. Header button: **Executive summary**. Footer: privacy note.
States: loading spinners on AI buttons; error banners with retry; empty states. Mobile-friendly layout.

## 7. Constraints
- Next.js (App Router) + TypeScript strict + Tailwind; Vercel AI SDK; Vitest; Node LTS.
- Env vars: `ANTHROPIC_API_KEY`, `AI_PROVIDER` (`anthropic`|`google`, default `anthropic`), `AI_MODEL` (default `claude-haiku-5-5`), `GOOGLE_GENERATIVE_AI_API_KEY` (optional).
- No database, no auth, no server-side storage of uploaded data.
- Synthetic sample data only (generated by `scripts/generate-sample-data.ts`, seeded, ~300 employees, ~12 units, includes mid-year hires, separations, late hires).

## 8. Acceptance Criteria (Given / When / Then)
1. Given sample data and asOf = Sep 30, when processed, then dashboard KPIs equal engine outputs and units are ranked per §4.
2. Given an employee hired Oct 15 (cutoff Oct 1), then status = EXEMPT.
3. Given an employee separated Mar 31 and asOf = Sep 30, then status = EXCLUDED.
4. Given an employee with one e-learning course of 0.5 h and minHours = 1, then status = AT_RISK.
5. Given elearningCounts = false and only e-learning attended, then status = AT_RISK.
6. Given roster with duplicate employee_id, then an error lists the duplicates and nothing is processed.
7. Given an AI response containing an unknown courseId, then it is removed and never displayed.
8. Given any AI request payload built by the client, then it contains no employee names or IDs (unit test on payload builders).
9. Given 11 requests in a minute from one IP, then the 11th returns 429.
10. Given the deployed URL in an incognito window, then "Load sample data" → dashboard → memo works end-to-end.

## 9. Test Plan (Vitest, ≥ 10 tests)
Engine: rules 1–5 each, monthsRemaining, ranking order, back-test recall, cost-to-close. Validation: missing columns, duplicates, bad dates. API helpers: catalog ID filtering, memo token enforcement, payload builders exclude PII, rate limiter.

## 10. Revision Log
| Version | Date | Change | Reason |
|---|---|---|---|
| 1.0 | 2026-11-07 | Initial spec | — |
