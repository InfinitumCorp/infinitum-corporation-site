import { randomBytes } from "node:crypto";

// Uses the existing deployment credential in place. Never exports its value.
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!apiToken || !account) throw new Error("Existing Cloudflare deployment secrets are required.");
const recipient = "theinfinitumcorp@gmail.com";
const sender = "info@infinitumcorporation.ai";
const nonce = randomBytes(5).toString("hex");
const workerName = `infinitum-mail-test-${process.env.GITHUB_RUN_ID}-${nonce}`;
const testAuthorization = randomBytes(32).toString("hex");
const subject = `Infinitum sender verification ${nonce}`;
const accountPath = `/accounts/${account}/workers`;
const scriptPath = `${accountPath}/scripts/${workerName}`;
function report(value) {
  console.log(JSON.stringify(value).replaceAll(apiToken, "[REDACTED]").replaceAll(testAuthorization, "[REDACTED]"));
}
async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiToken}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  report({
    operation: method,
    resource: path.replace(account, "[account]"),
    http_status: response.status,
    success: data.success,
    errors: (data.errors || []).map(({ code, message }) => ({ code, message })),
  });
  if (!response.ok || data.success === false) throw new Error(`Cloudflare ${method} rejected with HTTP ${response.status}`);
  return data.result;
}
const bodyText = [
  "This is an authorized sender-configuration test for Infinitum Corporation\u00ae.",
  `Requested sender: ${sender}`,
  "No prospect or campaign message was sent by this test.",
  "Please retain the received message headers for SPF, DKIM and DMARC verification.",
].join("\r\n");
const raw = [
  `From: =?UTF-8?B?${Buffer.from("Infinitum Corporation\u00ae").toString("base64")}?= <${sender}>`,
  `To: ${recipient}`,
  `Subject: ${subject}`,
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: 8bit",
  "",
  bodyText,
].join("\r\n");
const source = `
import { EmailMessage } from "cloudflare:email";
export default {
  async fetch(request, env) {
    if (request.method === "GET") return new Response("mail-self-test-ready");
    if (request.method !== "POST" ||
        request.headers.get("Authorization") !== "Bearer " + env.TEST_AUTH) {
      return new Response("Not found", { status: 404 });
    }
    try {
      await env.EMAIL.send(new EmailMessage(${JSON.stringify(sender)}, ${JSON.stringify(recipient)}, ${JSON.stringify(raw)}));
      return Response.json({ accepted: true, subject: ${JSON.stringify(subject)} });
    } catch (error) {
      return Response.json({ accepted: false, error: String(error.message || error) }, { status: 502 });
    }
  }
};`;
let created = false;
try {
  const subdomain = await api(`${accountPath}/subdomain`);
  if (!subdomain?.subdomain) throw new Error("Existing account Workers subdomain is unavailable.");
  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify({
    main_module: "worker.mjs",
    compatibility_date: "2026-11-13",
    bindings: [
      { name: "EMAIL", type: "send_email", destination_address: recipient },
      { name: "TEST_AUTH", type: "secret_text", text: testAuthorization },
    ],
  })], { type: "application/json" }));
  form.set("worker.mjs", new Blob([source], { type: "application/javascript+module" }), "worker.mjs");
  await api(scriptPath, { method: "PUT", body: form });
  created = true;
  await api(`${scriptPath}/subdomain`, { method: "POST", body: { enabled: true, previews_enabled: false } });
  const url = `https://${workerName}.${subdomain.subdomain}.workers.dev`;
  let ready = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const body = await response.text();
      report({ temporary_worker_health: {
        attempt: attempt + 1, http_status: response.status, body_preview: body.slice(0, 120),
      } });
      if (response.ok && body === "mail-self-test-ready") { ready = true; break; }
    } catch (error) {
      report({ temporary_worker_health: {
        attempt: attempt + 1, error: String(error.message || error), network_code: error.cause?.code,
      } });
    }
    if (attempt < 14) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!ready) throw new Error("Temporary Worker did not become ready; no send attempted.");
  // Exactly one send request, hard-coded to the user's own mailbox. No retries.
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${testAuthorization}` },
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  report({ sender_self_test: result, http_status: response.status, recipient_is_user_mailbox: true });
  if (!response.ok || !result.accepted) process.exitCode = 1;
} catch (error) {
  report({ sender_self_test_error: String(error.message || error) });
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      await api(scriptPath, { method: "DELETE" });
      report({ temporary_worker_removed: true, existing_services_modified: false });
    } catch (error) {
      report({ cleanup_error: String(error.message || error), temporary_worker: workerName });
      process.exitCode = 1;
    }
  }
}
