# Reflection

## What I built and how

Training Compliance Radar turns roster, attendance, catalog and calendar CSVs into an early warning for the at least, one-training-per-employee-per-year rule. One principle held throughout: **code computes, AI communicates.** A tested engine decides who is compliant; the AI only drafts memos, picks catalog courses and summarizes. I worked spec-first and revised `spec.md` as I learned. [CHRIS: one sentence on how the Week 4A/4B material shaped this.]

## What AI did well

- **Speed on well-specified work.** With the spec and `AGENTS.md` in place, it produced the schemas, engine, CSV validator, sample data and a large test suite quickly. [CHRIS: what did this save you in hours or days?]
- **Checking against reality.** It tested in a real browser and found that `generateObject` was deprecated in the installed AI SDK, so we moved to `generateText` with `Output.object`.

## What AI did poorly, or needed checking

- **Green tests prove little at first.** I had it break the engine on purpose to confirm the tests fail. They did.
- **Confident gaps.** Its first spec left real holes (an undefined back-test, loose dates), found only when I asked for a review. Later an AI memo called the 358 covered staff "fulfilled" and printed "{{months remaining}}"; both needed prompt and server fixes. [CHRIS: any other place the AI was confidently wrong?]

## Where human judgment was needed

1. **Gemini, then Groq.** I started on Gemini's free tier, then hit its limits (5 requests a minute, 20 a day per model) and a possible model retirement before grading. Groq became the primary provider (1,000 requests a day), with Gemini 3.6 and 3.8 as backups and labeled templates if every model fails. [CHRIS: your real reasons: budget, quota, quality?]
2. **Making the back-test honest.** Recall is close to 100% almost by definition, so it proves little. I reframed it as the Early Warning Check: of 1,691 people flagged on Sep 30, 800 caught up on their own and 891 did not, so September is when to act. [CHRIS: how this changes the story you tell about the product.]
3. **Spec revisions.** The spec grew from v1.0 to v2.17, each change written down before the code. [CHRIS: which revision mattered most?]
4. **Privacy trade-offs.** Names never leave the browser, positions are sent only when 3 or more at-risk employees share them, and the sample data is synthetic. [CHRIS: connect this to the Data Privacy Act and your real work context.]
5. **Policy questions code cannot answer**, such as whether e-learning counts and who is covered, became settings rather than assumptions. [CHRIS: what you would confirm with the policy owner first.]

## What I would do differently

- Test with anonymized real data from my own L&D work before claiming results; the checks here use synthetic data.
- Add a shared rate limiter and persistence only after the privacy model is agreed.
- [CHRIS: your own lesson learned.]
