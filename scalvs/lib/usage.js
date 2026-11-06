// Server-side usage limits for live agent runs.
//
// Each live agent step counts as one run against a daily (UTC) quota:
//   - signed-in users (verified Supabase token): SCALVS_DAILY_LIMIT_USER, default 100
//   - anonymous visitors, by hashed IP:           SCALVS_DAILY_LIMIT_ANON, default 10
//     (SCALVS_REQUIRE_SIGNIN=true turns anonymous live runs off entirely)
//   - everyone together:                          SCALVS_DAILY_LIMIT_GLOBAL, default 1000 ("off" disables)
//
// Counts live in the Cloudflare KV namespace bound as SCALVS_USAGE. Without
// that binding they fall back to per-instance memory, which is best effort
// only. KV is eventually consistent, so these are soft caps that can be
// exceeded slightly under bursts; they exist to stop runaway spend.

const memory = new Map();
const tokenCache = new Map(); // tokenHash -> { who, until }
const TOKEN_TTL = 60_000;

function store(env) {
  const kv = env.SCALVS_USAGE;
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') {
    return {
      durable: true,
      get: async (k) => Number(await kv.get(k)) || 0,
      put: (k, v) => kv.put(k, String(Math.max(0, v)), { expirationTtl: 2 * 86_400 }),
    };
  }
  return {
    durable: false,
    get: async (k) => memory.get(k) || 0,
    put: async (k, v) => { memory.set(k, Math.max(0, v)); },
  };
}

const day = () => new Date().toISOString().slice(0, 10);
export function resetAt() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const num = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Who is calling: a verified Supabase user, or an anonymous visitor (hashed IP).
export async function identify(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const key = await sha256(token);
    const cached = tokenCache.get(key);
    if (cached && cached.until > Date.now()) return cached.who;
    try {
      const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const user = await res.json();
        if (user?.id) {
          const who = { kind: 'user', id: user.id };
          tokenCache.set(key, { who, until: Date.now() + TOKEN_TTL });
          if (tokenCache.size > 5000) tokenCache.clear();
          return who;
        }
      }
    } catch { /* treat as anonymous */ }
  }
  const ip = request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'local';
  return { kind: 'anon', id: await sha256(`ip:${ip}`) };
}

export function limitFor(who, env) {
  if (who.kind === 'user') return num(env.SCALVS_DAILY_LIMIT_USER, 100);
  if (String(env.SCALVS_REQUIRE_SIGNIN).toLowerCase() === 'true') return 0;
  return num(env.SCALVS_DAILY_LIMIT_ANON, 10);
}

function globalLimit(env) {
  if (String(env.SCALVS_DAILY_LIMIT_GLOBAL).toLowerCase() === 'off') return Infinity;
  return num(env.SCALVS_DAILY_LIMIT_GLOBAL, 1000);
}

// Reads (and with consume: true, takes one run from) the caller's quota.
// Returns { ok, code?, error?, usage, refund() }.
export async function checkUsage(request, env, { consume = false } = {}) {
  const s = store(env);
  const who = await identify(request, env);
  const limit = limitFor(who, env);
  const d = day();
  const userKey = `u:${d}:${who.kind}:${who.id}`;
  const globalKey = `g:${d}`;
  const [used, globalUsed] = await Promise.all([s.get(userKey), s.get(globalKey)]);
  const gLimit = globalLimit(env);

  const usage = (u) => ({
    kind: who.kind, used: u, limit, remaining: Math.max(0, limit - u), resetAt: resetAt(), durable: s.durable,
  });

  if (limit === 0 && who.kind === 'anon') {
    return { ok: false, status: 401, code: 'signin_required', error: 'Sign in (Settings → Cloud sync) to run live agents.', usage: usage(used) };
  }
  if (used >= limit) {
    return { ok: false, status: 429, code: 'limit', error: `You've used all ${limit} live agent runs for today. The limit resets at midnight UTC.`, usage: usage(used) };
  }
  if (globalUsed >= gLimit) {
    return { ok: false, status: 429, code: 'busy', error: 'SCALVS.ai has reached its live-run limit for today. Please try again tomorrow.', usage: usage(used) };
  }
  if (!consume) return { ok: true, usage: usage(used), refund: async () => {} };

  await Promise.all([s.put(userKey, used + 1), s.put(globalKey, globalUsed + 1)]);
  let refunded = false;
  return {
    ok: true,
    usage: usage(used + 1),
    // Give the run back when the model call itself failed.
    refund: async () => {
      if (refunded) return;
      refunded = true;
      const [u, g] = await Promise.all([s.get(userKey), s.get(globalKey)]);
      await Promise.all([s.put(userKey, u - 1), s.put(globalKey, g - 1)]);
    },
  };
}

export function usageHeaders(usage) {
  return {
    'x-scalvs-limit': String(usage.limit),
    'x-scalvs-remaining': String(usage.remaining),
    'x-scalvs-reset': usage.resetAt,
  };
}
