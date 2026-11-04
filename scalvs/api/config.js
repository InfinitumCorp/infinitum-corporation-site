// Public client configuration. The Supabase anon key is designed to be public;
// row level security (supabase/migrations) keeps each workspace private.
function json(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function GET() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return json({ cloud: false });
  return json({ cloud: true, supabaseUrl: url.replace(/\/$/, ''), supabaseAnonKey: anonKey });
}
