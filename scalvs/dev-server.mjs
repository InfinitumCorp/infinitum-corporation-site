// Zero-dependency local dev server that mimics Cloudflare Pages:
// serves public/ and runs functions/api/<name>.js (onRequest<Method>).
// Usage: ANTHROPIC_API_KEY=sk-... node dev-server.mjs   (key optional)
// With Wrangler installed you can use `npx wrangler pages dev` instead.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
// Local stand-in for the SCALVS_USAGE KV binding (like `wrangler pages dev`).
const kvData = new Map();
const ENV = {
  ...process.env,
  SCALVS_USAGE: {
    get: async (k) => (kvData.has(k) ? kvData.get(k) : null),
    put: async (k, v) => { kvData.set(k, String(v)); },
  },
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const apiMatch = url.pathname.match(/^\/api\/([a-z0-9-]+)$/);
    if (apiMatch) {
      let mod;
      try { mod = await import(`./functions/api/${apiMatch[1]}.js`); } catch { res.writeHead(404).end(); return; }
      const method = req.method[0] + req.method.slice(1).toLowerCase();
      const fn = mod[`onRequest${method}`] || mod.onRequest;
      if (!fn) { res.writeHead(405).end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      const request = new Request(url, { method: req.method, headers: req.headers, signal: abort.signal, body: chunks.length ? Buffer.concat(chunks) : undefined });
      let response;
      try {
        response = await fn({ request, env: ENV, params: {} });
      } catch (err) {
        console.error(`[api/${apiMatch[1]}]`, err);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Internal error' }));
        return;
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (!response.body) { res.end(); return; }
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch { /* client went away */ }
      res.end();
      return;
    }
    const urlPath = url.pathname.replace(/\/+$/, '/');
    let path = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '\\') path = '/index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw new Error('not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, () => console.log(`SCALVS.ai dev server → http://localhost:${PORT}`));
