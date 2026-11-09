import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const analyticsPath = join(root, "assets/analytics.js");
const scriptTag = '<script src="/assets/analytics.js" defer></script>';
const measurementIdPattern = /^G-[A-Za-z0-9]{4,20}$/;

export function measurementIdFromEnv(env = process.env) {
  const raw = env.GA_MEASUREMENT_ID;
  if (raw == null) return "";
  let id = String(raw).trim();
  if (
    (id.startsWith('"') && id.endsWith('"')) ||
    (id.startsWith("'") && id.endsWith("'"))
  ) {
    id = id.slice(1, -1).trim();
  }
  if (id === "") return "";
  if (!measurementIdPattern.test(id)) {
    throw new Error(
      "GA_MEASUREMENT_ID must be a GA4 measurement ID (G- followed by 4-20 letters or digits). gtag was not added.",
    );
  }
  return id;
}

export function analyticsSource(measurementId) {
  if (!measurementIdPattern.test(measurementId)) {
    throw new Error("refusing to write analytics.js without a valid measurement ID");
  }
  const idLiteral = JSON.stringify(measurementId);
  return `(function () {
  "use strict";
  var measurementId = ${idLiteral};
  if (!${measurementIdPattern}.test(measurementId)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted"
  });
  gtag("js", new Date());
  gtag("config", measurementId);

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
  document.head.appendChild(script);
})();
`;
}

export function injectHtml(html) {
  if (html.includes(scriptTag)) return html;
  const marker = "</head>";
  const index = html.indexOf(marker);
  if (index === -1) throw new Error("HTML page is missing </head>");
  if (html.indexOf(marker, index + marker.length) !== -1) {
    throw new Error("HTML page has more than one </head>");
  }
  return html.slice(0, index) + scriptTag + html.slice(index);
}

export function revertHtml(html) {
  if (!html.includes(scriptTag)) return html;
  return html.split(scriptTag).join("");
}

function walkHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkHtml(path, acc);
    else if (name.endsWith(".html")) acc.push(path);
  }
  return acc;
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (current !== next) writeFileSync(path, next);
}

export function selfCheck() {
  const sample = "<head><title>T</title><!-- seo --></head><body></body>";
  const injected = injectHtml(sample);
  if (injected !== `<head><title>T</title><!-- seo -->${scriptTag}</head><body></body>`) {
    throw new Error("injectHtml self-check failed");
  }
  if (injectHtml(injected) !== injected) throw new Error("injectHtml is not idempotent");
  if (revertHtml(injected) !== sample) throw new Error("revertHtml self-check failed");
  if (revertHtml(sample) !== sample) throw new Error("revertHtml changed a page without the tag");

  if (measurementIdFromEnv({}) !== "") throw new Error("missing id should be empty");
  if (measurementIdFromEnv({ GA_MEASUREMENT_ID: "   " }) !== "") {
    throw new Error("blank id should be empty");
  }
  if (measurementIdFromEnv({ GA_MEASUREMENT_ID: "  'G-AB12cd'  " }) !== "G-AB12cd") {
    throw new Error("quoted measurement id was not accepted");
  }
  let rejected = false;
  try {
    measurementIdFromEnv({ GA_MEASUREMENT_ID: "UA-12345" });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("invalid measurement id was accepted");

  const source = analyticsSource("G-AB12cd");
  if (!source.includes('ad_storage: "denied"')) throw new Error("ad_storage default missing");
  if (!source.includes('ad_user_data: "denied"')) throw new Error("ad_user_data default missing");
  if (!source.includes('ad_personalization: "denied"')) throw new Error("ad_personalization default missing");
  if (!source.includes('analytics_storage: "granted"')) throw new Error("analytics_storage default missing");
  if (!source.includes("https://www.googletagmanager.com/gtag/js?id=")) {
    throw new Error("gtag url missing");
  }
  if (!source.includes('"G-AB12cd"')) throw new Error("measurement id was not embedded");
  if (source.includes("UA-") || source.includes("<script")) throw new Error("analytics source is unsafe");
}

function apply(id) {
  const pages = walkHtml(root);
  if (pages.length === 0) throw new Error("no HTML pages found");
  if (!id) {
    let restored = 0;
    for (const path of pages) {
      const current = readFileSync(path, "utf8");
      const next = revertHtml(current);
      if (current === next) continue;
      writeFileSync(path, next);
      restored += 1;
    }
    if (existsSync(analyticsPath)) unlinkSync(analyticsPath);
    if (restored === 0) {
      console.log(`GA_MEASUREMENT_ID unset; gtag will not load (${pages.length} pages left unchanged).`);
    } else {
      console.log(`GA_MEASUREMENT_ID unset; removed the GA loader from ${restored} pages.`);
    }
    return;
  }
  writeFileSync(analyticsPath, analyticsSource(id));
  for (const path of pages) writeIfChanged(path, injectHtml(readFileSync(path, "utf8")));
  console.log(`GA4 enabled for ${id} on ${pages.length} pages.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    selfCheck();
    apply(measurementIdFromEnv(process.env));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
