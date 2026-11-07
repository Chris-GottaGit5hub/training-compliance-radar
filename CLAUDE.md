# CLAUDE.md

Read `AGENTS.md` (project rules) and `spec.md` (source of truth) before any task. Summary for Claude Code:

## What this is
Training Compliance Radar: Next.js + TypeScript + Tailwind app. Deterministic compliance engine in `/lib/engine`; AI (Vercel AI SDK, Claude via `@ai-sdk/anthropic`, Gemini fallback) only for memos, catalog-grounded recommendations, and summaries.

## Commands
`npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run build` · `npm run sample-data`

## How to work in this repo
- Plan first for multi-file changes; keep each change small and reviewable.
- Implement one feature per task, run `npm run lint && npm run typecheck && npm test` before declaring done, then make ONE conventional commit for that feature.
- Write or update tests with every `/lib` change.
- When tests fail because the spec was unclear, propose a `spec.md` change (with a Revision Log row) instead of silently patching behavior.

## Hard rules
- Never let the LLM compute compliance or counts.
- Never send employee names/IDs to any API route or log.
- Never hardcode or print secrets; never commit `.env.local`.
- Never add a database, auth, or new paid service without asking.
- Synthetic data only.

## Env vars
`ANTHROPIC_API_KEY`, `AI_PROVIDER` (anthropic|google), `AI_MODEL` (default `claude-haiku-5-5`), `GOOGLE_GENERATIVE_AI_API_KEY` (optional). Template in `.env.example`.
