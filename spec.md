# spec.md — Training Compliance Radar (v2.5)

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
| employment_type | `regular` \| `contractual` (there is no casual type) | required |
| hire_date | `YYYY-MM-DD` | required, valid date |
| separation_date | `YYYY-MM-DD` or empty | optional; if present must be ≥ hire_date |
| licensed | `yes` \| `no` | required (has e-learning license) |
| personnel_number | exactly 5 digits, unique when present | optional; the Personnel Number, shown in the at-risk list and export (`employee_id` stays the key that attendance links to) |
| pay_grade | integer 1–30; `8`, `PG8` and `PG 8` are all accepted | optional |
| group | string | optional |
| sector | string | optional |

Derived **band** from `pay_grade`: PG 4–9 = Rank and File, PG 10–13 = Officers, PG 14–18 = Senior Officers; any other or missing grade = Unbanded. A missing `group` or `sector` is shown as "Unassigned". `unit` is the department.

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
| cost_per_head | number ≥ 0 (PHP) | required (0 for licensed e-learning); what one **licensed** person costs the budget |
| unlicensed_fee | number ≥ 0 (PHP) | optional, `linkedin_learning` only: what one **unlicensed** person costs the budget when they take the course (e.g. ₱800). Blank = unlicensed staff cannot use the course |
| recommended | `yes` \| `no` | optional, default `no`: a company-recommended annual course (e.g. AMLA), scheduled by sector window (§4.8) |

Without a catalog, the dashboard and memos still work; the Recommendations panel and cost-to-close KPI show an empty state ("Upload a catalog to enable").

### 2.4 Settings (UI)
```ts
interface RulesConfig {
  year: number;                 // default: current year (Asia/Manila)
  asOfDate: string;             // YYYY-MM-DD, default: today in Asia/Manila; must fall within `year`
  lateHireCutoff: string;       // default: `${year}-10-01`; hired on/after → Exempt; must fall within `year`
  coveredTypes: EmploymentType[]; // default: ['regular'] — only regular staff are at risk; contractual staff may attend trainings (their costs still count as spend) but are never at risk unless added here; at least one
  elearningCounts: boolean;     // default: true
  minHours: number;             // default: 1 — a training counts only if hours ≥ minHours
  budgetPhp: number;            // default: 0 — the ANNUAL training allocation; every cost in this spec is charged against it (hidden if 0)
  milestoneTargets: number[];   // default [25, 50, 85, 100] — % of in-scope staff trained by Mar 31, Jun 30, Sep 30, Nov 30; four values, each 0–100, not decreasing
  subscriptions: { name: string; amountPhp: number }[]; // default (editable estimates, annual, billed in January, charged to the budget): Mentimeter 12,000; Kahoot! 9,000; Canva 5 seats 32,500; Adobe Acrobat Pro 3 seats 40,500
  nominationReservePhp?: number; // expected spend on external trainings people nominate that are not in the calendar; blank = estimated from this year's external attendance (§4.7)
}
```
Derived (not user-editable): `deadline = ${year}-12-31` (official, online courses only after the in-person cutoff); `inPersonCutoff = ${year}-12-14` (no in-house or external runs after it); milestone dates `${year}-03-31`, `-06-30`, `-09-30`, `-11-30` (Nov 30 is the internal target).

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
- **Every route is charged to the training budget** (`budgetPhp`, the annual allocation): licensed LinkedIn use, an unlicensed person's LinkedIn fee, in-house runs and external courses alike.
- Licensed AT_RISK employee → cheapest qualifying `linkedin_learning` course `cost_per_head` (normally 0), **only if `elearningCounts` is true**; otherwise use the unlicensed route.
- Unlicensed AT_RISK employee → the cheaper of (a) the cheapest qualifying `in_house` `cost_per_head` and (b) the cheapest qualifying `linkedin_learning` `unlicensed_fee` (only courses that have one, and only if `elearningCounts` is true).
- If a route has no qualifying course, those employees are counted in `unpricedCount` and `costToClose` is shown as a lower bound with a warning.
- **With a calendar loaded (§4.9), the cost to close is the plan's total**: the cheapest combination that gives every at-risk employee at least one training this year, drawn from calendar runs (in-house, and external trainings people nominate, entered as external rows with `min_pax` 1), the paid LinkedIn fee, and licensed LinkedIn at ₱0. Without a calendar it is the per-head estimate above.
- Output: `{ costToClose, unpricedCount, remaining: projectedBalance, covered: remaining ≥ 0 && unpricedCount = 0 }`, where `projectedBalance` is §4.7's projected year-end balance: the annual allocation left after spend so far, every commitment, and (only when the cost is the catalog estimate) the cost to close. `unpricedCount` = people with no route (a lower bound).
- **Outstanding balance** = `budgetPhp − spent` (§4.7), shown beside cost to close with the share spent and the projected year-end balance (§4.7). The cost KPI shows whenever a catalog or calendar is loaded; the balance KPI shows its figure only when `budgetPhp > 0`.

