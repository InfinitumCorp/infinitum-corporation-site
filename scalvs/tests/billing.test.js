import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVENUE_URL, startUpgrade, openPortal, syncPlan, planFromEntitlements, readReturn, validEmail,
} from '../src/billing.js';

function fakeRevenue(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const path = url.slice(REVENUE_URL.length);
    calls.push({ path, method: init.method, auth: init.headers?.authorization, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = routes[path] ?? [404, { error: { code: 'not_found', message: 'nope' } }];
    return Response.json(body, { status });
  };
  return { calls, fetch };
}

test('first upgrade creates a billing org, then opens Checkout back to the app', async () => {
  const api = fakeRevenue({
    '/v1/signup': [201, { orgId: 'org_1', apiKey: 'ik_1' }],
    '/v1/subscriptions/checkout': [200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }],
  });
  const r = await startUpgrade({ billing: null, planId: 'pro', email: ' ada@x.test ', origin: 'https://scalvs.app', fetch: api.fetch });
  assert.deepEqual(r, { billing: { orgId: 'org_1', apiKey: 'ik_1', email: 'ada@x.test' }, url: 'https://checkout.stripe.com/c/cs_1' });
  assert.deepEqual(api.calls[0].body, { name: 'ada@x.test', email: 'ada@x.test', kind: 'individual' });
  assert.equal(api.calls[1].auth, 'Bearer ik_1');
  assert.deepEqual(api.calls[1].body, { planId: 'scalvs_pro', returnUrl: 'https://scalvs.app/' });

  // Business uses the per-seat team plan on a business org; an existing org is reused.
  const again = await startUpgrade({ billing: r.billing, planId: 'business', origin: 'https://scalvs.app', fetch: api.fetch });
  assert.equal(api.calls.filter((c) => c.path === '/v1/signup').length, 1);
  assert.equal(api.calls.at(-1).body.planId, 'scalvs_team');
  assert.equal(again.billing, r.billing);
});

test('asks for an email, routes government to sales and surfaces API errors', async () => {
  const api = fakeRevenue({ '/v1/subscriptions/checkout': [409, { error: { code: 'already_subscribed', message: 'Already subscribed.' } }] });
  await assert.rejects(startUpgrade({ billing: null, planId: 'pro', email: 'nope', origin: 'https://scalvs.app', fetch: api.fetch }), { code: 'email_required' });
  await assert.rejects(startUpgrade({ billing: null, planId: 'government', email: 'a@b.co', origin: 'https://scalvs.app', fetch: api.fetch }), { code: 'contact_sales' });
  await assert.rejects(startUpgrade({ billing: { apiKey: 'ik' }, planId: 'pro', origin: 'https://scalvs.app', fetch: api.fetch }),
    { code: 'already_subscribed', message: 'Already subscribed.' });
  await assert.rejects(openPortal({ billing: null, origin: 'https://scalvs.app', fetch: api.fetch }), { code: 'no_account' });
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(syncPlan({ billing: { apiKey: 'ik' }, fetch: offline }), { code: 'network' });
  assert.equal(api.calls.length, 1);
});

test('maps revenue entitlements to app plans', async () => {
  const ent = (plan, status) => ({ products: [{ product: 'scalvs', plan, status }] });
  assert.equal(planFromEntitlements(ent('scalvs_pro', 'active')), 'pro');
  assert.equal(planFromEntitlements(ent('scalvs_pro', 'trialing')), 'pro');
  assert.equal(planFromEntitlements(ent('scalvs_team', 'active')), 'business');
  assert.equal(planFromEntitlements(ent('scalvs_pro', 'canceled')), 'free');
  assert.equal(planFromEntitlements(ent('scalvs_free', 'free')), 'free');
  assert.equal(planFromEntitlements({ products: [] }), 'free');

  const api = fakeRevenue({
    '/v1/me/entitlements': [200, ent('scalvs_pro', 'active')],
    '/v1/billing/portal': [200, { url: 'https://billing.stripe.com/p/1' }],
  });
  assert.equal(await syncPlan({ billing: { apiKey: 'ik' }, fetch: api.fetch }), 'pro');
  assert.equal(await syncPlan({ billing: null, fetch: api.fetch }), 'free');
  assert.equal(await openPortal({ billing: { apiKey: 'ik' }, origin: 'https://scalvs.app', fetch: api.fetch }), 'https://billing.stripe.com/p/1');
  assert.deepEqual(api.calls.at(-1).body, { returnUrl: 'https://scalvs.app/' });
});

test('reads the Stripe return flag and validates emails', () => {
  assert.equal(readReturn('?billing=success&session_id=cs_1'), 'success');
  assert.equal(readReturn('?billing=cancelled'), 'cancelled');
  assert.equal(readReturn('?billing=<script>'), null);
  assert.equal(readReturn(''), null);
  assert.equal(validEmail('a@b.co'), true);
  assert.equal(validEmail('a@b'), false);
});
