# Overnight Report — Nov 8, 2026

Checkpoints 2–4 from [`build-plan.md`](build-plan.md) are done and pushed to `main` (HEAD at the time of writing: the commit that adds this file). The deadline is **Nov 9, 2026**.

## Update (Nov 8, later): AI is now working on the live site

The key was added to Vercel and the AI routes now return real output. Two further problems were found and fixed:

1. **Buttons went grey with no message.** A 503 latched a "not configured" flag that disabled every AI button and hid the per-action error. Fixed: errors always show inline with a Retry button, buttons stay usable, requests time out after 55 s, and failures always end in a result or an error (commits `cc3bf3c`).
2. **`gemini-3.8-flash` was overloaded.** A probe showed Google returning `503` (or hanging) for it while `gemini-3.6-flash` answered in about 1 s. The app now falls back automatically to `gemini-3.6-flash` (`AI_FALLBACK_MODEL`), skips a failed primary for 5 minutes, and reports the real cause in 502 bodies. Live calls now take about 2–5 s. Spec is at v1.5.

Optional: in Vercel, set `AI_MODEL=gemini-3.6-flash` (or remove `AI_MODEL`) to skip the broken primary entirely. `GET /api/status` shows the current configuration, and `GET /api/status?probe=1` makes one tiny test call to Google (rate limited, no user data).

The section below is the original note from before the key was set.

## (Resolved) The live AI features were OFF

I probed the live site. It is deployed with the latest code, but **every AI route returns `503 ai_not_configured`** because `GOOGLE_GENERATIVE_AI_API_KEY` is not set in the Vercel project. I cannot set it for you (it is your key and your Vercel account).

