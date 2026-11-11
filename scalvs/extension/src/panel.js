import { ApiError, DEFAULT_BASE, ask, originPattern } from "./api.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
};

let base = DEFAULT_BASE;
let page = null; // { kind, url, title, text } attached to the next question
let lastAnswer = "";
let controller = null;

async function loadBase() {
  const stored = (await chrome.storage.local.get("base")).base;
  base = stored || DEFAULT_BASE;
  $("home").href = base + "/";
}

function notice(err) {
  const box = $("notice");
  box.replaceChildren();
  box.hidden = !err;
  if (!err) return;
  box.className = "notice" + (err.kind === "demo" ? "" : " bad");
  box.append(el("p", { textContent: err.message }));
  if (err.kind === "signin") {
    box.append(el("p", {}, el("button", { className: "btn primary", type: "button", textContent: "Open SCALVS.ai to sign in", onclick: () => chrome.tabs.create({ url: base + "/" }) })));
  } else if (err.kind === "network" || err.kind === "http" || err.kind === "demo") {
    box.append(el("p", {}, el("button", { className: "btn", type: "button", textContent: "Options", onclick: () => chrome.runtime.openOptionsPage() })));
  }
}

function setAttachment(p) {
  page = p && p.text ? p : null;
  $("attachment").hidden = !page;
  if (page) $("attachment-label").textContent = `${page.kind === "selection" ? "Selection" : "Page"}: ${page.title || page.url || ""} (${page.text.length.toLocaleString()} chars)`;
}

function message(who, text, extra) {
  $("empty")?.remove();
  const body = el("div", { className: "text", textContent: text });
  const copy = el("button", { className: "link small", type: "button", textContent: "Copy", onclick: () => navigator.clipboard.writeText(body.textContent) });
  const item = el("li", {}, el("div", { className: "who" }, el("span", { textContent: who }), who === "SCALVS.ai" ? copy : null), body, extra);
  $("messages").append(item);
  item.scrollIntoView({ block: "end" });
  return body;
}

function busy(on) {
  $("send").disabled = on;
  $("stop").hidden = !on;
}

$("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = $("question").value.trim();
  if (!question || controller) return;
  const attached = page;
  message("You", question, attached ? el("div", { className: "source small muted", textContent: `with ${attached.kind === "selection" ? "selection" : "page"}: ${attached.title || attached.url}` }) : null);
  $("question").value = "";
  setAttachment(null);
  notice(null);
  const out = message("SCALVS.ai", "");
  out.classList.add("pending");
  controller = new AbortController();
  busy(true);
  try {
    const { text } = await ask({ base, question, page: attached, previous: lastAnswer, signal: controller.signal, onText: (t) => (out.textContent = t) });
    lastAnswer = text;
  } catch (err) {
    if (err?.name === "AbortError") {
      out.textContent += out.textContent ? "\n\n(Stopped)" : "(Stopped)";
    } else {
      const apiErr = err instanceof ApiError ? err : new ApiError("http", String(err?.message || err));
      out.textContent = apiErr.message;
      out.classList.add("failed");
      notice(apiErr);
    }
  } finally {
    out.classList.remove("pending");
    controller = null;
    busy(false);
  }
});

$("question").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("stop").addEventListener("click", () => controller?.abort());
$("drop-attachment").addEventListener("click", () => setAttachment(null));
$("new-chat").addEventListener("click", () => {
  controller?.abort();
  lastAnswer = "";
  setAttachment(null);
  notice(null);
  $("messages").replaceChildren(el("li", { className: "empty", id: "empty", textContent: "New chat." }));
});

$("attach-page").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) return notice(new ApiError("http", "Open a web page in this tab first."));
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 5000),
    });
    setAttachment({ kind: "page", url: tab.url, title: tab.title, text: result || "" });
    if (!result) notice(new ApiError("http", "That page has no readable text."));
  } catch {
    notice(new ApiError("http", "Chrome did not allow reading this tab. Use the right-click menu on the page instead."));
  }
});

function applyDraft(draft) {
  if (!draft) return;
  $("question").value = draft.question || "";
  setAttachment(draft.page);
  $("question").focus();
  $("question").select();
  chrome.storage.session.remove("draft");
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.draft?.newValue) applyDraft(changes.draft.newValue);
  if (area === "local" && changes.base) loadBase();
});

(async () => {
  await loadBase();
  if (base !== DEFAULT_BASE && !(await chrome.permissions.contains({ origins: [originPattern(base)] }))) {
    notice(new ApiError("http", `Allow access to ${new URL(base).host} in Options.`));
  }
  applyDraft((await chrome.storage.session.get("draft")).draft);
})();
