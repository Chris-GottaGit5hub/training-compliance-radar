# PRD — Training Compliance Radar (v1)

**Owner:** Christopher Pamatmat · **Status:** Draft v1 · **Date:** Nov 7, 2026 · **Course:** AIM Graded Assignment 4.2

## 1. Problem Statement
Government agencies expect every employee to complete at least one L&D intervention per year, but L&D teams discover non-compliance only at year-end, when it can no longer be fixed. Because employees join, leave, and transfer every month, the covered population keeps changing, and records sit in multiple sources. The result: hundreds of untrained employees and reactive "explain why" memos each year.

## 2. Target Users
- **Primary — L&D Compliance Officer:** needs an accurate, churn-aware view of who is untrained, early enough to act.
- **Secondary — Unit Heads:** need a short list of their untrained staff and an easy way to close the gap.
- **Secondary — Department Head:** needs a one-page status summary.

## 3. Core Features (MVP) — each with an acceptance criterion
| # | Feature | Acceptance criterion |
|---|---|---|
| F1 | **Upload & validate data** — roster CSV, attendance CSV, course catalog CSV (or load built-in sample data) | Given a file with a missing required column or > 20,000 rows, when uploaded, then a clear error names the problem and nothing is processed |
| F2 | **Churn-aware compliance engine** (deterministic code) with configurable as-of date, late-hire cutoff, and exclusion of separated employees | Given an employee hired after the cutoff, then they are marked *Exempt*; given one separated before the as-of date, then they are *Excluded*; covered employees with ≥ 1 qualifying training are *Compliant* — verified by unit tests |
| F3 | **Risk dashboard** — overall and per-unit compliance rate, at-risk count, months remaining, units ranked by risk | Given sample data, when processed, then totals on the dashboard equal the engine's counts exactly |
| F4 | **AI course recommendations** from the curated catalog, per unit (licensed vs. unlicensed staff) | Every recommended course ID exists in the catalog (validated in code); if not, it is replaced by a catalog search link |
| F5 | **AI early-warning memos** per unit head, plus an executive summary | Given a unit with untrained staff, when "Generate memo" is clicked, then a memo appears within 30 s containing the unit's correct untrained count and deadline; employee names are merged locally, never sent to the AI |
| F6 | **Cost-to-close view** — licensed e-learning (₱0 marginal) vs. in-house route cost vs. remaining budget | Given a budget input, then the app shows cost to reach 100% compliance and whether the budget covers it |
| F7 | **Export** — untrained list and memos as CSV/text | Downloaded CSV opens in Excel with the same rows shown on screen |

## 4. Out of Scope (v1)
- User accounts / login, and any database or server-side storage of employee data
- Live LinkedIn Learning or HRIS/LMS integration (curated catalog file only)
- Sending emails automatically (memos are drafted, then copied/exported)
- Explanation-reply analysis, session slot matching, multi-year trends
- Real employee data (synthetic data only in the public repo)

## 5. Success Metrics
1. **Prediction:** on the synthetic back-test, report recall (share of year-end non-compliant employees flagged at the checkpoint) and precision (share of flagged employees still non-compliant at year end) at both Jun 30 and Sep 30. Target: recall ≥ 80% at both checkpoints. Precision is informational: 1 − precision is the group trained after being flagged, which early nudges target.
2. **Speed:** from upload to a full dashboard plus all unit memos in **under 5 minutes** (vs. days of manual cross-matching).
3. **Accuracy & safety:** 100% of unit tests pass for the compliance rules; 0 hallucinated course links (all picks validated against the catalog).

## 6. Open Questions
1. Does e-learning count toward the annual requirement, and is there a minimum duration? (Configurable in v1; policy owner to confirm.)
2. Which employee categories are covered (regular only vs. contractual/casual)?
3. What is the late-hire cutoff (e.g., hired after Oct 1 = exempt)?
4. For transferees, which unit is accountable — current or previous?
5. In real deployment, which data may be sent to an external AI provider under the organization's data privacy policy?
