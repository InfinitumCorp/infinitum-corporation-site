// Genesis Drop (/drop): countdown, moving Nexus wheel, tiers, lineup and Solana wallet registration.
// Talks to the revenue API (/v1/drop). Everything renders without it; registration needs it.
(() => {
const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const main = $("#main");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const paused = () => reduced || root.classList.contains("motion-paused");
// Footer "Pause motion" button (one-page.js handles it on the home page only).
const motionBtn = document.getElementById("one-motion");
if (motionBtn) motionBtn.addEventListener("click", () => {
  const on = root.classList.toggle("motion-paused");
  motionBtn.setAttribute("aria-pressed", String(on));
  motionBtn.textContent = on ? "Play motion" : "Pause motion";
});
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => n.toLocaleString("en-US");

// Local preview may point at a dev API: /drop?api=http://localhost:8787 (localhost only).
let API = main.dataset.api;
try { const q = new URL(location.href).searchParams.get("api"); if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = q; } catch {}

const DROP_AT = Date.UTC(2027, 0, 1, 0, 0, 0);
const TIERS = [
  { id: "genesis", name: "Genesis", from: 1, to: 1000, mult: 3, blurb: "The first thousand wallets. Triple weight on every token you pick." },
  { id: "vanguard", name: "Vanguard", from: 1001, to: 10000, mult: 2, blurb: "Wallets 1,001 to 10,000. Double weight across the lineup." },
  { id: "wave", name: "Wave", from: 10001, to: null, mult: 1, blurb: "Everyone after. A full base share of every pool you pick." },
];
const HUB = { t: "FIRM", p: "$Firmament Network™", href: "/products/firmament-network", m: "The nexus. Every product token settles here." };
const TOKENS = [
  { t: "VEIL", p: "VEIL</>™", href: "/products/veil", m: "Browse quietly. Get paid for it." },
  { t: "CMLS", p: "Cumulus://Cloud™", href: "/products/cumulus-exchange", m: "Your files, but airborne." },
  { t: "SCLV", p: "SCALVS.ai™", href: "/products/scalus", m: "Agents never sleep. Neither does the ledger." },
  { t: "ARCT", p: ":\\ARCHITECT\\™", href: "/products/architect", m: "Ship the outcome. Get the credit." },
  { t: "HRVST", p: "[HRVST]™", href: "/products/hrvst", m: "Touch grass. Log it. Get paid." },
  { t: "EIDT", p: "ei·det·ic™", href: "/products/eidetic", m: "Remember everything. Leak nothing." },
  { t: "SPCTR", p: "+SPCTR™", href: "/products/spectre", m: "Full-spectrum research, sourced and signed." },
  { t: "MTRN", p: "METATRON¹⁰⁰™", href: "/products/metatron", m: "A hundred ledgers. One view from above." },
  { t: "FAB", p: "FabriC++™", href: "/products/fabric", m: "Every call takes a cut. Yours, now." },
];
const ALL = [HUB, ...TOKENS];

/* ---------- countdown ---------- */
const pad = (n) => String(n).padStart(2, "0");
try {
  const local = new Date(DROP_AT).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  $("#drop-local").textContent = `1 January 2027, 00:00 UTC. That's ${local} where you are.`;
} catch {}
function tick() {
  const now = Date.now();
  let ms = Math.max(0, DROP_AT - now);
  const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5;
  const m = Math.floor(ms / 6e4); ms -= m * 6e4;
  $("#cd-d").textContent = d; $("#cd-h").textContent = pad(h); $("#cd-m").textContent = pad(m); $("#cd-s").textContent = pad(Math.floor(ms / 1e3));
  $("#drop-utc").textContent = new Date(now).toISOString().slice(11, 19) + " UTC";
  if (now >= DROP_AT) $("#drop-tminus").textContent = "The drop is live";
}
tick(); setInterval(tick, 1000);

/* ---------- moving Nexus wheel ---------- */
const NS = "http://www.w3.org/2000/svg";
const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent && parent.append(el); return el; };
const svg = $("#drop-nexus"), C = 400, R = 300, NR = 40, HR = 78;
const orbit = mk("circle", { class: "nexus-orbit", cx: C, cy: C, r: 356 }, svg);
const ring = mk("polygon", { class: "nexus-ring" }, svg);
const gS = mk("g", {}, svg), gP = mk("g", {}, svg), gN = mk("g", {}, svg);
const spokes = TOKENS.map(() => mk("line", { class: "nexus-spoke", x1: C, y1: C }, gS));
const cap = $("#drop-cap"), capDefault = cap.innerHTML;
let active = -1, theta = -Math.PI / 2, speed = 1, target = 1, lastPulse = -1e9;
const nodes = TOKENS.map((k, i) => {
  const g = mk("g", { class: "nexus-node", tabindex: "0", role: "link", "aria-label": `$${k.t}, ${k.p}, on Solana` }, gN);
  mk("circle", { r: NR }, g);
  mk("text", {}, g).textContent = k.t;
  const on = () => focus(i), off = () => focus(-1);
  g.addEventListener("mouseenter", on); g.addEventListener("mouseleave", off);
  g.addEventListener("focus", on); g.addEventListener("blur", off);
  g.addEventListener("click", () => { location.href = k.href; });
  g.addEventListener("keydown", (e) => { if (e.key === "Enter") location.href = k.href; });
  return g;
});
const hub = mk("a", { href: HUB.href, "aria-label": "Firmament Network, nexus token $FIRM" }, svg);
const hubG = mk("g", { class: "nexus-hub" }, hub);
const halo = mk("circle", { class: "hub-halo", cx: C, cy: C, r: HR, opacity: 0 }, hubG);
mk("circle", { cx: C, cy: C, r: HR }, hubG);
mk("text", { x: C, y: C - 4 }, hubG).textContent = "FIRM";
mk("text", { class: "nexus-hub-sub", x: C, y: C + 24 }, hubG).textContent = "SOLANA";
const packets = Array.from({ length: TOKENS.length * 2 }, (_, j) => ({ i: j % TOKENS.length, t: Math.random(), v: .0035 + Math.random() * .004, el: mk("circle", { class: "packet", r: 4.5 }, gP) }));

function focus(i) {
  active = i; target = i < 0 ? 1 : 0;
  nodes.forEach((n, j) => n.classList.toggle("on", j === i));
  spokes.forEach((s, j) => { s.style.opacity = i < 0 || j === i ? "" : ".15"; });
  cap.innerHTML = i < 0 ? capDefault : `<b>$${TOKENS[i].t}</b> &middot; ${esc(TOKENS[i].p)}<br>${esc(TOKENS[i].m)}`;
  if (paused()) draw(0);
}
function draw(ts) {
  if (!paused()) { speed += (target - speed) * .06; theta += .0016 * speed; }
  const pts = TOKENS.map((_, i) => { const a = theta + i * 2 * Math.PI / TOKENS.length; return [C + R * Math.cos(a), C + R * Math.sin(a)]; });
  ring.setAttribute("points", pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" "));
  pts.forEach(([x, y], i) => {
    spokes[i].setAttribute("x2", x.toFixed(1)); spokes[i].setAttribute("y2", y.toFixed(1));
    nodes[i].setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  });
  orbit.style.strokeDashoffset = String(-ts / 60);
  for (const p of packets) {
    const lit = active < 0 || active === p.i;
    if (!paused()) { p.t += p.v * (lit ? 1 : .25); if (p.t >= 1) { p.t = 0; lastPulse = ts; } }
    const [x, y] = pts[p.i], f = NR / R + (1 - (NR + HR) / R) * p.t;
    p.el.setAttribute("cx", (x + (C - x) * f).toFixed(1)); p.el.setAttribute("cy", (y + (C - y) * f).toFixed(1));
    p.el.setAttribute("opacity", paused() ? "0" : (Math.min(1, (1 - p.t) * 4) * (lit ? 1 : .25)).toFixed(2));
  }
  const age = Math.min(1, (ts - lastPulse) / 700);
  halo.setAttribute("r", (HR + 40 * age).toFixed(1)); halo.setAttribute("opacity", (.4 * (1 - age)).toFixed(2));
}
draw(0);
// 3D: idle sway, follows the pointer.
const stage = $("#drop-wheel"), tilt = $("#drop-tilt");
let px = null, py = null;
stage.addEventListener("pointermove", (e) => { const r = stage.getBoundingClientRect(); px = (e.clientX - r.left) / r.width - .5; py = (e.clientY - r.top) / r.height - .5; });
stage.addEventListener("pointerleave", () => { px = py = null; });
function loop(ts) {
  if (!paused()) {
    draw(ts);
    const s = ts / 1000;
    const rx = px == null ? 16 + 5 * Math.sin(s * .6) : 14 - py * 22, ry = px == null ? 9 * Math.sin(s * .35) : px * 26;
    tilt.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
  } else tilt.style.transform = "rotateX(12deg)";
  requestAnimationFrame(loop);
}
if (reduced) tilt.style.transform = "rotateX(12deg)"; else requestAnimationFrame(loop);

