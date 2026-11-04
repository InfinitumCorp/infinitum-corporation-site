# SCALVS.ai — prototype

Infinitum's AI workforce platform: build agents that research, write, code, sell and operate for you, in any browser.

This is the first working prototype of the four-step flow from the [product page](https://infinitum-corporation.vercel.app/products/scalus):

| Step | Screen | What works |
|---|---|---|
| 01 Create | **Agent Studio** | Six templates (Researcher, Writer, Coder, Sales rep, Operator, Support); name, role, instructions, tools, Context Vault, approval and schedule and standing task per agent; plan-based agent limits; multi-agent **teams** run in sequence (/CNDCTR/-style), each agent building on the previous output. |
| 02 Connect | **Connect** | Toggle connections to your apps and Infinitum products (simulated); **Nexus Context Vault** entries with per-product permissions that agents read when memory is on. |
| 03 Run | **Command Center** | Chat-style composer to give an agent or team a task, with **file attachments** (text files inline; PDFs and images sent to Claude natively, 5 files / 3 MB); agent output **streams in live**; **Stop** a running task; **human approval** gates; copy any agent's output; **follow up** on a finished run to have an agent revise its answer; agents with the Web search tool **search the web** (live mode) and show their sources; AI-credit meter per plan; **scheduled agents** run their standing task hourly, daily or weekly while the app is open (one catch-up run on open, never replayed). |
| — | **Settings** | Runtime status; **cloud sync** (email sign-in link, workspace syncs across devices); **export / import** the whole workspace as JSON; reset. |
| 04 Earn | **Earnings & Data Wallet** | Activity credits and capped **$SCLV** rewards on verified runs, ad revenue share opt-in (Free plan), data licensing with an 85% share, ledger, plan switcher. |

> **Simulated economy.** $SCLV, balances, sales and the ledger are mock values stored in the browser. No tokens, wallets, blockchain transactions or payments are involved.

## Live vs demo mode

Agent steps run through `api/run.js`, a Vercel serverless function that calls the Claude Messages API.

- **Live:** set `ANTHROPIC_API_KEY` in the Vercel project (optionally `SCALVS_MODEL`, default `claude-sonnet-5-5`, and `ANTHROPIC_BASE_URL` for a gateway). Agents then produce real work, streamed token by token. Agents with **Web search** use Claude's web search tool (`SCALVS_WEB_SEARCH_TOOL`, default `web_search_20250305`; set `SCALVS_WEB_SEARCH=off` to disable). If web search isn't enabled for your API key, the request is retried without it.
- **Demo:** with no key the function answers `503` and the app falls back to simulated agent output, so everything still works end to end.

The composer shows which mode is active.

## Cloud sync (optional)

Without configuration the workspace lives in one browser. To sync it across devices with accounts:

1. Create a Supabase project.
2. Run `supabase/migrations/0001_workspaces.sql` in its SQL editor. It creates `public.workspaces` (one JSON document per user) with row level security so each user can only read and write their own row.
3. In Supabase → Authentication → URL Configuration, set the Site URL to your deployment and add it to the redirect allow list.
4. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public anon key) to the Vercel project.

Users then sign in from **Settings → Cloud sync** with an emailed link. Changes push automatically about 1.5 s after they happen and are pulled when the tab regains focus. On a device that already has its own work, the first sign-in asks whether to load the cloud workspace or upload the local one. After that, sync is last-write-wins.

## Run locally

No dependencies, no build step. Node 20+.

```bash
cd scalvs
npm run dev                                  # demo mode, http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-... npm run dev     # live mode
```

## Deploy

Import the repo in Vercel and set **Root Directory** to `scalvs` (framework preset: **Other**, no build command). Static files are served as-is and `api/run.js` becomes `/api/run`. All paths are relative, so the static app also works from any subfolder (it falls back to demo mode where `/api/run` isn't deployed).

## Structure

```
index.html            app shell + sidebar
src/app.js            hash router, re-rendering
src/store.js          localStorage state (agents, teams, runs, vault, wallet)
src/runner.js         run lifecycle: sequencing, approvals, credits, rewards, attachments
src/scheduler.js      runs scheduled agents' standing tasks when due
src/data.js           templates, plans, connectors, reward rules
src/views/*.js        command, studio, connect, earnings, settings
src/styles.css        clean white UI
api/run.js            Claude-backed agent step (Vercel function)
api/config.js         public client config (Supabase URL + anon key)
src/cloud.js          sign-in link, session refresh, workspace sync
supabase/migrations/  database schema + row level security
dev-server.mjs        zero-dependency local server
```

## Next steps

- Team workspaces (shared agents and approvals between colleagues)
- Real connectors (email, Slack, GitHub) behind OAuth, with approvals enforced server-side
- Server-side scheduler (Vercel Cron + the cloud workspace) so schedules run with the app closed
- More real tools (files, email drafts) with per-tool approval

© 2026 Infinitum Corporation