### 4.3 Validation & limits
- Max file size 5 MB each; max 20,000 rows per file; reject missing required columns with a message naming them.
- Row-level errors: show first 20 with row numbers; block processing if any required-field error exists.

### 4.4 Export
- Exports: at-risk list CSV (per unit and all units) and memo text.
- CSV cells starting with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with `'` (formula-injection guard). Files are UTF-8 with BOM so Excel shows names correctly.

### 4.5 Trained vs untrained and milestones
"Trained" = COMPLIANT and "untrained" = AT_RISK among the covered; the dashboard leads with these two counts. The covered total appears only as the denominator ("of 200 in scope").
`evaluateMilestones(roster, attendance, config)` returns one row per milestone date with the target from `milestoneTargets`: `{ date, label, targetPct, state: 'met' | 'missed' | 'upcoming', inScope, trained, untrained, actualPct, targetTrained, gap, needed }` (`actualPct` = trained ÷ inScope, 1 decimal).
- `date ≤ asOfDate`: run the engine with `asOfDate = date`; `inScope = compliant + atRisk`, `trained = compliant`, `untrained = atRisk`.
- `date > asOfDate`: use the run at the real `asOfDate` and `state = 'upcoming'` (`needed` = people still to train to reach the target).
- `targetTrained = ceil(targetPct × inScope / 100)`; `gap = trained − targetTrained` (negative = short); `needed = max(0, −gap)`; past dates are `met` when `gap ≥ 0`, else `missed`.
- Counts only, no IDs.

### 4.6 Breakdown (slicers)
`breakdown(results, roster, dimension, filter)` with `dimension ∈ band | payGrade | unit | group | sector` and `filter` any combination of those fields (exact match; `band` is derived). Only COMPLIANT and AT_RISK employees count. Rows: `{ key, inScope, trained, untrained, rate }`, sorted by untrained desc, then rate asc, then key in natural order (so `PG 5` sorts before `PG 10`). This is on-screen only: AI payloads stay unit-level with the ≥ 3 small-cell rule and never carry band, grade or sector cells (the president is a cell of one).

### 4.7 Budget burn-down
Allocation = `budgetPhp`. `budgetSeries(roster, attendance, config)` returns, for each month Jan–Dec, `{ month, spent, remaining, trained, planned }`:
- `spent` (cumulative) = sum of `cost` over de-duplicated attendance rows of roster employees dated within `year` and ≤ `asOfDate`; every row counts whatever its hours, and whatever the employment type (contractual staff who attend burn budget even though they are never at risk). Months after the as-of month have `spent = null`; `planned` (cumulative projected spend from §4.9) is `null` without a calendar.
- `remaining = budgetPhp − spent`; `trained` = COMPLIANT count with the engine run as of that month end (months after the as-of month: `null`).
- The report also shows percent spent and cost per trained person (`spent ÷ trained`). Hidden when `budgetPhp = 0`.
- **Subscriptions** (config) are billed in January, so they count in `spent` from January 1.
- **Commitments** after the as-of date (`buildCommitments`, counts and pesos only):
  1. *Calendar runs*: every run with `asOfDate < date ≤ inPersonCutoff` is held and budgeted at `max(expected participants, participants the plan places in it)`, whether or not it is needed to close the gap (§4.9 costing).
  2. *Nominations*: `nominationReservePhp`; when blank, the estimate is `external attendance cost to date ÷ as-of month × months left` (a deliberately cautious run-rate; replace it with your own figure).
  3. *Paid LinkedIn fees*: the plan's LinkedIn cost (§4.9), only when a calendar is loaded.
  Each is placed in its own month (nominations spread over the remaining months; LinkedIn fees on Nov 30; anything dated at or before the as-of month goes to the next month), and the sum is `planned` on the burn-down line.
