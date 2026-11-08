# CLAUDE.md

Read `AGENTS.md` (project rules) and `spec.md` (source of truth) before any task. Summary for Claude Code:

## What this is
Training Compliance Radar: Next.js + TypeScript + Tailwind app. Deterministic compliance engine in `/lib/engine`; AI (Vercel AI SDK; Google Gemini via `@ai-sdk/google` by default, Groq via `@ai-sdk/groq` and Claude via `@ai-sdk/anthropic` as one-env-var alternatives, with an ordered backup chain) only for memos, catalog-grounded recommendations, and summaries.

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
- `AI_PROVIDER` — `google` (default) | `anthropic` | `groq`
- `AI_MODEL` — optional override; defaults to `gemini-3.8-flash` (google), `claude-haiku-5-5` (anthropic) or `openai/gpt-oss-120b` (groq)
- `AI_FALLBACK_MODEL` — optional ordered backups, comma-separated `model` or `provider:model` (default `gemini-3.6-flash` for google; `google:gemini-3.6-flash,google:gemini-3.8-flash` for groq; `none` to disable)
- `AI_THINKING_LEVEL` — optional, Gemini only: `minimal`|`low` (default)|`medium`|`high`; lower is faster
- `GOOGLE_GENERATIVE_AI_API_KEY` — required when `AI_PROVIDER=google` or for a `google:` backup
- `ANTHROPIC_API_KEY` — required only when `AI_PROVIDER=anthropic` or for an `anthropic:` backup
- `GROQ_API_KEY` — required when `AI_PROVIDER=groq` or for a `groq:` backup

Backups run in order and may be on another provider; missing primary key → AI routes return 503 (spec §5, §7). Template in `.env.example`.