/* ---------- tiers ---------- */
let registered = null;
function renderTiers() {
  const next = (registered ?? 0) + 1;
  $("#drop-tiers").innerHTML = TIERS.map((t) => {
    const cap = t.to ? t.to - t.from + 1 : null;
    const taken = registered == null ? null : Math.max(0, Math.min(t.to ?? Infinity, registered) - t.from + 1);
    const now = registered != null && next >= t.from && (t.to == null || next <= t.to);
    return `<li class="${now ? "now" : ""}"><span class="flag">Open now</span><div class="mult">${t.mult}&times;</div><h3>${t.name}</h3>
      <div class="range num">#${fmt(t.from)}${t.to ? " &ndash; #" + fmt(t.to) : " and up"}</div><p>${t.blurb}</p>
      ${cap ? `<div class="drop-meter"><i style="width:${taken == null ? 0 : Math.round(taken / cap * 100)}%"></i></div><small class="num">${taken == null ? "&ndash;" : fmt(taken)} of ${fmt(cap)} spots taken</small>`
            : `<small class="num">${taken == null ? "No cap" : fmt(taken) + " registered · no cap"}</small>`}</li>`;
  }).join("");
}
renderTiers();

/* ---------- lineup ---------- */
$("#drop-lineup").innerHTML = ALL.map((k) => `<a class="drop-coin${k === HUB ? " hub" : ""}" href="${k.href}">
  <span class="net-badge net-sol">Solana</span><span class="t">$${k.t}</span><span class="p">${esc(k.p)}</span><span class="m">${esc(k.m)}</span></a>`).join("");

