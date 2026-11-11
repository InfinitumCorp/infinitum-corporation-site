// Interface language for large static sites: detected from the browser, remembered
// when chosen from the menu, English fallback. Only the chosen language's catalog is
// fetched (same origin, committed JSON, no model calls), so pages stay light.
// Catalogs are generated with infinitum-nexus packages/i18n (extract.ts + translate.ts).
// i18n.js and i18n.css are vendored unchanged from that package.
import { startI18n, detectLocale, DEFAULT_STORAGE_KEY } from './i18n.js';
import languages from './languages.js';

const base = new URL('.', import.meta.url);
const supported = ['en', ...languages];
const lang = detectLocale({ supported, fallback: 'en', storageKey: DEFAULT_STORAGE_KEY });
const catalogs = Object.fromEntries(supported.map((c) => [c, {}]));
if (lang !== 'en') {
  try {
    catalogs[lang] = await (await fetch(new URL(`locales/${lang}.json`, base))).json();
  } catch {
    // Offline or blocked: stay in English.
  }
}

let slot = document.getElementById('lang-switch');
if (!slot) {
  slot = document.createElement('div');
  slot.className = 'lang-float';
  document.body.append(slot);
}
export const i18n = startI18n({ catalogs, switcher: slot, supported });
export const t = i18n.t;
// Another language needs its catalog: reload, and the choice (already stored) applies.
i18n.subscribe(() => { if (i18n.locale !== lang) location.reload(); });
