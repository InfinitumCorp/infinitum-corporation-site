import { getState, update, subscribe, plan } from './store.js';
import { checkLive } from './runner.js';
import * as command from './views/command.js';
import * as studio from './views/studio.js';
import * as connect from './views/connect.js';
import * as earnings from './views/earnings.js';
import * as settings from './views/settings.js';

const ROUTES = { command, studio, connect, earnings, settings };
const main = document.getElementById('main');
let current = null;
let root = null;

import { consumeAuthRedirect, handleHashSignIn, initCloud, onCloud, cloudInfo } from './cloud.js';
import { toast } from './ui.js';
import { startScheduler } from './scheduler.js';

const authResult = consumeAuthRedirect();

// Runs interrupted by a page reload can't resume.
if (getState().runs.some((r) => r.status === 'running')) update((st) => {
  st.runs.forEach((r) => {
    if (r.status === 'running') {
      r.status = 'failed';
      r.error = 'Interrupted by a page reload.';
      r.steps.forEach((s) => { if (s.status === 'running' || s.status === 'queued') s.status = 'failed'; });
    }
  });
});

function routeName() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[name] ? name : 'command';
}

function renderView() {
  // Keep focus and caret in text fields across re-renders.
  const active = document.activeElement;
  const key = active && root?.contains(active) && active.name
    ? (active.form?.dataset.run ? `form[data-run="${active.form.dataset.run}"] [name="${active.name}"]` : `[name="${active.name}"]`)
    : null;
  const sel = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  root.innerHTML = ROUTES[current].render();

  if (key) {
    const el = root.querySelector(key);
    if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch { /* noop */ } }
  }
  renderNav();
}

function renderNav() {
  const s = getState();
  const pending = s.runs.filter((r) => r.status === 'awaiting_approval').length;
  document.querySelectorAll('[data-route]').forEach((a) => {
    const on = a.dataset.route === current;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const badge = document.getElementById('approvals-badge');
  badge.textContent = pending;
  badge.hidden = pending === 0;
  document.getElementById('plan-label').textContent = `${plan().label} plan`;
  const c = cloudInfo();
  document.getElementById('account-name').textContent = c.email || 'Infinitum';
  const sync = document.getElementById('sync-dot');
  sync.hidden = !c.configured || !c.email;
  sync.className = `sync-dot ${c.status}`;
  sync.title = { synced: 'Synced', syncing: 'Syncing…', error: c.error || 'Sync error' }[c.status] || '';
  document.getElementById('sclv-label').textContent = `${s.wallet.sclv} $SCLV`;
}

function navigate() {
  const next = routeName();
  if (next !== current || !root) {
    current = next;
    root = document.createElement('div');
    root.className = `view view-${current}`;
    main.replaceChildren(root);
    ROUTES[current].bind(root, renderView);
    window.scrollTo(0, 0);
    document.body.classList.remove('nav-open');
  }
  renderView();
}

window.addEventListener('hashchange', async () => {
  if (/(^#|&)(access_token|error_description)=/.test(location.hash)) {
    const r = await handleHashSignIn();
    if (r?.error) toast(r.error);
    else if (cloudInfo().email) toast(`Signed in as ${cloudInfo().email}`);
  }
  navigate();
});
subscribe(() => renderView());

document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.getElementById('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

navigate();
checkLive().then(() => renderView());
let lastEmail = null;
onCloud((c) => {
  // Signing in or out changes which quota applies.
  if (c.ready && c.email !== lastEmail) { lastEmail = c.email; checkLive().then(() => renderView()); }
  renderView();
});
initCloud().then(() => {
  startScheduler();
  if (authResult?.error) toast(authResult.error);
  else if (authResult?.signedIn && cloudInfo().email) toast(`Signed in as ${cloudInfo().email}`);
});
