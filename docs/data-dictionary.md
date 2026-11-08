# Data dictionary: 12,000-employee sample

Everything here is **synthetic**: invented names, `@agency.example` emails (a reserved domain), a fictional organization. Regenerate with `npm run sample-data` (seeded, so the files are identical each time). "Load sample data" in the app loads these four files from `public/sample/`:

| File | Rows | Purpose |
|---|---|---|
| `roster.csv` | 12,000 | Employees (about 2.7 MB) |
| `attendance.csv` | about 16,000 | Trainings attended, with costs (about 1 MB) |
| `catalog.csv` | 26 | Courses: 16 LinkedIn Learning, 10 in-house |
| `calendar.csv` | 48 | Planned runs for the year: 36 external, 12 in-house (3 : 1) |

The app accepts up to 20,000 rows and 5 MB per file.

## roster.csv

| Column | Example | Notes |
|---|---|---|
| `employee_id` | `A100` | **One letter and three digits**, assigned in order: A100 to A999, then B100 to B999, and so on, to N399 for 12,000 people (capacity 23,400). The attendance file links to this. |
| `personnel_number` | `91064` | **Unique 5-digit number**, random and never reused. Shown in the at-risk list and the export. |
| `name` | `Cesar S. Bernardo` | Fictional. Merged into memos in the browser only; never sent to the AI. |
| `sex` | `M` | Extra, ignored by the app. |
| `position` | `Department Manager` | |
| `pay_grade` | `PG 16` | `8`, `PG8` and `PG 8` are all accepted. Drives the band. |
| `unit` | `NCR North Branches` | The department (50 of them). |
| `group` | `Luzon Branches Group` | 14 groups. |
| `sector` | `BBS` | 7 sectors: BBS, CSS, DBS, EXEC, NDLS, OS, TIBS. |
| `region` | `NCR` | Extra, ignored by the app. |
| `employment_type` | `regular` | `regular` or `contractual` (no casual). Only regular staff can be at risk. |
| `employment_status` | `active` | Extra: `separated` exactly when `separation_date` is set. |
| `hire_date` | `2005-07-01` | A few staff are hired mid-year or in October (exempt late hires). |
| `separation_date` | | Blank unless separated. |
| `licensed` | `yes` | LinkedIn Learning license. About 70% are licensed. |
| `employee_email` | `cesar.bernardo.91064@agency.example` | Extra, ignored by the app. |
| `department_email` | `ncr-north-branches@agency.example` | Extra, ignored by the app. |
| `department_head` | `Cesar S. Bernardo` | The department's Department Manager. Extra, ignored by the app. |

### Pay grades and leadership

| Band (derived) | Grades | Who |
|---|---|---|
| Rank and File | PG 4 to 9 | Customer Associates (PG 4) up to assistants and officers-in-training |
| Officers | PG 10 to 13 | Analysts, specialists, supervisors; Assistant Department Managers PG 12; Department Managers PG 13 |
| Senior Officers | PG 14 to 18 | 14 Group Heads (PG 14), 7 Sector Heads (PG 16), and **one President (PG 18)** |

A department head starts at PG 12, a group head at PG 14, a sector head at PG 16, and the President is the only person at PG 18. There is nobody at PG 15 or PG 17.

## attendance.csv

`employee_id, training_title, training_date, hours, delivery, cost`. Most regular staff attended a training by Sep 30; a department-dependent share did not (the at-risk group), and some of them close the gap in Q4, so the back-test is meaningful. Cost is ₱0 for e-learning, ₱1,500 to ₱6,500 for a classroom session and ₱5,600 to ₱33,600 for an external one. No orphan or duplicate rows.

## catalog.csv

Same columns as the app's catalog (see [`spec.md` §2.3](../spec.md)). LinkedIn courses are free to licensed staff and carry an `unlicensed_fee` (₱500 plus ₱50 per 10 minutes) for unlicensed staff; the Anti-Money Laundering course is flagged `recommended`.

## calendar.csv

`run_id, course_id, run_title, date, delivery, hours, speakers, cost_per_run, cost_per_head, min_pax, max_pax, expected_pax`.

- **In-house** runs (min 10, max 40 people) leave the cost cells blank, so the app derives them from the company's rules: ₱500 per speaker for every 2 hours, plus snacks per participant (₱75 for a 4-hour run, ₱150 for a full day).
- **External** trainings carry their fee per participant in `cost_per_head` (for example ITIL 4 Foundation at ₱18,000), min 1 person.
- `expected_pax` is the planned enrolment used for budgeting. 14 external and 3 in-house runs fall after Sep 30.

## What the sample shows (as of Sep 30)

8,846 employees in scope, 7,155 trained (80.9%) and 1,691 untrained (1,186 licensed, 505 unlicensed). Left out of scope: 624 separated, 402 not yet hired and 2,128 contractual. Against a ₱100,000,000 annual budget, ₱72.5M is spent so far and about ₱7.0M (7.0%) is projected to remain at year end, after the promised calendar runs, expected external nominations and subscriptions.