1. Get a free key at Google AI Studio (https://aistudio.google.com/apikey).
2. Vercel → project **training-compliance-radar** → Settings → Environment Variables → add `GOOGLE_GENERATIVE_AI_API_KEY` for **Production** (and Preview if you use it). Leave `AI_PROVIDER` and `AI_MODEL` unset to use the defaults (`google`, `gemini-3.8-flash`).
3. Redeploy (Deployments → latest → Redeploy). Env changes only apply to new deployments.
4. Confirm it worked. This sends one harmless synthetic request (no real data):

```bash
curl -s -X POST https://training-compliance-radar.vercel.app/api/memo -H 'content-type: application/json' -d '{"unit":"Demo Unit","atRiskCount":4,"coveredCount":20,"deadline":"2026-12-31","monthsRemaining":3,"courses":[],"tone":"formal"}'
```

Expected: JSON with `subject` and `body`. `{"error":"ai_not_configured"}` means the key is still missing; `{"error":"ai_failed"}` means the key or model was rejected (check Vercel function logs for `ai_call ... error_code=http_NNN`).

## What was completed

| Checkpoint | Result |
|---|---|
| 1. UI | Already done and pushed (`5468db9`); marked complete in the build plan |
| 2. AI routes | `/api/recommend`, `/api/memo`, `/api/summary` with all guards, aggregates-only payload builders, catalog-ID filtering, memo token enforcement and client-side name merge; UI buttons wired (memo with tone, recommend courses, executive summary, Copy, Download) |
| 3. CI and security | `.github/workflows/ci.yml` (lint, typecheck, test, build, report-only `npm audit`, gitleaks); **CI is green on GitHub**; history scan clean; CI badge in README |
| 4. Docs | Full README, `docs/reflection.md` (draft), `docs/demo-script.md`, GitHub issue [#1](https://github.com/Chris-GottaGit5hub/training-compliance-radar/issues/1) |

Quality gates at the end: `npm run lint`, `typecheck`, `build` clean; `npm test` **171 passing in 15 files** (up from 110). I also broke the new logic on purpose (small-cell size, catalog filter, rate-limit boundary, strict schemas) and confirmed tests fail each time.

Verified for real (not only by unit tests):

- Production server with **no key**: `503`; extra field (a name) in a body: `400`; GET: `405`; 11th request from one IP: `429`; a second IP is unaffected.
- Production server with a **fake key**: the real Gemini call fails and the route returns `502`. The server log has exactly one line, `ai_call route=memo provider=google model=gemini-3.8-flash latency_ms=255 status=error error_code=http_400`, and contains neither the request contents nor the key.
- In the browser (production build, sample data) with the `/api/*` responses stubbed: the full flow works, memo names are merged locally, and a capture of every request body showed **0 of 300** employee names or IDs; the requests were 358 to 3,762 bytes.

## Deviations from the spec

1. **`generateObject` replaced by `generateText` + `Output.object`.** The installed AI SDK (v7) marks `generateObject` deprecated. Behavior and schemas are the same. Recorded as **spec v1.3** (also updated in `AGENTS.md` and `docs/architecture.md`).
2. **Summary payload carries two optional extra aggregates**: `costToClose` and `budgetPhp` (peso totals, no personal data), plus `asOfDate`. Spec §5 said "org summary numbers + top 10 units".
3. **Recommend sends all at-risk units in one call** and the UI caches the result until data or rules change (the spec allows up to 200 units per request). Units with 0 at-risk are not sent.
4. **Guard order**: rate limit, body size, JSON, zod, then the AI-configured check. So `503` is returned only for an otherwise valid request.
5. **One rate limiter shared by all three routes** (10 per minute per IP), keyed by the first `x-forwarded-for` address.
6. **Request schemas are strict**: unknown fields are rejected with `400` (an extra safeguard against names or IDs), which the spec did not require.
7. **Numeric grounding** treats a number as valid if it appears anywhere in the request, including hours for course minutes (120 min allows "2 hours") and list markers are ignored. The spec said "equal to a number in the request".

## What failed, was skipped, or is unverified

- **Real Gemini output has not been seen.** No key was available, so prompts, token behavior and the grounding check were tested with fake generators only. Expect to tune prompts if memos often show the "figures could not be checked" warning.
- **gitleaks was not run locally** (not installed; I did not download a binary). I scanned all 23 commits with regex patterns and checked that no `.env*` file was ever committed. The real gitleaks job ran in CI and passed.
- **Screenshots are not taken.** The README has a placeholder.
- **Vercel Analytics and Speed Insights are in the code** but I cannot see whether they are enabled in your Vercel project.
- **The submission checklist in the README is my reconstruction.** I never saw the official brief, only the requirements recorded in your docs (e.g. "required by brief" for CI/CD and monitoring). It is marked `[CHRIS: verify...]`.
- **`docs/reflection.md` is a draft.** Facts come from this project's history, but your reasons for choosing Gemini are my inference. Markers show every place to personalize.
- **`npm audit`**: 8 moderate findings, all in the ESLint toolchain; none high, so the report-only step passes. I did not run `npm audit fix --force` (it makes breaking changes).
- **npm warns** that `esbuild`'s install script is not approved. Everything works; it may matter on a future npm version.
- **Back-test caveat:** recall is 100% on the sample data and is structurally high; precision (25% at Jun 30, 57% at Sep 30) is the informative number. The README says so.
- I created `.claude/launch.json` to serve the app for browser checks. It is excluded through `.git/info/exclude` and is not in the repo.

## Your checklist for the live site

Do these on https://training-compliance-radar.vercel.app in an **incognito window**, after the key step above.

**Deployment**
- [ ] Vercel shows the latest `main` commit as the Production deployment, status Ready.
- [ ] The `curl` command above returns a memo (not 503 or 502).
- [ ] Vercel → Analytics and Speed Insights are enabled and receive events after you browse.
- [ ] Vercel function logs show `ai_call route=... status=ok` lines and no payload or key text.

**Core flow (no AI needed)**
- [ ] Click **Load sample data**: roster 300 rows, attendance 381, catalog 26.
- [ ] KPIs read: **271** covered, **81.9%** compliance, **49** at risk, **3** months left, cost to close **₱5,600**.
- [ ] Back-test card: Jun 30 recall **100%**, precision **25%** (28 of 113 flagged); Sep 30 recall **100%**, precision **57%** (28 of 49).
- [ ] Top unit is **Branch Operations (12 at risk)**; clicking it opens the panel with 12 employees.
- [ ] **Export at-risk CSV** downloads and opens in Excel with the same rows.
- [ ] Set Budget to 3000: the cost card says "Short by ₱2,600".
- [ ] Clear the Year field: "Enter a number" appears and the dashboard hides.
- [ ] Upload a deliberately broken CSV: errors show row numbers.

**AI features**
- [ ] **Recommend courses** returns courses with working links; every title exists in the catalog.
- [ ] **Generate memo** (try Formal and Friendly) finishes in under 30 s, says "12 of 52", shows the employee list, and shows no `{{...}}` text.
- [ ] No "figures could not be checked" warning, or you understand why (click Generate again).
- [ ] **Copy memo** and **Download .txt** work.
- [ ] **Executive summary** (header button) appears and its numbers match the KPIs.
- [ ] DevTools → Network: the `/api/*` requests contain only unit names, counts and course titles. **Search them for a few employee names; there should be none.**
- [ ] Click AI buttons about 11 times quickly: you get "Too many AI requests", and it recovers after a minute.

**Layout and accessibility**
- [ ] Phone width (or DevTools mobile): no sideways scrolling; chart, tables and buttons usable.
- [ ] Tab through the page with the keyboard: every button and unit row is reachable.

**Repo and submission**
- [ ] The README CI badge is green and its links work.
- [ ] Add screenshots to `docs/screenshots/` and link them in the README.
- [ ] Replace every `[CHRIS: ...]` marker in `docs/reflection.md` (and the one in `docs/demo-script.md`).
- [ ] Compare the README submission checklist with the official brief and fix any row.
- [ ] Rehearse and record the demo with `docs/demo-script.md`.
- [ ] Re-read `docs/validation.md`: its figures marked "author estimate" must be yours to stand behind.

## Commits since the UI checkpoint

`8718593` build plan · `4f5e61e` spec v1.3 · `e09434b` schemas and payload builders · `642a906` AI config, generation, post-processing · `1a1cc40` guarded routes · `1465bf6` API client · `8aecdbc` UI wiring · `01eeae9` plan update · `668d2cc` CI workflow · `6114150` action upgrades · `0658c8c` README · `fdc7c74` reflection and demo script · `63fdec6` plan update.
