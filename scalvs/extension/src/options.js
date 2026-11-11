import { ApiError, DEFAULT_BASE, normaliseBase, originPattern, status } from "./api.js";

const $ = (id) => document.getElementById(id);
const say = (text) => ($("result").textContent = text);

$("base").value = (await chrome.storage.local.get("base")).base || DEFAULT_BASE;
$("base").placeholder = DEFAULT_BASE;

$("base-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let base;
  try {
    base = normaliseBase($("base").value);
  } catch (err) {
    return say(err.message);
  }
  if (base !== DEFAULT_BASE) {
    // Other deployments need a host permission, asked for inside this click.
    const granted = await chrome.permissions.request({ origins: [originPattern(base)] }).catch(() => false);
    if (!granted) return say(`Chrome did not grant access to ${new URL(base).host}; nothing was saved.`);
  }
  $("base").value = base;
  await chrome.storage.local.set({ base });
  say("Saved.");
});

$("reset").addEventListener("click", async () => {
  $("base").value = DEFAULT_BASE;
  await chrome.storage.local.remove("base");
  say("Using the default address.");
});

$("check").addEventListener("click", async () => {
  say("Checking…");
  try {
    const { live } = await status({ base: normaliseBase($("base").value) });
    say(live ? "Connected: SCALVS.ai is live." : "Connected, but SCALVS.ai is in demo mode (no model configured on the server).");
  } catch (err) {
    say(err instanceof ApiError ? err.message : String(err));
  }
});
