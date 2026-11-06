import { getState, plan } from '../store.js';
import { TEMPLATES, REWARD_RULES } from '../data.js';
import { startRun, approve, reject, stopRun, followUp, clearFinished, isLive, hasFiles, getUsage } from '../runner.js';
import { esc, md, ago, fmt, statusLabel, toast, until } from '../ui.js';
import { nextRunAt, runStandingTask } from '../scheduler.js';

let target = null;   // "agent:<id>" | "team:<id>"
let taskDraft = '';
const expanded = new Set();

function resolveTarget() {
  const s = getState();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('agent')) target = `agent:${q.get('agent')}`;
  if (q.get('team')) target = `team:${q.get('team')}`;
  const valid = (t) => {
    if (!t) return false;
    const [kind, id] = t.split(':');
    return kind === 'agent' ? s.agents.some((a) => a.id === id) : s.teams.some((x) => x.id === id);
  };
  if (!valid(target)) target = s.agents[0] ? `agent:${s.agents[0].id}` : null;
}

function exampleFor() {
  if (!target) return 'Describe an outcome…';
  const s = getState();
  const [kind, id] = target.split(':');
  const agent = kind === 'agent' ? s.agents.find((a) => a.id === id) : s.agents.find((a) => a.id === s.teams.find((t) => t.id === id)?.agentIds[0]);
  const tpl = TEMPLATES.find((t) => t.id === agent?.template);
  return tpl ? `e.g. ${tpl.example}` : 'Describe an outcome…';
}

const followDrafts = new Map(); // runId -> text
let pendingFiles = [];          // [{ name, type, size, text? , data? }]

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|ya?ml|log|js|ts|py|sql|rtf)$/i;
const BINARY = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_FILES = 5;
const MAX_TEXT = 200_000;
const MAX_BINARY = 3_000_000;
const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function addFiles(list) {
  for (const file of list) {
    if (pendingFiles.length >= MAX_FILES) { toast(`Up to ${MAX_FILES} files per task`); break; }
    try {
      if (BINARY.includes(file.type)) {
        const used = pendingFiles.filter((f) => f.data).reduce((n, f) => n + f.size, 0);
        if (used + file.size > MAX_BINARY) { toast(`${file.name} is too large (3 MB total for PDFs and images)`); continue; }
        pendingFiles.push({ name: file.name, type: file.type, size: file.size, data: await toBase64(file) });
      } else if (file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXT.test(file.name)) {
        let text = await file.text();
        if (text.length > MAX_TEXT) { text = text.slice(0, MAX_TEXT); toast(`${file.name} was trimmed to the first 200k characters`); }
        pendingFiles.push({ name: file.name, type: file.type || 'text/plain', size: file.size, text });
      } else {
        toast(`${file.name}: use text, PDF or image files`);
      }
    } catch {
      toast(`Couldn't read ${file.name}`);
    }
  }
}

const fileChips = (files, removable) => (files?.length ? `<div class="file-chips">${files.map((f, i) => `
  <span class="file-chip"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M7 3h7l5 5v13H7z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
  ${esc(f.name)} <span class="muted">${kb(f.size || 0)}</span>
  ${removable ? `<button type="button" class="chip-x" data-action="remove-file" data-index="${i}" aria-label="Remove ${esc(f.name)}">×</button>` : ''}</span>`).join('')}</div>` : '');
const collapsed = new Set(); // newest run is open unless the user closed it

const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function modeLabel(live) {
  if (live === false) return 'Demo mode';
  if (live !== true) return '';
  const u = getUsage();
  if (!u) return 'Live · Claude';
  if (u.blocked?.code === 'signin_required') return 'Live · <a href="#/settings">sign in</a> to run';
  if (u.blocked?.code === 'busy') return 'Live · paused for today';
  return `Live · ${u.remaining} run${u.remaining === 1 ? '' : 's'} left today`;
}