/* ---------- reveal sections like the rest of the site ---------- */
if (!reduced && "IntersectionObserver" in window) {
  const items = [...document.querySelectorAll(".drop-tiers, .drop-lineup, .drop-reg, .drop-timeline, .drop-faq")].filter((el) => el.getBoundingClientRect().top > innerHeight);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: .1, rootMargin: "0px 0px -6% 0px" });
  items.forEach((el) => { el.classList.add("m-reveal"); io.observe(el); });
}

/* ---------- registration ---------- */
$("#drop-picks").innerHTML = ALL.map((k) => `<div class="drop-pick"><input type="checkbox" id="pk-${k.t}" value="${k.t}" checked><label for="pk-${k.t}">$${k.t}</label></div>`).join("");
const picked = () => [...document.querySelectorAll("#drop-picks input:checked")].map((i) => i.value);
const setPicks = (list) => document.querySelectorAll("#drop-picks input").forEach((i) => { i.checked = list.includes(i.value); });
$("#drop-all").onclick = () => setPicks(ALL.map((k) => k.t));
$("#drop-none").onclick = () => setPicks([]);
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const input = $("#drop-wallet"), field = $("#drop-addr-field"), hint = $("#drop-hint"), status = $("#drop-status"), submit = $("#drop-submit");
const HINT = hint.textContent;
const say = (msg, err) => { status.textContent = msg; status.classList.toggle("err", !!err); };
const short = (a) => a.slice(0, 4) + "…" + a.slice(-4);

