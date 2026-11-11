import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const title = "Infinitum Corporation | AI, Blockchain and Defense Technology";
const description =
  "Infinitum Corporation builds AI-powered, blockchain-governed software, secure communications and defense systems for business, government and the military.";
const google = "qe0X3dxCvcbCKiF_kpJ2Ns6_0Ju3q33afQ8ETrUAC10";
const bing = "A305EF16C919EC2570A18A2BE02EAE6A";
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

const files = walk(root);
// google*.html is Search Console's own verification file, not a page.
const html = files.filter((path) => path.endsWith(".html") && !/[\\/]google[0-9a-f]+\.html$/.test(path) && !/[\\/]extension[\\/]/.test(path));
if (html.length === 0) fail("no HTML pages found");

for (const path of html) {
  const text = readFileSync(path, "utf8");
  if (!text.includes(`name="google-site-verification" content="${google}"`)) {
    fail(`missing Google verification: ${path}`);
  }
  if (!text.includes(`name="msvalidate.01" content="${bing}"`)) {
    fail(`missing Bing verification: ${path}`);
  }
  if (text.includes("681-0120") || text.includes("12026810120")) {
    fail(`old phone remains: ${path}`);
  }
}

const home = readFileSync(join(root, "index.html"), "utf8");
if (!home.includes(`<title>${title}</title>`)) fail("home title mismatch");
if (!home.includes(`content="${description}"`)) fail("home description mismatch");
if (description.length > 160) fail(`description is ${description.length} characters`);

const match = home.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
if (!match) fail("home JSON-LD missing");
else {
  const data = JSON.parse(match[1]);
  const org = data["@graph"].find((node) => {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return types.includes("Organization");
  });
  const types = Array.isArray(org["@type"]) ? org["@type"] : [org["@type"]];
  if (org.name !== "Infinitum Corporation") fail("organization name mismatch");
  if (org.url !== "https://infinitumcorporation.ai/") fail("organization url mismatch");
  if (org["@id"] !== "https://infinitumcorporation.ai/#organization") fail("organization @id mismatch");
  if (org.telephone !== "+1-202-729-9509") fail("organization telephone mismatch");
  if (!org.founder) fail("founder missing");
  if (org.url.includes("®") || org["@id"].includes("®") || org.sameAs.some((url) => url.includes("®")) || JSON.stringify(org.founder).includes("®")) {
    fail("registered mark leaked into a URL");
  }
}

const kept = readFileSync(join(root, "downloads/index.html"), "utf8");
if (!kept.includes("HOW IT WORKS")) fail("downloads eyebrow was rewritten");
const js = readFileSync(join(root, "assets/one-page.js"), "utf8");
if (!js.includes("cyber and security engineering")) fail("home rotation still says IT");
if (js.includes("IT and security engineering")) fail("old IT engineering line remains");
if (existsSync(join(root, "indexnow.txt")) || files.some((path) => path.toLowerCase().includes("indexnow"))) {
    fail("IndexNow file must not be added");
}

if (failures.length) {
  for (const message of failures) console.error(message);
  process.exit(1);
}

console.log(`SEO checks passed (${html.length} pages, description ${description.length} characters).`);
