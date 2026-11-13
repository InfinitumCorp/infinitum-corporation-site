// Builds dist/ for the Cloudflare Worker that serves infinitumcorporation.ai.
// Copies the site, then turns vercel.json's redirects and headers into the
// _redirects and _headers files that Workers static assets read.
// Run: node scripts/build-cloudflare.mjs   (then: npx wrangler deploy)
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const skip = new Set([".git", ".github", "node_modules", "dist", ".wrangler", "wrangler.jsonc"]);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const name of readdirSync(root)) {
  if (skip.has(name)) continue;
  cpSync(join(root, name), join(dist, name), {
    recursive: true,
    filter: (src) => !src.replace(/\\/g, "/").split("/").some((part) => part === "node_modules"),
  });
}

const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const pattern = (source) => {
  const out = source.replace("(.*)", "*").replace(/\/:path\*$/, "/*");
  if (out.includes(":")) throw new Error(`unsupported pattern: ${source}`);
  return out;
};

const redirects = [];
for (const rule of config.redirects ?? []) {
  if (rule.has) continue; // host rules only applied on Vercel
  const status = rule.permanent ? 308 : 307;
  redirects.push(`${pattern(rule.source)} ${rule.destination.replace(":path*", ":splat")} ${status}`);
}
writeFileSync(join(dist, "_redirects"), redirects.join("\n") + "\n");

const headers = [];
for (const block of config.headers ?? []) {
  headers.push(pattern(block.source));
  for (const { key, value } of block.headers) headers.push(`  ${key}: ${value}`);
}
writeFileSync(join(dist, "_headers"), headers.join("\n") + "\n");

console.log(`dist/ ready: ${redirects.length} redirects, ${(config.headers ?? []).length} header rules.`);
