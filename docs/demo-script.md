# Demo Script — 2 minutes

Live site: https://training-compliance-radar.vercel.app (open it in an **incognito window**).

## Before you record (5 minutes)

- [ ] `https://training-compliance-radar.vercel.app/api/status` shows `"provider":"groq"` with the two Gemini backups (it makes no AI call). If it says `configured: false`, a key is missing in Vercel.
- [ ] **Go easy on dry runs.** The AI runs on Groq's free plan first (about 1,000 requests a day, but only 8,000 tokens a minute), with Gemini (20 requests a day per model) as backup. Each AI click uses 1–2 requests. A couple of dry runs are fine; leave about a minute between AI clicks so the per-minute limit does not push you onto the backup.
- [ ] Browser zoom 110–125%, window wide enough to show two panels side by side, notifications off.
- [ ] Have `docs/validation.md` or a one-line problem statement ready if you want a title card.

## Script

| Time | On screen | Say (suggested wording) |
|---|---|---|
| **0:00–0:15** | Landing page: navy header, privacy strip | "Every year, L&D teams find out who missed the one-training-per-year rule in Q4, when it is too late. Training Compliance Radar finds them months earlier. Note the strip under the header: your files never leave this browser." |
| **0:15–0:28** | Click **Load sample data**; step 1 shows four files loaded | "I'll use synthetic data: 12,000 employees in 50 departments, a 26-course catalog and a 48-run training calendar. You can also upload your own CSVs, and errors are row-numbered." |
| **0:28–0:42** | Data and Rules fold into one bar; point at it (optionally **Show Data and Rules**, then **Hide**), then the KPI cards and **Training Targets** | "Once the data is in, Data and Rules fold into one line so the dashboard stays in view; one click shows them again. Rules are configurable: as-of date, late-hire cutoff, minimum hours. Only regular staff can be at risk. As of Sep 30, 8,846 are in scope: 7,155 trained, 80.9%, and **1,691 untrained**, with 3 months left. Training Targets shows we are 365 people short of the 85% target." |
| **0:42–0:55** | **The Money** panel; hover the balance card | "The Money says it in one line: ₱72.52M of the ₱100M allocation is spent, ₱20.43M is already promised, so about ₱7.04M, 7%, is left at year end. Closing the gap costs ₱332,000, the cheapest mix of runs and LinkedIn." |
| **0:55–1:05** | Bar chart, then **Units Ranked by Risk** | "Only units with untrained staff are listed, ranked by risk. Southern Luzon Branches leads with 88." |
| **1:05–1:17** | **Training Calendar** tab; year grid; *optional:* **Edit calendar** → remove one planned run → point at the totals → **Reset all changes** | "The calendar shows all 48 runs: 36 external to 12 in-house, exactly 3 to 1. Only 3 of the 17 upcoming runs are needed. I can cancel a run as a what-if and every number recalculates; nothing is saved." |
| **1:17–1:25** | Back to **Radar**; **Early Warning Check** card | "Does the early warning work? On September 30 the app flagged 1,691 people. 800 caught up on their own; the other 891 were still untrained on December 31, and it missed nobody. So September is when to act." |
| **1:25–1:35** | Click **Southern Luzon Branches**; point at **Recommended Course** and **Complete By**; **Export at-risk CSV** | "Click a unit for its at-risk list. Each person gets one course and a date: licensed staff take a LinkedIn course by November 30, the rest go into the calendar run the plan picked. Export it to CSV." |
| **1:35–1:52** | **Recommend courses**, then **Generate memo** | "AI recommends courses only from my catalog, and every ID is checked. The memo is drafted from counts alone; the names are merged in my browser, so the AI never sees them." |
| **1:52–2:00** | **Executive Summary** (header), then the GitHub repo | "One click gives a department head a summary. The code computes; the AI communicates. Source, tests and CI are on GitHub." |

Cut the optional calendar edit first if you run long.

## If something goes wrong

- **"Template" memo, summary or course picks instead of AI ones:** the AI failed or the free quota is used up. The template is built from the same numbers and is labeled. Say so, then click Retry later or show your recording.
- **"AI is not configured"** banner: a Vercel key is missing. Skip the AI steps, say "AI features need an API key; here is the output," and show a pre-recorded memo.
- **429 "Too many AI requests":** wait a minute. Limit is 10 per minute per IP.
- **A slow AI call:** keep talking over the spinner; calls time out at 40 seconds and offer Retry.
- **Warning "figures could not be checked":** that is the numeric guardrail working. Say so, click Retry.

## Talking points if asked

- Why not let the AI decide compliance? "It can miscount. Code is tested; the AI only writes."
- What about privacy? "Parsing is local; the API gets unit-level counts; positions are sent only when 3 or more at-risk staff share one."
- Why Groq, with Gemini as backup? [CHRIS: your answer.] Groq's free plan allows far more requests than Gemini's, and a chain of backups means a busy or retired model does not break the AI buttons. The provider is one env var.
