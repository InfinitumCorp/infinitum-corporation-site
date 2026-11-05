// SCALVS.ai agent runtime — Cloudflare Pages Function (route: /api/run).
// POST /api/run  { agent, task, context?, previous? }  ->  { mode, output, usage }
//
// Runs one agent step against the Claude Messages API using ANTHROPIC_API_KEY.
// When no key is configured it answers 503 { mode: "demo" } and the client
// falls back to its built-in simulated runner, so the prototype still works.

const apiUrl = (env) => `${(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_TASK_CHARS = 6000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

const WEB_SEARCH_TOOL = (env) => env.SCALVS_WEB_SEARCH_TOOL || 'web_search_20250305';
export const wantsWebSearch = (agent, env = {}) => Array.isArray(agent?.tools) && agent.tools.includes('Web search')
  && env.SCALVS_WEB_SEARCH !== 'off';

// ---------- attachments ----------
export const ATTACHMENT_LIMITS = { files: 5, textChars: 200_000, binaryBytes: 3_000_000 };
const BINARY_TYPES = { 'application/pdf': 'document', 'image/png': 'image', 'image/jpeg': 'image', 'image/gif': 'image', 'image/webp': 'image' };

// Returns { blocks } with Claude content blocks, or { error }.
export function attachmentBlocks(list) {
  if (list == null) return { blocks: [] };
  if (!Array.isArray(list)) return { error: 'attachments must be an array' };
  if (list.length > ATTACHMENT_LIMITS.files) return { error: `At most ${ATTACHMENT_LIMITS.files} files per task` };
  const blocks = [];
  let binary = 0;
  for (const f of list) {
    const name = clip(f?.name || 'file', 120).replace(/[<>"]/g, '');
    if (typeof f?.text === 'string') {
      blocks.push({ type: 'text', text: `<file name="${name}">\n${clip(f.text, ATTACHMENT_LIMITS.textChars)}\n</file>` });
      continue;
    }
    const kind = BINARY_TYPES[f?.type];
    if (!kind || typeof f?.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(f.data)) return { error: `Unsupported file: ${name}` };
    binary += Math.floor(f.data.length * 0.75);
    if (binary > ATTACHMENT_LIMITS.binaryBytes) return { error: 'Attachments are too large (3 MB max for PDFs and images)' };
    const source = { type: 'base64', media_type: f.type, data: f.data };
    blocks.push(kind === 'document' ? { type: 'document', source, title: name } : { type: 'image', source });
  }
  return { blocks };
}

export function buildSystemPrompt(agent = {}, context = [], webSearch = false) {
  const tools = Array.isArray(agent.tools) && agent.tools.length
    ? agent.tools.map((t) => `- ${clip(t, 60)}`).join('\n')
    : '- none';
  const memory = Array.isArray(context) && context.length
    ? context.map((m) => `- ${clip(m, 400)}`).join('\n')
    : '- (no shared context)';

  return [
    `You are "${clip(agent.name || 'Agent', 80)}", an AI agent running on SCALVS.ai, Infinitum's AI workforce platform.`,
    `Role: ${clip(agent.role || 'General assistant', 200)}.`,
    agent.instructions ? `Operator instructions:\n${clip(agent.instructions, 2000)}` : '',
    webSearch ? 'You have a real web search tool. Use it when the task needs current or external facts, and cite what you found.' : '',
    `Connected tools (other than web search these are simulated in this prototype; describe what you would do with them, never claim an action already happened outside this answer):\n${tools}`,
    `Context from the Nexus Context Vault (shared with permission):\n${memory}`,
    'Work style: start with a one-line plan, then deliver the finished work product. Be concrete and concise. Use short markdown headings and lists where helpful. If a step would need human approval (sending messages, spending money, publishing), stop and say what you would send for approval.',
  ].filter(Boolean).join('\n\n');
}

