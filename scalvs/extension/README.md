# SCALVS.ai™ for Chrome

A Manifest V3 extension for asking SCALVS.ai from any page.

- **Side panel** (toolbar button): a chat that streams answers from `POST /api/run` (`stream: true`), with Stop, Copy, New chat and **Add this page** (attaches the tab's text).
- **Context menu**: "Ask SCALVS.ai about the selection" and "Ask SCALVS.ai about this page" open the panel with a drafted question and the text attached. Nothing is sent until you press **Send**.
- **Endpoint**: by default `https://scalvs-ai.infinitumcorp.workers.dev`, the `workers.dev` address of the `scalvs-ai` Worker in `wrangler.jsonc`. In Options you can point it at another deployment, for example a custom domain or `http://localhost:3000`. Chrome then asks to grant that host. The model key stays on the server, and the extension ships no keys. If the deployment is later put behind Cloudflare Access, the panel detects the sign-in redirect and offers to open the site.

## Develop

```bash
npm run extension:icons   # render public/favicon.svg to extension/icons (needs Playwright's Chromium)
node --test tests/extension.test.js
npm run extension:zip     # checks the manifest, writes extension-dist/scalvs-extension-<version>.zip
```

The zip goes to `extension-dist/` (git-ignored), not `dist/`, so it never ends up in the Worker's public assets.

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → `scalvs/extension/`.

## Chrome Web Store

Upload `extension-dist/scalvs-extension-<version>.zip`, and bump `version` in `manifest.json` for each upload. Permissions to justify in the listing:

| Permission | Why |
| --- | --- |
| `sidePanel` | The chat UI. |
| `contextMenus` | Ask about the selection or page. |
| `storage` | The chosen address (local) and the pending draft (session). |
| `activeTab`, `scripting` | Read the current tab's text, only when the user asks ("this page" / Add this page). |
| host `scalvs-ai.infinitumcorp.workers.dev` | The default SCALVS.ai API. |
| optional hosts | Requested at runtime only for an address the user enters in Options. |