- **Projected year-end balance** = `budgetPhp − spent − commitments − (costToClose only when it is the catalog estimate, i.e. no calendar)`, also shown as a share of the allocation. In practice less than 8% to 10% of the whole annual allocation (₱100M in a real year) is left unspent, which is what a realistic balance looks like; the sample preset (₱2,450,000) is set so that under 8% is left.

### 4.8 Recommended-course windows (sector schedule)
A catalog course with `recommended = yes` (e.g. AMLA) runs **once a year** in one window per sector, spread across the year so LinkedIn is never loaded by everyone at once. Someone who misses their window cannot take it again that year; one completion is also one qualifying training (§4 rule 5), so it can close compliance.
`planSectorWindows(inScopeBySector, targets, year)`:
- Scheduling units are sectors (missing = "Unassigned"). A sector holding more than 30% of in-scope staff is split into its groups (unit label `Sector · Group`).
- Units sorted by size desc then name; one window per unit, a whole calendar month, spread over Feb–Oct: unit `i` of `n` gets month `2 + floor(i × 9 / n)`. If a milestone target would then not be reachable (cumulative in-scope headcount of windows ending on or before the milestone date < target), the units are instead packed into consecutive months from January. With more than nine units, months repeat in order.
- Output per window: `{ unit, start, end, size }` plus `peakShare` (largest month load ÷ in-scope staff).
`windowStatus(window, course, roster, attendance, asOfDate)`: `completed` = in-scope employees of the unit with an attendance row whose title equals the course title (trimmed, case-insensitive) dated in the window; `pending` = the rest while the window has not closed; `missed` = the rest after `end`. State: `upcoming | open | closed`. Counts only.

### 4.9 Calendar and plan (optional 4th CSV)
`calendar.csv` (optional) lists planned in-house and external runs:
| Column | Type | Rules |
|---|---|---|
| run_id | string | required, unique |
| course_id | string | required (informational) |
| date | `YYYY-MM-DD` | required, within `year` |
| delivery | `in_house` \| `external` | required |
| run_title | string | optional (e.g. `ITIL 4 Foundation`) |
| hours | number > 0 | optional, default 8 (length of an in-house run) |
| speakers | integer ≥ 0 | optional, default 1 (invited subject-matter experts for an in-house run) |
| cost_per_run | number ≥ 0 | optional: fixed cost of one run; blank for `in_house` = honoraria (costing below) |
| cost_per_head | number ≥ 0 | column required; cell required for `external` (the fee per participant, e.g. ITIL Foundation ₱18,000); blank for `in_house` = snacks (costing below) |
| min_pax | integer ≥ 1 | required |
| max_pax | integer ≥ min_pax | required |
| expected_pax | integer from `min_pax` to `max_pax` | optional, default `max_pax` (planned enrolment used for budgeting) |