export async function POST(request, env = {}) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return json({ mode: 'demo', error: 'ANTHROPIC_API_KEY is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const task = clip(body?.task, MAX_TASK_CHARS).trim();
  if (!task) return json({ error: 'Missing task' }, 400);

  const { blocks: files, error: fileError } = attachmentBlocks(body.attachments);
  if (fileError) return json({ error: fileError }, 400);
  const taskText = body.previous
    ? `Task:\n${task}\n\nOutput from the previous agent in this team, to build on:\n${clip(body.previous, 8000)}`
    : task;
  const userContent = files.length
    ? [...files, { type: 'text', text: `${taskText}\n\n(${files.length} attached file${files.length > 1 ? 's' : ''} above.)` }]
    : taskText;

  const stream = body.stream === true;
  const callModel = (webSearch) => fetch(apiUrl(env), {
    method: 'POST',
    signal: request.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.SCALVS_MODEL || DEFAULT_MODEL,
      max_tokens: webSearch ? 3000 : 1500,
      stream,
      system: buildSystemPrompt(body.agent, body.context, webSearch),
      messages: [{ role: 'user', content: userContent }],
      ...(webSearch ? { tools: [{ type: WEB_SEARCH_TOOL(env), name: 'web_search', max_uses: 3 }] } : {}),
    }),
  });

  let webSearch = wantsWebSearch(body.agent, env);
  let upstream = await callModel(webSearch);
  // If web search isn't enabled for this API key/org, retry once without it.
  if (!upstream.ok && webSearch && upstream.status === 400) {
    await upstream.body?.cancel().catch(() => {});
    webSearch = false;
    upstream = await callModel(false);
  }

  if (upstream.ok && stream) return relayStream(upstream);

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: `Model request failed (${upstream.status})`, detail: clip(detail, 500) }, 502);
  }

  const data = await upstream.json();
  const output = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return json({ mode: 'live', model: data.model, output, usage: data.usage || null });
}

// Re-emit Anthropic's SSE stream as a minimal one for the client:
//   data: {"type":"text","text":"..."}   (repeated)
//   data: {"type":"done","usage":{...}}  or  data: {"type":"error","error":"..."}
export function relayStream(upstream) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const send = (controller, obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const body = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buffer = '';
      const usage = {};
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const line = event.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let data;
            try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              send(controller, { type: 'text', text: data.delta.text });
            } else if (data.type === 'content_block_delta' && data.delta?.type === 'citations_delta') {
              const c = data.delta.citation;
              if (c?.url) send(controller, { type: 'sources', sources: [{ url: c.url, title: c.title || '' }] });
            } else if (data.type === 'content_block_start' && data.content_block?.type === 'server_tool_use') {
              send(controller, { type: 'status', text: 'Searching the web…' });
            } else if (data.type === 'content_block_start' && data.content_block?.type === 'web_search_tool_result') {
              const results = Array.isArray(data.content_block.content) ? data.content_block.content : [];
              const sources = results.filter((x) => x.type === 'web_search_result' && x.url).map((x) => ({ url: x.url, title: x.title || '' }));
              if (sources.length) send(controller, { type: 'sources', sources });
              send(controller, { type: 'status', text: 'Reading results…' });
            } else if (data.type === 'message_start') {
              Object.assign(usage, data.message?.usage || {});
            } else if (data.type === 'message_delta') {
              Object.assign(usage, data.usage || {});
            } else if (data.type === 'error') {
              send(controller, { type: 'error', error: data.error?.message || 'Model stream error' });
            }
          }
        }
        send(controller, { type: 'done', usage });
      } catch (err) {
        send(controller, { type: 'error', error: err?.message || 'Stream interrupted' });
      } finally {
        controller.close();
      }
    },
    cancel() { upstream.body.cancel().catch(() => {}); },
  });

  return new Response(body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}

export function GET(request, env = {}) {
  return json({ ok: true, live: Boolean(env.ANTHROPIC_API_KEY) });
}

// Cloudflare Pages Functions entry points (secrets come from context.env).
export const onRequestPost = ({ request, env }) => POST(request, env);
export const onRequestGet = ({ request, env }) => GET(request, env);
