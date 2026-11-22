# Reflection on AI-Powered Web Application

**Christopher A. Pamatmat** · Week 4 – Graded Assignment 4.2 · Submitted November 22, 2026 (deadline November 23, 2026)

## What I built and how

Training Compliance Radar turns roster, attendance, catalog and calendar CSVs into an early warning for the at least, one-training-per-employee-per-year rule. One principle held throughout: **code computes, AI communicates.** A tested engine decides who is compliant; the AI only drafts memos, picks catalog courses and summarizes. I worked spec-first and revised `spec.md` as I learned. The 7 validation steps and PRD from Week 4A made me come up and define the problem. Week 4B's Spec-Driven Development kept the AI building what I have decided and not what it guessed.

## What AI did well

- **Speed on well-specified work.** With the spec and `AGENTS.md` in place, it produced the schemas, engine, CSV validator, sample data and a large test suite quickly. The whole app (90 commits, 406 tests) took about 5 working days; alone, I estimate several weeks.
- **Checking against reality.** It tested in a real browser and found that `generateObject` was deprecated in the installed AI SDK, so we moved to `generateText` with `Output.object`.

## What AI did poorly, or needed checking

- **Green tests prove little at first.** I had it break the engine on purpose to confirm the tests fail. They did.
- **Confident gaps.** Its first spec left real holes (an undefined back-test, loose dates), found only when I asked for a review. Later an AI memo called the 358 covered staff "fulfilled" and printed "{{months remaining}}"; both needed prompt and server fixes. Also, the summary at one time-ranked units by compliance rate while the chart ranked them by risk (v2.17).

## Where human judgment was needed

1. **Gemini, then Groq.** I started on Gemini's free tier, then hit its limits (5 requests a minute, 20 a day per model) and a possible model retirement before grading. Groq became the primary provider (1,000 requests a day), with Gemini 3.6 and 3.8 as backups and labeled templates if every model fails. Quota and cost–Groq simply offered more clicks versus any of Gemini's free tier. Twenty requests a day shared by every grader simply won't cut it. Also, I did not want a paid plan for a mini project.
2. **Making the back-test honest.** Recall is close to 100% almost by definition, so it proves little. I reframed it as the Early Warning Check: of 1,691 people flagged on Sep 30, 800 caught up on their own and 891 did not, so September is when to act. This gives employees 3 more months to comply. The value is not the prediction but the time to send memos while staff can still be trained.
3. **Spec revisions.** The spec grew from v1.0 to v2.17, each change written down before the code. Version 2.1 is the most important spec revision as this is rectified to "only regular staff can be at risk" which changed every headline number.
4. **Privacy trade-offs.** Names never leave the browser, positions are sent only when 3 or more at-risk employees share them, and the sample data is synthetic. Rosters and training records are personal information under RA 10173, so I followed its proportionality principle: the AI gets only unit-level counts.
5. **Policy questions code cannot answer**, such as whether e-learning counts and who is covered, became settings rather than assumptions. In real practice, LinkedIn Learning is being used as a stop gap measure to ensure every employee gets at least one L&D intervention annually.

## What I would do differently

- Test with anonymized real data from my own L&D work before claiming results; the checks here use synthetic data.
- Add a database and logins in the future, possibly Supabase for both, so results are saved in a real database instead of disappearing when the browser reloads, but only after my office agrees what employee data may be stored.
