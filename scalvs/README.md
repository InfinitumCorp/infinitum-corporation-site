# SCALVS.ai — prototype

Infinitum's AI workforce platform: build agents that research, write, code, sell and operate for you, in any browser.

This is the first working prototype of the four-step flow from the [product page](https://infinitum-corporation.vercel.app/products/scalus):

| Step | Screen | What works |
|---|---|---|
| 01 Create | **Agent Studio** | Six templates (Researcher, Writer, Coder, Sales rep, Operator, Support); name, role, instructions, tools, Context Vault, approval and schedule and standing task per agent; plan-based agent limits; multi-agent **teams** run in sequence (:\ARCHITCT\\-style), each agent building on the previous output. |
| 02 Connect | **Connect** | Toggle connections to your apps and Infinitum products (simulated); **Nexus Context Vault** entries with per-product permissions that agents read when memory is on. |
| 03 Run | **Command Center** | Chat-style composer to give an agent or team a task, with **file attachments** (text files inline; PDFs and images sent to Claude natively, 5 files / 3 MB); agent output **streams in live**; **Stop** a running task; **human approval** gates; copy any agent's output; **follow up** on a finished run to have an agent revise its answer; agents with the Web search tool **search the web** (live mode) and show their sources; AI-credit meter per plan; **scheduled agents** run their standing task hourly, daily or weekly while the app is open (one catch-up run on open, never replayed). |
| — | **Settings** | Runtime status; **cloud sync** (email sign-in link, workspace syncs across devices); **export / import** the whole workspace as JSON; reset. |
| 04 Earn | **Earnings & Data Wallet** | Activity credits and capped **$SCLV** rewards on verified runs, ad revenue share opt-in (Free plan), data licensing with an 85% share, ledger, plan switcher. |

> **Simulated economy.** $SCLV, balances, sales and the ledger are mock values stored in the browser. No tokens, wallets, blockchain transactions or payments are involved.

## Live vs demo mode

Agent steps run through `functions/api/run.js`, a Cloudflare Pages Function that calls the Claude Messages API.

- **Live:** add `ANTHROPIC_API_KEY` as a secret in the Cloudflare Pages project (optionally `SCALVS_MODEL`, default `claude-sonnet-5-5`, and `ANTHROPIC_BASE_URL` for a gateway). Agents then produce real work, streamed token by token. Agents with **Web search** use Claude's web search tool (`SCALVS_WEB_SEARCH_TOOL`, default `web_search_20250305`; set `SCALVS_WEB_SEARCH=off` to disable). If web search isn't enabled for your API key, the request is retried without it.
- **Demo:** with no key the function answers `503` and the app falls back to simulated agent output, so everything still works end to end.

The composer shows which mode is active.

## Usage limits

Live runs cost real Claude usage, so `functions/api/run.js` checks a daily (UTC) quota on the server before every agent step. Each step of a run counts as one live run, and a run is given back if the Claude call fails.

| Variable | Default | Applies to |
|---|---|---|
| `SCALVS_DAILY_LIMIT_USER` | `100` | each signed-in user (token verified with Supabase) |
| `SCALVS_DAILY_LIMIT_ANON` | `10` | each anonymous visitor, by hashed IP |
| `SCALVS_REQUIRE_SIGNIN` | `false` | `true` blocks anonymous live runs entirely |
| `SCALVS_DAILY_LIMIT_GLOBAL` | `1000` | all callers together (`off` disables) |

Counts are kept in a Cloudflare KV namespace bound as `SCALVS_USAGE`: run `npx wrangler kv namespace create SCALVS_USAGE` and paste the id into `wrangler.toml`, or add it in the dashboard (Pages project → Settings → Bindings → KV namespace). Without the binding, limits fall back to per-instance memory (best effort only), and Settings says so. KV is eventually consistent, so the caps are soft: a burst can overshoot by a few runs. They exist to stop runaway spend, not to meter billing.

The composer shows how many live runs are left today, and the app refuses a run before spending anything once they're gone. For a public link, set `SCALVS_REQUIRE_SIGNIN=true` once cloud sync is on.

## Cloud sync (optional)

Without configuration the workspace lives in one browser. To sync it across devices with accounts:

1. Create a Supabase project.
2. Run `supabase/migrations/0001_workspaces.sql` in its SQL editor. It creates `public.workspaces` (one JSON document per user) with row level security so each user can only read and write their own row.
3. In Supabase → Authentication → URL Configuration, set the Site URL to your deployment and add it to the redirect allow list.
4. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public anon key) as variables in the Cloudflare Pages project.

Users then sign in from **Settings → Cloud sync** with an emailed link. Changes push automatically about 1.5 s after they happen and are pulled when the tab regains focus. On a device that already has its own work, the first sign-in asks whether to load the cloud workspace or upload the local one. After that, sync is last-write-wins.

## Run locally

No dependencies, no build step. Node 20+.

```bash
cd scalvs
npm run dev                                  # demo mode, http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-... npm run dev     # live mode
```

`npm run dev` mimics Cloudflare Pages with no dependencies. To run on the real Workers runtime instead, put your variables in `.dev.vars` (copy `.env.example`) and run `npm run cf:dev` (uses Wrangler).

## Deploy

Cloudflare Pages, no build step.

**From the dashboard (Git integration):** Workers & Pages → Create → Pages → Connect to Git → pick the repo, then set:

| Setting | Value |
|---|---|
| Root directory | `scalvs` |
| Framework preset | None |
| Build command | *(empty)* |
| Build output directory | `public` |

Then add variables under **Settings → Variables and Secrets** (`ANTHROPIC_API_KEY` as a secret; optionally `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SCALVS_MODEL`) and redeploy. `functions/api/run.js` serves `/api/run` and `functions/api/config.js` serves `/api/config`; `public/_headers` sets security headers.

**From the command line:** `cd scalvs && npm run deploy` (Wrangler, uses `wrangler.toml`), then `npx wrangler pages secret put ANTHROPIC_API_KEY`.

All app paths are relative, so the static app also works from a subfolder; it falls back to demo mode where `/api/run` isn't deployed.

## Structure

```
public/                      static site (Cloudflare Pages output directory)
  index.html                 app shell + sidebar
  _headers                   security headers
  src/app.js                 hash router, re-rendering
  src/store.js               localStorage state (agents, teams, runs, vault, wallet)
  src/runner.js              run lifecycle: sequencing, approvals, credits, rewards, attachments
  src/scheduler.js           runs scheduled agents' standing tasks when due
  src/cloud.js               sign-in link, session refresh, workspace sync
  src/data.js                templates, plans, connectors, reward rules
  src/views/*.js             command, studio, connect, earnings, settings
  src/styles.css             clean white UI
functions/api/run.js         Claude-backed agent step (Pages Function)
functions/api/config.js      public client config (Supabase URL + anon key)
lib/usage.js                 server-side daily limits (KV-backed)
supabase/migrations/         database schema + row level security
wrangler.toml                Cloudflare Pages config
dev-server.mjs               zero-dependency local server (mimics Pages)
```

## Next steps

- Team workspaces (shared agents and approvals between colleagues)
- Real connectors (email, Slack, GitHub) behind OAuth, with approvals enforced server-side
- Server-side scheduler (a Cloudflare Worker Cron Trigger + the cloud workspace) so schedules run with the app closed
- More real tools (files, email drafts) with per-tool approval

© 2026 Infinitum Corporation
