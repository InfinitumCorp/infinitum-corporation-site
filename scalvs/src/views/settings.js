import { getState, replaceState, reset, plan } from '../store.js';
import { isLive } from '../runner.js';
import { esc, toast } from '../ui.js';

const EXPORT_VERSION = 1;

export function render() {
  const s = getState();
  const live = isLive();
  return `
  <header class="page-head">
    <p class="eyebrow">Settings</p>
    <h1>Workspace</h1>
    <p class="lede">Your agents, teams, runs, Context Vault and wallet live in this browser.</p>
  </header>

  <section class="panel">
    <div class="panel-head"><h2>Status</h2></div>
    <ul class="list">
      <li class="list-row"><div class="list-main"><span class="dot ${live ? 'on' : ''}" aria-hidden="true"></span><div><strong>Agent runtime</strong><p class="muted small">${live ? 'Live · Claude via /api/run' : 'Demo mode · simulated output (set ANTHROPIC_API_KEY on the deployment for live agents)'}</p></div></div></li>
      <li class="list-row"><div class="list-main"><span class="dot on" aria-hidden="true"></span><div><strong>Workspace</strong><p class="muted small">${s.agents.length} agents · ${s.teams.length} teams · ${s.runs.length} runs · ${s.vault.length} vault entries · ${esc(plan().label)} plan</p></div></div></li>
    </ul>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Move or back up your workspace</h2></div>
    <p class="small muted">Export everything to a file, then import it in another browser or device. Importing replaces the current workspace.</p>
    <div class="row gap">
      <button class="btn primary" data-action="export">Export workspace</button>
      <label class="btn file-btn">Import workspace<input type="file" accept="application/json,.json" data-action="import" class="sr-only"></label>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Reset</h2></div>
    <p class="small muted">Delete everything in this browser and start again with the two sample agents.</p>
    <button class="btn" data-action="reset">Reset workspace</button>
  </section>`;
}

// Basic shape check so a wrong file can't break the app.
export function validateImport(data) {
  const state = data && data.app === 'scalvs.ai' ? data.state : data;
  if (!state || typeof state !== 'object') return { error: 'That file is not a SCALVS.ai workspace.' };
  const arrays = ['agents', 'teams', 'runs', 'vault'];
  for (const k of arrays) if (!Array.isArray(state[k])) return { error: `Missing “${k}” in the workspace file.` };
  if (!state.wallet || typeof state.wallet !== 'object') return { error: 'Missing wallet in the workspace file.' };
  const okAgent = (a) => a && typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.tools);
  if (!state.agents.every(okAgent)) return { error: 'One of the agents in that file is malformed.' };
  return { state };
}

export function bind(root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'export') {
      const payload = { app: 'scalvs.ai', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), state: getState() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scalvs-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Workspace exported');
    } else if (el.dataset.action === 'reset') {
      if (confirm('Reset all workspace data in this browser?')) { reset(); toast('Workspace reset'); }
    }
  });

  root.addEventListener('change', async (e) => {
    if (e.target.dataset.action !== 'import') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON.'); return; }
    const { state, error } = validateImport(data);
    if (error) { toast(error); return; }
    if (!confirm(`Replace this workspace with “${file.name}”? (${state.agents.length} agents, ${state.runs.length} runs)`)) return;
    // Runs that were mid-flight when exported can't resume here.
    state.runs.forEach((r) => {
      if (r.status === 'running') {
        r.status = 'stopped';
        r.steps.forEach((st) => { if (st.status === 'running' || st.status === 'queued') st.status = 'stopped'; });
      }
    });
    replaceState(state);
    toast('Workspace imported');
  });
}
