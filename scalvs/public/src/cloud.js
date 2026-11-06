// Cloud sync over Supabase (Auth + PostgREST) using plain fetch.
// One JSON workspace per user in public.workspaces, protected by RLS.
// Enabled only when the deployment sets SUPABASE_URL and SUPABASE_ANON_KEY.

import { getState, replaceState, subscribe } from './store.js';

const SESSION_KEY = 'scalvs.session.v1';
const META_KEY = 'scalvs.sync.v1';
const PUSH_DELAY = 1500;

let config = null;          // { supabaseUrl, supabaseAnonKey }
let session = null;         // { access_token, refresh_token, expires_at }
const info = { configured: false, ready: false, email: null, userId: null, status: 'off', lastSyncedAt: null, error: null };
const listeners = new Set();
let pushTimer = null;
let pushing = false;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const meta = () => read(META_KEY) || {};
const setMeta = (patch) => write(META_KEY, { ...meta(), ...patch });

export const cloudInfo = () => ({ ...info });
export function onCloud(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function set(patch) { Object.assign(info, patch); listeners.forEach((fn) => fn(cloudInfo())); }

// ---------- auth redirect (runs before the router reads the hash) ----------
export function consumeAuthRedirect() {
  const hash = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error_description)=/.test(hash)) return null;
  const p = new URLSearchParams(hash);
  history.replaceState(null, '', `${location.pathname}${location.search}#/settings`);
  if (p.get('error_description')) return { error: p.get('error_description') };
  const expiresIn = Number(p.get('expires_in') || 3600);
  session = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Date.now() + expiresIn * 1000 };
  write(SESSION_KEY, session);
  return { signedIn: true };
}