const webSources = (st) => (st.sources || []).filter((x) => /^https?:\/\//i.test(x.url || ''));

function followForm(r) {
  const s = getState();
  const ids = [...new Set(r.steps.map((st) => st.agentId))].filter((id) => s.agents.some((a) => a.id === id));
  if (!ids.length) return '';
  const last = [...r.steps].reverse().find((st) => st.output)?.agentId || ids[0];
  const names = Object.fromEntries(s.agents.map((a) => [a.id, a.name]));
  return `
    <form class="follow-form" data-run="${r.id}">
      <input name="follow" maxlength="4000" autocomplete="off" placeholder="${r.files?.length && !hasFiles(r.id) ? 'Follow up… (attached files aren’t kept after a reload)' : 'Follow up…'}" aria-label="Follow-up for this run" value="${esc(followDrafts.get(r.id) || '')}">
      ${ids.length > 1 ? `<select name="agent" class="pill-select" aria-label="Agent">${ids.map((id) => `<option value="${id}" ${id === last ? 'selected' : ''}>${esc(names[id])}</option>`).join('')}</select>` : `<input type="hidden" name="agent" value="${ids[0]}">`}
      <button class="send sm-send" type="submit" aria-label="Send follow-up">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </form>`;
}

function runCard(r, index) {
  const open = (index === 0 && !collapsed.has(r.id)) || expanded.has(r.id) || r.status === 'awaiting_approval' || r.status === 'running';
  const needs = r.status === 'awaiting_approval';
  return `
  <article class="run ${esc(r.status)}">
    <button class="run-head" data-action="toggle-run" data-id="${r.id}" aria-expanded="${open}">
      <span class="status-pill ${esc(r.status)}">${statusLabel[r.status]}${r.verified ? ' · verified' : ''}</span>
      <span class="run-title">${esc(r.title)}</span>
      <span class="muted small">${ago(r.createdAt)}</span>
    </button>
    ${open ? `
    <div class="run-body">
      <p class="run-task">${esc(r.task)}</p>
      ${r.files?.length ? `<div class="run-files">${fileChips(r.files, false)}</div>` : ''}
      <ol class="steps">
        ${r.steps.map((st, i) => `
        ${st.prompt ? `<li class="run-task follow">${esc(st.prompt)}</li>` : ''}
        <li class="step ${esc(st.status)}">
          <div class="step-head"><strong>${esc(st.name)}</strong>
            <span class="muted small">${statusLabel[st.status]}${st.mode === 'demo' ? ' · demo' : st.mode === 'live' ? ' · live' : ''}</span>
            ${st.output && st.status !== 'running' ? `<button class="copy" data-action="copy" data-id="${r.id}" data-step="${i}" aria-label="Copy ${esc(st.name)}'s output">Copy</button>` : ''}</div>
          ${st.status === 'running' && st.activity ? `<p class="activity small">${esc(st.activity)}</p>` : ''}
          ${st.status === 'running' && !st.output ? '<div class="typing" aria-label="Working"><span></span><span></span><span></span></div>' : ''}
          ${st.output ? `<div class="prose${st.status === 'running' ? ' streaming' : ''}" ${st.status === 'running' ? 'aria-live="polite" aria-busy="true"' : ''}>${md(st.output)}</div>` : ''}
          ${webSources(st).length ? `<details class="sources"><summary class="small">${webSources(st).length} source${webSources(st).length > 1 ? 's' : ''}</summary><ol>${webSources(st).map((src) => `<li><a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener noreferrer">${esc(src.title || src.url)}</a> <span class="muted">${esc(host(src.url))}</span></li>`).join('')}</ol></details>` : ''}
        </li>`).join('')}
      </ol>
      ${r.error ? `<p class="error small">${esc(r.error)}</p>` : ''}
      ${needs ? `<div class="approval row gap"><span class="small">This agent asks for your approval before continuing.</span>
        <button class="btn primary sm" data-action="approve" data-id="${r.id}">Approve</button>
        <button class="btn sm" data-action="reject" data-id="${r.id}">Reject</button></div>` : ''}
      ${['completed', 'failed', 'rejected', 'stopped'].includes(r.status) ? followForm(r) : ''}
      ${r.status === 'running' ? `<div class="row"><button class="btn sm" data-action="stop" data-id="${r.id}">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg> Stop</button></div>` : ''}
    </div>` : ''}
  </article>`;
}

export function render() {
  resolveTarget();
  const s = getState();
  const p = plan();
  const used = s.wallet.creditsUsed;
  const pct = Math.min(100, (used / p.credits) * 100);
  const approvals = s.runs.filter((r) => r.status === 'awaiting_approval');
  const active = s.runs.filter((r) => r.status === 'running').length;
  const scheduled = s.agents.filter((a) => a.schedule !== 'none');
  const live = isLive();

  return `
  <section class="hero">
    <h1 class="hero-title">What should your agents do?</h1>
    <form id="run-form" class="composer">
      ${fileChips(pendingFiles, true)}
      <textarea name="task" rows="2" maxlength="6000" required placeholder="${esc(exampleFor())}" aria-label="Task">${esc(taskDraft)}</textarea>
      <div class="composer-bar">
        <label class="attach" title="Attach files (text, PDF, images)">
          <input type="file" multiple class="sr-only" data-action="attach" accept=".txt,.md,.markdown,.csv,.tsv,.json,.xml,.html,.yaml,.yml,.log,.js,.ts,.py,.sql,text/*,application/pdf,image/png,image/jpeg,image/gif,image/webp" aria-label="Attach files">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </label>
        <select name="target" aria-label="Agent or team" class="pill-select">
          ${s.agents.length ? `<optgroup label="Agents">${s.agents.map((a) => `<option value="agent:${a.id}" ${target === `agent:${a.id}` ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` : ''}
          ${s.teams.length ? `<optgroup label="Teams">${s.teams.map((t) => `<option value="team:${t.id}" ${target === `team:${t.id}` ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : ''}
        </select>
        <span class="muted small mode ${getUsage()?.blocked || getUsage()?.remaining === 0 ? 'warn-text' : ''}">${modeLabel(live)}</span>
        <button class="send" type="submit" aria-label="Run task" ${s.agents.length ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </form>
    ${s.agents.length ? '' : '<p class="small muted center">Create an agent in <a href="#/studio">Agent Studio</a> first.</p>'}
  </section>

  <div class="stats">
    <div class="stat"><span class="stat-n">${active}</span><span class="muted small">Running</span></div>
    <div class="stat"><span class="stat-n">${approvals.length}</span><span class="muted small">Awaiting approval</span></div>
    <div class="stat"><span class="stat-n">${scheduled.length}</span><span class="muted small">Scheduled</span></div>
    <div class="stat wide">
      <div class="row between"><span class="muted small">AI credits this month</span><span class="small">${fmt(used)} / ${fmt(p.credits)}</span></div>
      <div class="meter" role="progressbar" aria-valuenow="${used}" aria-valuemin="0" aria-valuemax="${p.credits}"><span style="width:${pct}%"></span></div>
      <span class="muted small">${REWARD_RULES.creditsPerRun} credits per agent step · ${p.label} plan</span>
    </div>
  </div>

  <section>
    <div class="row between section-row"><h2>Activity</h2>
      ${s.runs.some((r) => ['completed', 'failed', 'rejected', 'stopped'].includes(r.status)) ? '<button class="btn ghost sm" data-action="clear">Clear finished</button>' : ''}</div>
    <div class="runs">${s.runs.map((r, i) => runCard(r, i)).join('') || '<p class="muted small">No runs yet. Give an agent a task above.</p>'}</div>
  </section>

  ${scheduled.length ? `
  <section class="panel">
    <div class="panel-head"><h2>Schedules</h2><span class="tag">run while SCALVS.ai is open</span></div>
    <ul class="list">${scheduled.map((a) => {
      const next = nextRunAt(a);
      return `
      <li class="list-row"><div class="list-main"><div>
        <strong>${esc(a.name)}</strong> <span class="muted small">· ${esc(a.schedule)}</span>
        <p class="muted small">${a.standingTask ? esc(a.standingTask) : 'No standing task yet. Add one in Agent Studio.'}</p>
        ${a.standingTask ? `<p class="small">${next ? `Next run ${until(next)}` : ''}${a.lastScheduledAt ? ` · last ${ago(a.lastScheduledAt)}` : ''}</p>` : ''}
        ${a.lastScheduleError ? `<p class="small error">Last run skipped: ${esc(a.lastScheduleError)}</p>` : ''}
      </div></div>
      ${a.standingTask ? `<button class="btn sm" data-action="run-standing" data-id="${a.id}">Run now</button>` : `<a class="btn sm" href="#/studio">Set up</a>`}</li>`;
    }).join('')}</ul>
  </section>` : ''}`;
}

export function bind(root, rerender) {
  root.addEventListener('dragover', (e) => {
    const c = e.target.closest('.composer');
    if (!c || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    c.classList.add('drop');
  });
  root.addEventListener('dragleave', (e) => { e.target.closest('.composer')?.classList.remove('drop'); });
  root.addEventListener('drop', async (e) => {
    const c = e.target.closest('.composer');
    if (!c) return;
    e.preventDefault();
    c.classList.remove('drop');
    await addFiles([...(e.dataTransfer?.files || [])]);
    rerender();
  });
  root.addEventListener('input', (e) => {
    if (e.target.name === 'follow') followDrafts.set(e.target.form.dataset.run, e.target.value);
    if (e.target.name === 'task') {
      taskDraft = e.target.value;
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.dataset.action === 'attach') {
      await addFiles([...e.target.files]);
      e.target.value = '';
      rerender();
      return;
    }
    if (e.target.name === 'target') { target = e.target.value; history.replaceState(null, '', '#/command'); rerender(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.name === 'task' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.classList.contains('follow-form')) {
      e.preventDefault();
      const fd = new FormData(e.target);
      const text = String(fd.get('follow') || '').trim();
      if (!text) return;
      const runId = e.target.dataset.run;
      const res = followUp(runId, text, String(fd.get('agent')));
      if (res.error) { toast(res.error); return; }
      followDrafts.delete(runId);
      return;
    }
    if (e.target.id !== 'run-form') return;
    e.preventDefault();
    const fd = new FormData(e.target);
    const task = String(fd.get('task')).trim();
    if (!task) return;
    const s = getState();
    const [kind, id] = String(fd.get('target')).split(':');
    const agentIds = kind === 'team' ? (s.teams.find((t) => t.id === id)?.agentIds || []) : [id];
    const title = kind === 'team' ? s.teams.find((t) => t.id === id)?.name : undefined;
    const res = startRun({ task, agentIds, title, attachments: pendingFiles });
    if (res.error) { toast(res.error); return; }
    taskDraft = '';
    pendingFiles = [];
    rerender();
  });
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'toggle-run') {
      const isOpen = el.getAttribute('aria-expanded') === 'true';
      if (isOpen) { expanded.delete(id); collapsed.add(id); } else { collapsed.delete(id); expanded.add(id); }
      rerender();
    }
    else if (action === 'approve') approve(id);
    else if (action === 'reject') reject(id);
    else if (action === 'clear') clearFinished();
    else if (action === 'run-standing') { const res = runStandingTask(id); if (res.error) toast(res.error); else window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (action === 'remove-file') { pendingFiles.splice(Number(el.dataset.index), 1); rerender(); }
    else if (action === 'stop') { stopRun(id); toast('Run stopped'); }
    else if (action === 'copy') {
      const run = getState().runs.find((x) => x.id === id);
      const text = run?.steps[Number(el.dataset.step)]?.output || '';
      navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
    }
  });
}