function ticket(r, example) {
  const t = TIERS.find((x) => x.id === r.tier.id) || TIERS[2];
  return `<div class="drop-ticket${example ? " example" : ""}">
    <header><span>${example ? "Example ticket" : "Admit one"}</span><span class="num">01.01.2027 &middot; 00:00 UTC</span></header>
    <div class="body"><div><div class="drop-hint" style="margin:0">Early viewer</div><div class="no">#${String(r.position).padStart(4, "0")}</div></div>
      <dl><dt>Tier</dt><dd>${t.name} &middot; ${t.mult}&times;</dd><dt>Wallet</dt><dd style="font-family:var(--mono)">${esc(short(r.wallet))}</dd><dt>Tokens</dt><dd>${r.picks.length} of ${ALL.length}</dd></dl>
      <p class="drop-hint" style="margin:0">${example ? "Register to replace this with your own ticket." : "Your number is locked. You can change your tokens until the snapshot."}</p></div>
    <footer>${r.picks.map((p) => `<span>$${esc(p)}</span>`).join("")}</footer></div>`;
}
$("#drop-ticket").innerHTML = ticket({ position: 42, wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", picks: ALL.map((k) => k.t), tier: { id: "genesis" } }, true);

async function api(path, init) {
  const res = await fetch(API + path, { ...init, headers: { "content-type": "application/json", ...(init && init.headers) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || "Request failed"), { code: body?.error?.code, status: res.status });
  return body;
}
function showCount() {
  $("#drop-count").textContent = registered == null ? "Registration opens soon" : registered === 1 ? "1 early viewer registered" : `${fmt(registered)} early viewers registered`;
  renderTiers();
}
async function refresh() {
  try { const s = await api("/v1/drop"); registered = s.registered; if (!s.open) { submit.disabled = true; say("Registration has closed for the snapshot."); } }
  catch { registered = null; }
  showCount();
}
refresh(); setInterval(refresh, 30000);

const store = { get() { try { return localStorage.getItem("drop-wallet"); } catch { return null; } }, set(v) { try { localStorage.setItem("drop-wallet", v); } catch {} } };
const saved = store.get();
if (saved) {
  input.value = saved;
  api(`/v1/drop/wallets/${encodeURIComponent(saved)}`).then((r) => { setPicks(r.picks); $("#drop-ticket").innerHTML = ticket(r); submit.textContent = "Update my tokens"; }).catch(() => {});
}

// Read-only connect to fill in the address (no signing, no approvals).
const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null) || window.solflare;
const connect = $("#drop-connect");
if (provider?.connect) {
  connect.hidden = false;
  connect.onclick = async () => {
    try { const r = await provider.connect(); const pk = (r?.publicKey || provider.publicKey)?.toString(); if (pk) { input.value = pk; field.classList.remove("drop-bad"); hint.textContent = HINT; } }
    catch { say("Wallet connection was cancelled.", true); }
  };
}

$("#drop-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const wallet = input.value.trim(), picks = picked();
  field.classList.remove("drop-bad"); hint.textContent = HINT;
  if (!picks.length) return say("Pick at least one token.", true);
  if (!SOL_RE.test(wallet)) { field.classList.add("drop-bad"); hint.textContent = wallet ? "That isn't a Solana address. It should be 32 to 44 base58 characters." : "Add your Solana address."; return say("Check your address.", true); }
  submit.disabled = true; say("Locking your number…");
  try {
    const r = await api("/v1/drop/registrations", { method: "POST", body: JSON.stringify({ wallet, picks }) });
    store.set(wallet);
    $("#drop-ticket").innerHTML = ticket(r);
    submit.textContent = "Update my tokens";
    say(r.created ? `Locked. You're early viewer #${fmt(r.position)}.` : "Tokens updated. Your number stays the same.");
    refresh();
  } catch (err) {
    if (err.code === "invalid_wallet") { field.classList.add("drop-bad"); hint.textContent = err.message; }
    say(err.status ? err.message : "Registration isn't reachable right now. Try again in a minute.", true);
  } finally { submit.disabled = false; }
});
})();