// ---------- low-level requests ----------
async function authFetch(path, opts = {}) {
  const res = await fetch(`${config.supabaseUrl}${path}`, {
    ...opts,
    headers: { apikey: config.supabaseAnonKey, 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  return res;
}

async function refresh() {
  if (!session?.refresh_token) throw new Error('signed_out');
  const res = await authFetch('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) { clearSession(); throw new Error('signed_out'); }
  const d = await res.json();
  session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
  write(SESSION_KEY, session);
}

async function api(path, opts = {}, retried = false) {
  if (!session) throw new Error('signed_out');
  if (session.expires_at - Date.now() < 60_000) await refresh();
  const res = await authFetch(path, { ...opts, headers: { Authorization: `Bearer ${session.access_token}`, ...(opts.headers || {}) } });
  if (res.status === 401 && !retried) { await refresh(); return api(path, opts, true); }
  return res;
}

function clearSession() {
  session = null;
  write(SESSION_KEY, null);
  set({ email: null, userId: null, status: 'signed_out' });
}

// ---------- workspace sync ----------
async function pull() {
  const res = await api(`/rest/v1/workspaces?select=state,updated_at&user_id=eq.${encodeURIComponent(info.userId)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Couldn't load your cloud workspace (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

async function push() {
  if (!info.userId || pushing) return;
  pushing = true;
  const snapshot = getState();
  const localAt = snapshot.updatedAt || Date.now();
  set({ status: 'syncing', error: null });
  try {
    const res = await api('/rest/v1/workspaces?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: info.userId, state: snapshot, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    const [row] = await res.json();
    setMeta({ userId: info.userId, syncedLocalAt: localAt, remoteAt: row?.updated_at || null });
    set({ status: 'synced', lastSyncedAt: Date.now() });
  } catch (err) {
    set({ status: err.message === 'signed_out' ? 'signed_out' : 'error', error: err.message === 'signed_out' ? null : err.message });
  } finally {
    pushing = false;
  }
  // Changes made while we were pushing go out next.
  if (info.userId && (getState().updatedAt || 0) > localAt) schedulePush();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, PUSH_DELAY);
}

function applyRemote(row) {
  const next = structuredClone(row.state);
  // A run that was mid-flight on another device can't continue here.
  (next.runs || []).forEach((r) => {
    if (r.status === 'running') {
      r.status = 'stopped';
      r.error = 'This run was in progress on another device.';
      (r.steps || []).forEach((st) => { if (st.status === 'running' || st.status === 'queued') st.status = 'stopped'; });
    }
  });
  replaceState(next, { fromCloud: true });
  setMeta({ userId: info.userId, syncedLocalAt: getState().updatedAt || 0, remoteAt: row.updated_at });
  set({ status: 'synced', lastSyncedAt: Date.now() });
}

const summary = (s) => `${s.agents?.length || 0} agents, ${s.runs?.length || 0} runs`;
const isPristine = (s) => !s.updatedAt;

// Decide which way to sync after sign-in or when the tab regains focus.
export async function reconcile({ interactive = true } = {}) {
  if (!info.userId) return;
  set({ status: 'syncing', error: null });
  try {
    const remote = await pull();
    const local = getState();
    const m = meta();
    if (!remote) { await push(); return; }

    const sameUser = m.userId === info.userId;
    const localChanged = !sameUser || (local.updatedAt || 0) > (m.syncedLocalAt || 0);
    const remoteChanged = !sameUser || remote.updated_at !== m.remoteAt;

    if (!sameUser && isPristine(local)) return applyRemote(remote);
    if (localChanged && remoteChanged) {
      const useCloud = !interactive || confirm(
        `Your account already has a cloud workspace (${summary(remote.state)}).\n\n`
        + `OK: load the cloud workspace on this device.\nCancel: keep this browser's workspace (${summary(local)}) and upload it.`,
      );
      if (useCloud) applyRemote(remote); else await push();
    } else if (remoteChanged) {
      applyRemote(remote);
    } else if (localChanged) {
      await push();
    } else {
      set({ status: 'synced', lastSyncedAt: Date.now() });
    }
  } catch (err) {
    set({ status: err.message === 'signed_out' ? 'signed_out' : 'error', error: err.message === 'signed_out' ? null : err.message });
  }
}

async function loadUser() {
  try {
    const res = await api('/auth/v1/user');
    if (!res.ok) throw new Error('signed_out');
    const u = await res.json();
    set({ email: u.email, userId: u.id });
    await reconcile();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

// Sign-in link opened in an already-open tab: only the hash changes.
export async function handleHashSignIn() {
  const result = consumeAuthRedirect();
  if (!result) return null;
  if (result.signedIn && config) await loadUser();
  return result;
}

// Current access token for server calls (refreshed when close to expiry).
export async function accessToken() {
  if (!config || !session || !info.userId) return null;
  try {
    if (session.expires_at - Date.now() < 60_000) await refresh();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// ---------- public actions ----------
export async function initCloud() {
  try {
    const res = await fetch('api/config');
    const d = await res.json();
    if (!d.cloud) { set({ ready: true }); return; }
    config = { supabaseUrl: d.supabaseUrl, supabaseAnonKey: d.supabaseAnonKey };
  } catch {
    set({ ready: true });
    return;
  }
  set({ configured: true, status: 'signed_out' });
  session = session || read(SESSION_KEY);
  if (session) await loadUser();
  set({ ready: true });

  subscribe((_, opts) => { if (opts?.local && info.userId) schedulePush(); });
  const onFocus = () => { if (info.userId && !pushing && document.visibilityState === 'visible') reconcile({ interactive: false }); };
  document.addEventListener('visibilitychange', onFocus);
}

export async function sendSignInLink(email) {
  if (!config) throw new Error('Cloud sync is not configured.');
  const redirect = `${location.origin}${location.pathname}`;
  const res = await authFetch(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
    method: 'POST', body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.msg || d.error_description || d.message || `Couldn't send the link (${res.status})`);
  }
}

export async function syncNow() {
  clearTimeout(pushTimer);
  await reconcile();
}

export async function signOut() {
  clearTimeout(pushTimer);
  if (info.userId && (getState().updatedAt || 0) > (meta().syncedLocalAt || 0)) await push();
  try { await api('/auth/v1/logout', { method: 'POST' }); } catch { /* ignore */ }
  write(META_KEY, null);
  clearSession();
}
