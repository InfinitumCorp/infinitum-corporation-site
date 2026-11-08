// SCALVS.ai API client for the extension: POST /api/run with stream:true, read
// the server's minimal SSE ({type:"text"|"done"|"error"}). No keys live here;
// the model key stays on the SCALVS.ai server.

export const DEFAULT_BASE = "https://scalvs-ai.infinitumcorp.workers.dev";
export const MAX_TASK = 6000; // the server clips tasks at 6000 characters
const MAX_PREVIOUS = 8000;
export const AGENT = {
  name: "SCALVS.ai",
  role: "General assistant in the user's browser",
  instructions: "Answer the user's question directly. When page text or a selection is included, use it as the source.",
  tools: [],
};

export class ApiError extends Error {
  /** @param {"signin"|"demo"|"network"|"http"|"stream"} kind */
  constructor(kind, message, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

/** Normalise a user-entered address to an origin, or throw. */
export function normaliseBase(input) {
  const raw = String(input ?? "").trim() || DEFAULT_BASE;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ApiError("http", "That is not a valid address.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new ApiError("http", "Use an https:// address (http:// only for localhost).");
  return url.origin;
}

/** Host-permission pattern for an origin (ports are not part of match patterns). */
export const originPattern = (base) => `${new URL(base).protocol}//${new URL(base).hostname}/*`;

/** Build the POST /api/run body for one question. */
export function runBody({ question, page, previous } = {}) {
  const q = String(question ?? "").trim();
  if (!q) throw new ApiError("http", "Write a question first.");
  let task = q;
  if (page?.text) {
    const head = `${q}\n\n--- ${page.kind === "selection" ? "Selected text" : "Page text"}${page.title ? ` from "${page.title}"` : ""}${page.url ? ` (${page.url})` : ""} ---\n`;
    task = head + String(page.text).slice(0, Math.max(0, MAX_TASK - head.length));
  }
  const body = { agent: AGENT, context: [], task: task.slice(0, MAX_TASK), stream: true };
  if (previous) body.previous = String(previous).slice(-MAX_PREVIOUS);
  return body;
}

/** Check a non-stream response and turn failures into ApiErrors. */
export async function checkResponse(res) {
  if (res.type === "opaqueredirect" || res.status === 0 || (res.status >= 300 && res.status < 400)) {
    throw new ApiError("signin", "Sign in to SCALVS.ai in this browser first.");
  }
  const type = res.headers.get("content-type") || "";
  if (res.ok && type.includes("text/event-stream")) return res;
  if (res.status === 404) throw new ApiError("http", "SCALVS.ai is not deployed at this address yet. Check the address in Options.", 404);
  const data = type.includes("application/json") ? await res.json().catch(() => ({})) : null;
  if (!data) {
    if (res.status === 200 || res.status === 401 || res.status === 403) throw new ApiError("signin", "Sign in to SCALVS.ai in this browser first.", res.status);
    throw new ApiError("http", `Unexpected response (${res.status}).`, res.status);
  }
  if (res.status === 503 && data.mode === "demo") {
    throw new ApiError("demo", "SCALVS.ai is in demo mode: the server has no model configured yet.", 503);
  }
  if (res.ok && data.mode === "live" && typeof data.output === "string") return data;
  throw new ApiError("http", typeof data.error === "string" ? data.error : `Request failed (${res.status}).`, res.status);
}

/** Read the SSE stream; resolves with the full text only after a "done" event. */
export async function readStream(res, onText = () => {}) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let model = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const line = buffer.slice(0, cut).split("\n").find((l) => l.startsWith("data:"));
      buffer = buffer.slice(cut + 2);
      if (!line) continue;
      let evt;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "text" && typeof evt.text === "string") {
        full += evt.text;
        onText(full);
      } else if (evt.type === "error") {
        reader.cancel().catch(() => {});
        throw new ApiError("stream", evt.error || "The model stream failed. Please retry.");
      } else if (evt.type === "done") {
        model = evt.model ?? null;
        reader.cancel().catch(() => {});
        return { text: full, model };
      }
    }
  }
  throw new ApiError("stream", "The model stream ended early. Please retry.");
}

/** Ask one question; `fetchImpl` is injectable for tests. */
export async function ask({ base = DEFAULT_BASE, question, page, previous, signal, onText, fetchImpl = globalThis.fetch }) {
  let res;
  try {
    res = await fetchImpl(`${base}/api/run`, {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: { "content-type": "application/json", accept: "text/event-stream, application/json" },
      body: JSON.stringify(runBody({ question, page, previous })),
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("network", `Cannot reach ${new URL(base).host}.`);
  }
  const checked = await checkResponse(res);
  if (checked instanceof Response) return readStream(checked, onText);
  onText?.(checked.output);
  return { text: checked.output, model: checked.model ?? null };
}

/** GET /api/run: { ok, live }. */
export async function status({ base = DEFAULT_BASE, fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(`${base}/api/run`, { credentials: "include", redirect: "manual", cache: "no-store" });
  } catch {
    throw new ApiError("network", `Cannot reach ${new URL(base).host}.`);
  }
  if (res.type === "opaqueredirect" || res.status === 0) throw new ApiError("signin", "Sign in to SCALVS.ai in this browser first.");
  if (res.status === 404) throw new ApiError("http", `SCALVS.ai is not deployed at ${new URL(base).host} yet.`, 404);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new ApiError("http", `Unexpected response (${res.status}).`, res.status);
  return { live: Boolean(data.live) };
}
