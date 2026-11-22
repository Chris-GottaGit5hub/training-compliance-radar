# PRD — Training Compliance Radar

**Owner:** Christopher Pamatmat · **Version:** 2.1 (Nov 22, 2026; matches spec v2.17) · **Course:** AIM Graded Assignment 4.2

## 1. Problem
Government agencies require every employee to complete at least one training a year, but L&D teams find the gaps only at year-end, when it is too late. Staff join, leave and transfer every month, records sit in several files, and budgets are planned without knowing who still needs training.

## 2. Users
- **L&D compliance officer (primary):** an accurate, churn-aware list of who is untrained, early enough to act, and what closing the gap costs.
- **Unit and department heads:** a short list of their untrained staff and a one-page summary.

## 3. Core features and acceptance criteria
| # | Feature | Accepted when |
|---|---|---|
| F1 | Upload and validate roster, attendance, catalog and optional calendar CSVs, or load a 12,000-employee synthetic sample | A missing column or over 20,000 rows gives a clear error and nothing is processed |
| F2 | Deterministic compliance engine (as-of date, late-hire cutoff, separations, regular staff in scope) | Each rule is covered by unit tests; the AI never decides status |
| F3 | Dashboard: trained vs untrained, milestone targets (25/50/85/100%), slicers by pay grade, department, group and sector, units ranked by risk | Totals equal the engine's counts exactly |
| F4 | Budget: The Money panel (spent, promised, left at year end), burn-down, outstanding balance, cost to close from the cheapest mix of calendar runs and LinkedIn | Every peso is computed in code from the uploaded files |
| F5 | Training calendar: year grid, list, course timeline and by-quarter views, plus a what-if edit mode (add, move, cancel runs) | Every number recalculates from the edited calendar |
| F6 | AI course recommendations from the catalog | Every course ID exists in the catalog; a labeled template is shown if the AI fails |
| F7 | AI early-warning memos (each person's one course and deadline in a table) and an executive summary | Counts and deadlines come from the engine; names are merged in the browser, never sent to the AI |
| F8 | Export the untrained list (with each person's course and complete-by date), calendar and memos | The CSV opens in Excel with the rows shown on screen |

## 4. Out of scope (v1)
Accounts, login and any database; live LinkedIn Learning or HRIS integration; sending emails; real employee data (synthetic only).

## 5. Success metrics
1. **Early warning:** on a past year, the Jun 30 and Sep 30 lists catch at least 80% of the people still untrained at year end, shown as the Early Warning Check (flagged, caught up on their own, still untrained, missed).
2. **Speed:** from upload to dashboard and memos in under 5 minutes, instead of days of manual cross-matching.
3. **Safety:** all rule tests pass; zero invented course links; zero names sent to an AI provider.

## 6. Open questions for the policy owner
Does e-learning count, and is there a minimum length? Which unit owns a transferee? Which data may an external AI provider receive under the agency's privacy policy?
