# Demo Script — 2 minutes

Live site: https://training-compliance-radar.vercel.app (open it in an **incognito window**).

## Before you record (5 minutes)

- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` is set in Vercel and the project was redeployed (otherwise AI buttons show "not configured").
- [ ] Do one dry run: Load sample data → open a unit → Generate memo. The first AI call can take a few seconds.
- [ ] Browser zoom 100%, window wide enough to show the chart, notifications off.
- [ ] Have `docs/validation.md` or a one-line problem statement ready if you want a title card.

## Script

| Time | On screen | Say (suggested wording) |
|---|---|---|
| **0:00–0:15** | Landing page, header privacy note | "Every year, L&D teams find out who missed the one-training-per-year rule in Q4, when it is too late. Training Compliance Radar finds them months earlier. Note the banner: your files never leave this browser." |
| **0:15–0:30** | Click **Load sample data**; step 1 shows three files loaded | "I'll use synthetic data: 300 employees, 12 units, a 26-course catalog. You can also upload your own CSVs, and errors are row-numbered." |
| **0:30–0:45** | Step 2 Rules (as-of Sep 30), then KPI cards | "Rules are configurable: as-of date, late-hire cutoff, covered types, minimum hours. As of Sep 30, 271 employees are covered, 81.9% compliant, **49 at risk**, 3 months left." |
| **0:45–1:00** | Bar chart, then ranked table | "Units are ranked by risk. Branch Operations leads with 12. Cost to close is ₱5,600, because licensed e-learning costs nothing." |
| **1:00–1:15** | Back-test card | "Does early flagging work? At Sep 30 we flag 49 people and catch all 28 who end the year untrained. Precision is 57%: the rest got trained, which is exactly the group a nudge can change." |
| **1:15–1:30** | Click **Branch Operations**; at-risk list; **Export at-risk CSV** | "Click a unit for its at-risk list, and export it to CSV." |
| **1:30–1:50** | **Recommend courses**, then **Generate memo** | "AI recommends courses only from my catalog, every ID is checked. The memo is drafted from counts alone; the names are merged in my browser, so the AI never sees them." |
| **1:50–2:00** | **Executive summary**, then footer | "One click gives a department head a summary. The code computes; the AI communicates. Source and tests are on GitHub." |

## If something goes wrong

- **"AI is not configured"** banner: the Vercel key is missing. Skip the AI steps, say "AI features need an API key; here is the output," and show a pre-recorded memo.
- **429 "Too many AI requests":** wait a minute. Limit is 10 per minute per IP.
- **A slow AI call:** keep talking over the spinner; calls time out at 25 seconds and offer Retry.
- **Warning "figures could not be checked":** that is the numeric guardrail working. Say so, click Retry.

## Talking points if asked

- Why not let the AI decide compliance? "It can miscount. Code is tested; the AI only writes."
- What about privacy? "Parsing is local; the API gets unit-level counts; positions are sent only when 3 or more at-risk staff share one."
- Why Gemini? [CHRIS: your answer.] It is one env var to switch to Claude.
