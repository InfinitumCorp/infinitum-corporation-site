import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, ask, checkResponse, normaliseBase, originPattern, readStream, runBody, status } from '../extension/src/api.js';
import { checkManifest } from '../scripts/extension-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const sse = (events) => new Response(new ReadableStream({
  start(c) {
    const enc = new TextEncoder();
    for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
    c.close();
  },
}), { headers: { 'content-type': 'text/event-stream' } });

test('extension manifest is a valid MV3 package with no secrets', async () => {
  assert.deepEqual(await checkManifest(path.join(here, '..', 'extension')), []);
});

test('runBody attaches page text and stays within the server limit', () => {
  const body = runBody({ question: 'Summarise', page: { kind: 'page', title: 'T', url: 'https://a.test/', text: 'x'.repeat(10000) }, previous: 'earlier' });
  assert.equal(body.stream, true);
  assert.equal(body.agent.name, 'SCALVS.ai');
  assert.ok(body.task.startsWith('Summarise\n\n--- Page text from "T" (https://a.test/) ---\n'));
  assert.ok(body.task.length <= 6000);
  assert.equal(body.previous, 'earlier');
  assert.throws(() => runBody({ question: '  ' }), ApiError);
});

test('readStream returns text only after done, and surfaces stream errors', async () => {
  const seen = [];
  const out = await readStream(sse([{ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }, { type: 'done', model: 'm' }]), (t) => seen.push(t));
  assert.deepEqual(out, { text: 'Hello', model: 'm' });
  assert.deepEqual(seen, ['Hel', 'Hello']);
  await assert.rejects(readStream(sse([{ type: 'text', text: 'a' }])), /ended early/);
  await assert.rejects(readStream(sse([{ type: 'error', error: 'boom' }])), /boom/);
});

test('checkResponse maps demo mode, Access redirects and errors', async () => {
  await assert.rejects(checkResponse(json(503, { mode: 'demo', error: 'no key' })), { kind: 'demo' });
  await assert.rejects(checkResponse({ type: 'opaqueredirect', status: 0, headers: new Headers() }), { kind: 'signin' });
  await assert.rejects(checkResponse(new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })), { kind: 'signin' });
  await assert.rejects(checkResponse(json(502, { error: 'Model request failed (500). Please retry.' })), /Model request failed/);
});

test('normaliseBase accepts https origins and localhost only', () => {
  assert.equal(normaliseBase('scalvs.example.com/app/'), 'https://scalvs.example.com');
  assert.equal(normaliseBase('http://localhost:3000'), 'http://localhost:3000');
  assert.throws(() => normaliseBase('http://example.com'), /https/);
  assert.equal(originPattern('http://localhost:3000'), 'http://localhost/*');
});

test('ask() talks to the real /api/run handler end to end (fake model upstream)', async () => {
  const { POST } = await import('../api/run.js');
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let upstreamBody;
  globalThis.fetch = async (url, init) => {
    upstreamBody = JSON.parse(init.body);
    const events = [
      { type: 'message_start', message: { model: 'claude-test', usage: { input_tokens: 3 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Live ' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } },
      { type: 'message_stop' },
    ];
    return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const result = await ask({
      base: 'https://scalvs.test',
      question: 'Hi',
      page: { kind: 'selection', text: 'quoted', title: 'P', url: 'https://p.test/' },
      fetchImpl: (url, init) => POST(new Request(url, init)),
    });
    assert.deepEqual(result, { text: 'Live answer', model: 'claude-test' });
    assert.match(upstreamBody.messages[0].content, /Hi\n\n--- Selected text from "P"/);
    assert.match(upstreamBody.system, /You are "SCALVS\.ai"/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('status() reports demo mode and missing deployments', async () => {
  assert.deepEqual(await status({ fetchImpl: async () => json(200, { ok: true, live: false }) }), { live: false });
  await assert.rejects(status({ fetchImpl: async () => new Response('nope', { status: 404 }) }), /not deployed/);
});

test('without ANTHROPIC_API_KEY, /api/run answers through the Workers AI binding (stream and JSON)', async () => {
  const { POST, GET } = await import('../api/run.js');
  const { DEFAULT_WORKERS_AI_MODEL } = await import('../api/_workers-ai.js');
  delete process.env.ANTHROPIC_API_KEY;
  const calls = [];
  const ai = {
    async run(model, input) {
      calls.push({ model, input });
      if (!input.stream) return { response: 'Plain answer', usage: { total_tokens: 5 } };
      const lines = ['data: {"response":"Open "}', 'data: {"choices":[{"delta":{"content":"weights"}}]}', 'data: [DONE]'];
      return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(lines.join('\n\n') + '\n\n')); c.close(); } });
    },
  };
  const env = { AI: ai };
  assert.deepEqual(await (await GET(new Request('https://s.test/api/run'), env)).json(), { ok: true, live: true });
  const streamed = await ask({ base: 'https://s.test', question: 'Hi', fetchImpl: (url, init) => POST(new Request(url, init), env) });
  assert.deepEqual(streamed, { text: 'Open weights', model: process.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL });
  assert.equal(calls[0].input.messages[0].role, 'system');
  const plain = await POST(new Request('https://s.test/api/run', { method: 'POST', body: JSON.stringify({ task: 'Hi' }) }), env);
  assert.equal((await plain.json()).output, 'Plain answer');
  const none = await POST(new Request('https://s.test/api/run', { method: 'POST', body: JSON.stringify({ task: 'Hi' }) }), {});
  assert.equal(none.status, 503);
});