**Costing** (the company's rules, used when the cost cells are blank): an in-house run costs `speakers × ₱500 × ceil(hours ÷ 2)` in honoraria (₱500 per speaker per 2 hours; speakers are usually employees) plus snacks per participant of `₱75 × min(2, ceil(hours ÷ 4))` (₱75 for a 4-hour run, ₱150 for a full 8-hour day, the cap). An external training (in the company's premises or at the provider's) costs its fee per participant. The calendar's mix of face-to-face runs is external to in-house **3 : 1**.
`buildPlan(results, roster, catalog, calendar, config)` (deterministic, counts only):
1. Candidates = AT_RISK employees at `asOfDate`. **Licensed** candidates are closed through LinkedIn at ₱0 by the Nov 30 target.
2. **Unlicensed** candidates: runs with `asOfDate < date`, taken **cheapest first** by their per-head cost when full (`cost_per_run ÷ max_pax + cost_per_head`, then date, then `run_id`). A run takes up to `max_pax` unplaced unlicensed candidates; it is **cancelled** (cost 0) when it is after `inPersonCutoff`, when fewer than `min_pax` people are left, or when the people it would take cost no more on the cheapest paid LinkedIn fee (`run cost ≥ fee × people`, only when such a fee exists); their people stay unplaced. Nominated external trainings are external rows with `min_pax` 1. A run's cost = `cost_per_run + cost_per_head × participants`.
3. Unplaced unlicensed candidates take the cheapest qualifying LinkedIn `unlicensed_fee` (charged on Nov 30) when `elearningCounts` and one exists; otherwise they are **unplaced** ("cannot close by the deadline without a license or another run").
4. Output: `{ runs: { runId, date, participants, cost, state: 'held' | 'cancelled' }[], licensedLinkedIn, paidLinkedIn, unplaced, totalPlannedCost, plannedByMonth, projectedTrainedByMilestone }`. Planned spend feeds `planned` in §4.7; `remaining after plan = budgetPhp − spent − totalPlannedCost`.
Everything in §4.5–§4.10 is computed in `/lib` from the uploaded files; the AI never computes these numbers.

### 4.10 Calendar view (read-only)
`buildCalendarView(calendar, analysis, config)` (pure, in `lib/analysis/calendar-view.ts`; counts, dates and pesos only, no employee data) prepares the **Training calendar** tab. It only reads: nothing in the tab changes the calendar, the rules or any number elsewhere.
- **Effective calendar (the seam for a later editable version).** The view reads `applyCalendarEdits(calendar, edits)`, where `edits` is a list of `{ type: 'remove', runId }` or `{ type: 'upsert', row }`. In this version the UI never produces edits, so the effective calendar is the uploaded one. Rows outside `config.year` are left out of the grid and counted in an alert.
- **Run state:** `completed` when `date ≤ asOfDate`; otherwise `blocked` when `date > inPersonCutoff` (Dec 14: not budgeted, §4.7); otherwise `planned` when the plan holds the run, or `standby` when the plan cancelled it (below `min_pax`, or costlier than the paid LinkedIn fee), with the plan's reason. Standby runs are still budgeted at their expected enrolment (§4.7).
- **Per run:** title, date, delivery, hours, speakers, `min_pax`/`max_pax`/expected, the resolved cost split (fixed per run, per head), planned cost at expected enrolment, cost per head when full, people the plan places, state and reason.
- **Summary:** runs by state; in-house and external counts and their ratio against the 3 : 1 target; seats expected against capacity; calendar cost at expected enrolment and its share of the allocation; the part still to budget (§4.7); people the plan places and people it cannot place.
- **By month:** for each month, runs and planned cost split in-house and external; milestone dates (§4.5), the as-of date, Dec 14 and Dec 31 are marked; the sector windows (§4.8) are shown as a lane when a recommended course exists.
- **Alerts (never block anything):** runs after Dec 14; standby runs; months from the month after the as-of date through November with no run; the mix away from 3 : 1 by more than 0.5; people the plan cannot place; runs outside the year.
- **Tab states:** with no calendar loaded the tab explains that the calendar is optional and offers "Load sample data". Print and "Export calendar CSV" (the effective calendar plus planned cost, state and reason, with the §4.4 formula guard) are available.

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
Single page with two tabs: **Radar** (below) and **Training calendar** (§4.10: a read-only year view with summary tiles, a month grid, run list with a detail panel, cost by month, sector windows and alerts; filters by delivery and state). The Radar tab has 4 steps: **(1) Data** — upload 3 CSVs (catalog optional) or "Load sample data"; **(2) Rules** — settings form; **(3) Dashboard** — KPI cards (trained, untrained, next target, months left, cost to close, outstanding balance; the covered total only as "of N in scope"), milestone table and chart (target vs actual), breakdown slicers (band, department, group, sector, pay grade; shown when the roster has those columns), budget burn-down report with charts (shown when `budgetPhp > 0`) and a "where the budget goes" breakdown (spent on trainings, subscriptions, calendar runs still to run, expected nominations, paid LinkedIn fees, projected year-end balance, upcoming runs with their cost), sector-window schedule and plan (shown when a recommended course or a calendar is loaded), units bar chart and ranked unit table (columns In scope, Trained, Untrained, Licensed, Unlicensed, Compliance) listing **only units with untrained staff** (fully trained units are left out and counted in a footnote), a footnote under the KPI cards that says who is left out of scope and why (separated, not yet hired, contractual or other types not covered, late hires exempt, each with its count), a Print report button; **(4) Unit panel** — at-risk employee list, recommended courses (with links), Generate memo, Copy, Export. Header button: **Executive summary**, which opens a card with the AI-written summary plus four charts drawn by the app from the engine's numbers (status breakdown, highest-risk units, back-test recall and precision at Jun 30 and Sep 30, and cost to close vs budget). The charts never depend on AI output and still show if the AI call fails. Footer: privacy note.
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
- Synthetic sample data only (generated by `scripts/generate-sample-data.ts`, seeded): **12,000 employees** in 50 departments, 14 groups and 7 sectors, with attendance across the full year (so the back-test is meaningful), a 26-course catalog and a 48-run calendar. Employee ID is one letter and three digits assigned in order (A100–A999, then B100–B999, … N399); Personnel Number is a unique 5-digit number. Pay grades follow the company ladder: department heads start at PG 12, group heads at PG 14, sector heads at PG 16, and the one President is the only person at PG 18. It includes mid-year hires, separations and late hires. Fields are listed in `docs/data-dictionary.md`.

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
18. Given 200 in scope of whom 165 are compliant, then the KPIs show Trained 165 and Untrained 35, with 200 only as "of 200 in scope".
19. Given as of Sep 30 with an 85% target, 200 in scope and 165 trained, then the Sep 30 milestone is `missed` with `gap = −5` and `needed = 5`; a future Nov 30 milestone is `upcoming`.
20. Given a roster with `pay_grade` `PG 8`, `PG10` and `14`, then their bands are Rank and File, Officers and Senior Officers; filtering by band and sector returns only matching employees.
21. Given an unlicensed at-risk employee, an in-house course at ₱1,200 and a LinkedIn course with `unlicensed_fee` 800, then their cost is ₱800; a licensed at-risk employee costs ₱0; both are charged against `budgetPhp`.
22. Given attendance costs dated in the year up to the as-of date, then `spent` is their sum, `remaining = budgetPhp − spent`, and months after the as-of month have no actual spend.
23. Given seven sectors of which one holds more than 30% of staff, then that sector is split by group, every window is a whole month inside Feb–Oct, and each milestone target is reached by the windows ending before it.
24. Given a run with fewer available people than `min_pax`, or one costlier per head than the paid LinkedIn fee, then it is cancelled at cost 0; no in-house or external run after Dec 14 is used; people left over are paid-LinkedIn or unplaced.
25. Given units where every in-scope employee is trained, then the ranked table and bar chart omit them and a footnote counts them.
26. Given default rules, a contractual employee with no training is NOT_COVERED (never at risk) while their attendance cost still counts toward spend; the left-out footnote lists separated, not-yet-hired and contractual staff with their counts.
27. Given `employment_type` = `casual`, then validation fails naming the allowed values `regular, contractual`.
29. Given an in-house run of 8 hours with 2 speakers and 30 expected participants and blank cost cells, then it costs ₱8,500 (honoraria 2 × ₱500 × 4 plus snacks 30 × ₱150); a 4-hour run with 1 speaker costs ₱1,000 plus ₱75 per participant; an external run costs its fee per participant.
30. Given future calendar runs, subscriptions and a nomination reserve, then the projected year-end balance = `budgetPhp − spent − calendar runs at max(expected, planned participants) − nominations − paid LinkedIn fees`, and `cost.remaining` equals it.
31. Given no nomination reserve, then it is estimated from the year's external attendance run-rate and labeled an estimate.
32. Given the sample calendar, then external runs outnumber in-house runs 3 to 1.
33. Given the sample roster, then it has 12,000 rows; every Employee ID is a letter and three digits in order from A100; every Personnel Number is a distinct 5-digit number; there is exactly one person at PG 18 (the President), seven at PG 16 (sector heads) and fourteen at PG 14 (group heads), and every department head is at PG 12 or above.
34. Given a roster with a repeated or non-5-digit `personnel_number`, then validation fails naming the field and the repeated numbers.
35. Given "Load sample data", then the four files load and the dashboard renders in about a second in the browser with 12,000 rows.
36. Given a calendar, then the Training calendar tab lists every run in the year with its state: `completed` on or before the as-of date, `blocked` after Dec 14, `planned` when the plan holds it, `standby` (with the plan's reason) when the plan cancelled it.
37. Given 36 external and 12 in-house runs, then the tab shows the mix as 3.0 : 1 with no mix alert; given 10 external and 10 in-house runs, then it shows 1.0 : 1 and a mix alert.
38. Given the calendar, then a run's planned cost equals the §4.9 costing at its expected enrolment, and "still to budget" equals the §4.7 calendar commitments.
39. Given no calendar loaded, then the tab shows an explanation and a Load sample data button, and the Radar tab is unchanged.
40. Given an empty edit list, then the effective calendar equals the uploaded calendar; a `remove` edit drops that run and an `upsert` edit replaces or adds it (unit test; no UI yet).
28. Given a calendar, then cost to close equals the plan's total (cheapest runs first, nominated external, paid LinkedIn; licensed ₱0), `remaining = budgetPhp − spent − costToClose`, and the outstanding balance card shows `budgetPhp − spent`.

## 9. Test Plan (Vitest, ≥ 10 tests)
Engine: rules 1–5 each, monthsRemaining (Jan/Sep/Dec), rounding, ranking order, back-test (recall, precision, null denominators, hires after checkpoint), cost-to-close (both routes, elearningCounts = false, minHours filter, unpriced). Validation: missing columns, duplicates, bad and impossible dates, normalization (BOM, case, whitespace). API helpers: catalog ID filtering, memo token substitution and `{{EMPLOYEE_LIST}}` enforcement, numeric grounding check, payload builders exclude PII and suppress small cells, rate limiter, provider/model resolution from env (backup list, cross-provider keys), model-chain hand-over rules (404, cross-provider 400, cooldown), template recommendations, CSV export escaping. v2.0: pay-grade parsing and bands, optional roster/catalog columns, milestones (met, missed, upcoming, rounding), breakdown filters, three-route cost model, budget series, sector-window planner, window status, calendar plan (cancel below minimum, Dec 14 cutoff, unplaced). v2.5: calendar view (run states, mix ratio, monthly cost, alerts, effective-calendar edits, export).

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
| 2.5 | 2026-11-08 | New read-only **Training calendar** tab (§4.10, §6): summary tiles, month grid with milestone, as-of and Dec 14 markers, run list with detail, monthly cost, sector-window lane, alerts, CSV export and print. The view reads an effective calendar (`applyCalendarEdits`, no UI producing edits yet) so a later what-if or editable version needs no rework. Acceptance criteria 36–40. | user request: the calendar must be viewable in its own tab |
| 2.4 | 2026-11-08 | The 300-row sample is replaced by a 12,000-employee synthetic set (50 departments, 7 sectors) with attendance, catalog and a 48-run calendar. Employee ID is a letter plus three digits in order (A100–N399) and a new optional `personnel_number` column holds a unique 5-digit Personnel Number, validated and shown in the at-risk list and export. Leadership pay grades follow the company ladder (department head from PG 12, group head PG 14, sector head PG 16, one President at PG 18). The sample's annual budget is ₱100M and its projected year-end balance 7.0%. Acceptance 33–35. | user request |
| 2.3 | 2026-11-08 | Realistic budget. Calendar runs carry real costs: in-house = speaker honoraria (₱500 per 2 hours each) plus snacks (₱75 per 4-hour run, ₱150 for 8 hours) per participant; external = fee per participant (e.g. ITIL ₱18,000); calendar mix external : in-house 3 : 1; optional `run_title`, `hours`, `speakers`, `expected_pax`. Annual subscriptions (Mentimeter, Kahoot!, Canva 5 seats, Adobe Acrobat 3 seats) are budget items billed in January. Budget outlook: spend to date plus commitments (all future calendar runs, expected external nominations outside the calendar, paid LinkedIn fees) gives a projected year-end balance, which `cost.remaining` now equals. Acceptance 29–32. | user request: remaining balance must be as realistic as possible |
| 2.2 | 2026-11-08 | Cost to close becomes the cheapest combination of available trainings (calendar runs including nominated external, paid LinkedIn, licensed LinkedIn at ₱0) that gives every at-risk employee at least one training, replacing the cheapest-per-head catalog estimate when a calendar is loaded. The plan picks runs cheapest first and drops a run when its people are cheaper on the LinkedIn fee. `remaining` now means the annual allocation left after spend and after closing the gap. New Outstanding balance card (`budgetPhp − spent`) beside cost to close. Acceptance 28. | user request |
| 2.1 | 2026-11-08 | Only regular staff are at risk: `coveredTypes` defaults to `['regular']`; the casual employment type is removed (`regular` and `contractual` only); contractual staff can attend and their costs count as spend. The ranked unit table and chart list only units with untrained staff, with a footnote counting fully trained units. A footnote explains who is left out of scope and why (separated, not yet hired, contractual). Acceptance 25–27. | user clarification of who is covered, after reading the 87 not covered and 13 excluded |
| 2.0 | 2026-11-08 | Progress and budget reporting. Dashboard leads with trained vs untrained and four milestone targets (25/50/85/100% by Mar 31, Jun 30, Sep 30, Nov 30), replacing the confusing "Covered employees" headline. Optional roster columns `pay_grade`, `group`, `sector` with derived bands and slicers. `budgetPhp` becomes the annual allocation with a month-by-month burn-down; every cost route (licensed LinkedIn ₱0, unlicensed LinkedIn `unlicensed_fee`, in-house, external) is charged to it. Catalog gets `unlicensed_fee` and `recommended`. Recommended annual courses (e.g. AMLA) run once a year in staggered sector windows. Optional `calendar.csv` plan with minimum and maximum participants and the Dec 14 in-person cutoff. Acceptance 18–24. | user request after the deadline moved to 2026-11-23 |
| 1.9 | 2026-11-08 | Groq added as a third provider (`AI_PROVIDER=groq`, `GROQ_API_KEY`, default `openai/gpt-oss-120b`, `reasoningEffort` low). `AI_FALLBACK_MODEL` becomes an ordered list of up to 3 backups that may be on another provider (`provider:model`), replacing the single same-provider backup and the "no fallback between providers" rule. A 404 (retired model) and invalid output now hand over to the next model; a 400/401/403 hands over when the next model is on a different provider. Recommend courses gets labeled template picks when the AI fails. Acceptance 16-17. | Gemini free tier is 5 requests/min and 20/day per model and `gemini-3.6-flash` may retire; Groq's free plan allows 30/min and 1,000/day |
