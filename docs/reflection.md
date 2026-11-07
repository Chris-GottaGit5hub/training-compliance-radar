# Reflection — DRAFT

> **DRAFT written from the project record. [CHRIS: personalize]** Every `[CHRIS: ...]` marker is a place for your own voice, memory or opinion. Cut anything that is not true to your experience. Target: one page.

## What I built and how

Training Compliance Radar turns three CSVs into an early warning for the one-training-per-year rule. I kept one principle throughout: **code computes, AI communicates.** A deterministic, tested engine decides who is compliant; the AI only drafts memos, picks courses from the catalog, and summarizes. I worked spec-first: validation, PRD, architecture and a `spec.md` that I revised as I learned. [CHRIS: one sentence on how the Week 4A/4B material shaped this.]

## What AI did well

- **Speed on well-specified work.** With the spec and `AGENTS.md` in place, the AI produced the schemas, engine, CSV validator, sample-data generator and a large test suite quickly and consistently. [CHRIS: what did this save you in hours or days?]
- **Breadth of checking.** It tested its own work in a real browser and with `curl`, including a request sent with a fake key to confirm the logs contain no payload or key.
- **Catching mismatches with reality.** It read the installed AI SDK docs and found `generateObject` is deprecated in v7, so we moved to `generateText` with `Output.object` (spec v1.3) instead of coding against stale knowledge.

## What AI did poorly, or needed checking

- **Green on the first run is not proof.** The first test suites passed immediately, which proved little. I had the AI break the engine on purpose (change `>=` to `>`, floor instead of round) to confirm tests fail. They did.
- **Confident defaults.** The first spec draft left real gaps (cost-to-close ignored e-learning rules, the back-test was undefined, dates and time zones were loose). The AI's own senior-engineer review found them, but only after I asked for the review. [CHRIS: any other place the AI was confidently wrong?]
- **Things it cannot do for me.** It cannot hold my Vercel account or API keys, so the live AI features depend on a step only I can take.

## Where human judgment was needed

1. **Gemini vs Claude.** I chose Google Gemini as the default for cost: a free tier suits a student project, and the app sends only aggregates and synthetic data, so the free-tier data-use terms are acceptable. Claude stays one env var away. [CHRIS: your real reasons: budget, quota, quality?]
2. **Reframing the back-test metric.** Recall alone came out at 100%, because anyone untrained stays untrained until they train. That is true but uninformative. We added **precision** at two checkpoints (Jun 30: 25%; Sep 30: 57%), and read `1 − precision` as the group early nudges can actually change. [CHRIS: how this changes the story you tell about the product.]
3. **Spec revisions v1.1 to v1.3.** v1.1 came from the senior-engineer review, v1.2 from clarifications while building the engine (e.g. the Oct 15 late hire is `EXEMPT` only if the as-of date is on or after Oct 15), and v1.3 from the SDK change. Each time I updated the spec before the code. [CHRIS: which revision mattered most?]
4. **Privacy trade-offs.** I decided names never leave the browser, positions are sent only when 3 or more at-risk employees share them, and unknown request fields are rejected outright. [CHRIS: connect this to the Data Privacy Act and your real work context.]
5. **Policy questions I could not answer from code**, such as whether e-learning counts and which employee types are covered. They are settings, not assumptions. [CHRIS: what you would confirm with the policy owner first.]

## What I would do differently

- Test with real (anonymized) data from my own L&D work before claiming results; the back-test here is on synthetic data.
- Add a shared rate limiter and persistence only after the privacy model is agreed.
- [CHRIS: your own lesson learned.]
