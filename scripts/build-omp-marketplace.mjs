#!/usr/bin/env bun
/**
 * Build OMP marketplace packages under plugins/ and regenerate
 * .omp-plugin/marketplace.json.
 *
 * Root hstack (Cursor plugin) is never modified by this script.
 *
 * Usage:
 *   bun scripts/build-omp-marketplace.mjs [--clean]
 */
import {
 cpSync,
 existsSync,
 mkdirSync,
 readdirSync,
 readFileSync,
 rmSync,
 writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PLUGINS_DIR = join(REPO_ROOT, "plugins");
const CATALOG_PATH = join(REPO_ROOT, ".omp-plugin", "marketplace.json");
const CONVERTER = join(REPO_ROOT, "scripts", "cursor-plugin-to-omp.mjs");

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const SOURCES = [
 {
  name: "pstack",
  description:
   "OMP-native pstack: deep agent workflows, poteto-mode, arena/swarm/interrogate. Setup writes ~/.omp/agent/pstack.yaml.",
  category: "development",
  source: resolve(REPO_ROOT, "../plugins/cursor-plugins/pstack"),
  kind: "cursor-plugin",
  pstack: true,
  homepage: "https://github.com/cursor/plugins/tree/main/pstack",
  repository: "https://github.com/cursor/plugins",
  keywords: ["pstack", "workflow", "agents", "omp"],
 },
 {
  name: "thermos",
  description:
   "Thermo-nuclear branch review for OMP: deep correctness/security audits plus harsh code-quality rubrics.",
  category: "development",
  source: resolve(REPO_ROOT, "../plugins/cursor-plugins/thermos"),
  kind: "cursor-plugin",
  homepage: "https://github.com/cursor/plugins/tree/main/thermos",
  repository: "https://github.com/cursor/plugins",
  keywords: ["thermos", "code-review", "security", "omp"],
 },
 {
  name: "cursed-plugins",
  description:
   "Factory cursed skills (roast, blame, therapy, obituary, …) as an OMP package.",
  category: "productivity",
  source: resolve(REPO_ROOT, "../plugins/cursed-plugins"),
  kind: "cursor-plugin",
  homepage: "https://github.com/factory-ai/cursed-plugins",
  repository: "https://github.com/factory-ai/cursed-plugins",
  keywords: ["cursed", "roast", "fun", "omp"],
 },
 {
  name: "codex-security",
  description:
   "OpenAI Codex Security workflows ported to OMP (scans, diff review, triage, threat modeling).",
  category: "security",
  source: "/tmp/openai-plugins-src/plugins/codex-security",
  kind: "codex-plugin",
  homepage: "https://developers.openai.com/codex/security",
  repository: "https://github.com/openai/plugins",
  keywords: ["security", "codex", "appsec", "omp"],
 },
];

function run(cmd, args, opts = {}) {
 const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
 if (res.status !== 0) {
  throw new Error(`${cmd} ${args.join(" ")} failed (${res.status})`);
 }
}

function readJson(path) {
 return JSON.parse(readFileSync(path, "utf8"));
}

function ensureConverter() {
 if (!existsSync(CONVERTER)) {
  throw new Error(`converter missing: ${CONVERTER}`);
 }
}

function ensureCodexSource(src) {
 if (existsSync(src)) return;
 console.log("cloning openai/plugins (shallow) for codex-security…");
 if (!existsSync("/tmp/openai-plugins-src/.git")) {
  run("git", [
   "clone",
   "--depth",
   "1",
   "https://github.com/openai/plugins.git",
   "/tmp/openai-plugins-src",
  ]);
 }
 if (!existsSync(src)) {
  throw new Error(`codex-security still missing at ${src}`);
 }
}

function copyDir(src, dest, { ignore = new Set() } = {}) {
 mkdirSync(dest, { recursive: true });
 for (const entry of readdirSync(src, { withFileTypes: true })) {
  if (ignore.has(entry.name)) continue;
  if (entry.name === ".git" || entry.name === "node_modules") continue;
  const from = join(src, entry.name);
  const to = join(dest, entry.name);
  if (entry.isDirectory()) copyDir(from, to, { ignore });
  else if (entry.isFile()) {
   mkdirSync(dirname(to), { recursive: true });
   cpSync(from, to);
  }
 }
}

function stripHarnessManifests(dest) {
 for (const d of [
  ".cursor-plugin",
  ".claude-plugin",
  ".codex-plugin",
  ".factory-plugin",
  ".omp-plugin",
  ".git",
 ]) {
  const p = join(dest, d);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
 }
 // never ship Agent Plugins root in OMP packages from this pipeline
 const ap = join(dest, "plugin.json");
 if (existsSync(ap)) {
  try {
   const j = readJson(ap);
   if (
    typeof j.$schema === "string" &&
    j.$schema.includes("agent-plugins.org")
   ) {
    rmSync(ap);
   }
  } catch {
   /* leave */
  }
 }
}

function convertCursorPlugin(src, dest, { pstack = false } = {}) {
 ensureConverter();
 if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
 const args = [CONVERTER, src, dest];
 if (pstack) args.push("--pstack");
 run("bun", args);
 stripHarnessManifests(dest);
}

function convertCodexPlugin(src, dest, meta) {
 if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
 mkdirSync(dest, { recursive: true });

 for (const name of [
  "skills",
  "assets",
  "references",
  "scripts",
  "examples",
  "schemas",
  "preflight",
  "mcp",
 ]) {
  const p = join(src, name);
  if (existsSync(p)) copyDir(p, join(dest, name));
 }

 if (existsSync(join(src, ".mcp.json"))) {
  cpSync(join(src, ".mcp.json"), join(dest, ".mcp.json"));
 }

 const codex = existsSync(join(src, ".codex-plugin", "plugin.json"))
  ? readJson(join(src, ".codex-plugin", "plugin.json"))
  : {};

 const name = meta.name ?? codex.name ?? "codex-security";
 const version = codex.version ?? "0.0.0";
 const description = meta.description ?? codex.description ?? name;
 const license = codex.license ?? "UNLICENSED";
 const keywords = [
  ...(codex.keywords ?? []),
  ...(meta.keywords ?? []),
  "omp-package",
 ];

 const pkg = {
  name,
  version,
  description,
  type: "module",
  license,
  keywords: [...new Set(keywords)],
  omp: { skills: ["./skills"] },
  author: codex.author ?? { name: "OpenAI" },
  homepage: meta.homepage ?? codex.homepage,
  repository: {
   type: "git",
   url: meta.repository ?? codex.repository ?? "https://github.com/openai/plugins",
  },
 };
 writeFileSync(join(dest, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
 writeFileSync(
  join(dest, "README.md"),
  `# ${name}\n\nOMP package port of OpenAI Codex plugin \`${name}\`.\n\nUpstream: ${pkg.homepage}\n`,
 );
}

function buildOne(entry) {
 if (entry.kind === "codex-plugin") ensureCodexSource(entry.source);
 if (!existsSync(entry.source)) {
  throw new Error(`source missing for ${entry.name}: ${entry.source}`);
 }

 const dest = join(PLUGINS_DIR, entry.name);
 console.log(`\n→ ${entry.name} (${entry.kind})\n  from ${entry.source}`);

 if (entry.kind === "codex-plugin") {
  convertCodexPlugin(entry.source, dest, entry);
 } else {
  convertCursorPlugin(entry.source, dest, { pstack: !!entry.pstack });
 }

 if (!existsSync(join(dest, "package.json"))) {
  throw new Error(`${entry.name}: missing package.json after build`);
 }

 const pkg = readJson(join(dest, "package.json"));
 const skillCount = existsSync(join(dest, "skills"))
  ? readdirSync(join(dest, "skills")).filter((n) => !n.startsWith(".")).length
  : 0;
 const agentCount = existsSync(join(dest, "agents"))
  ? readdirSync(join(dest, "agents")).filter((n) => n.endsWith(".md")).length
  : 0;
 console.log(`  ${entry.name}@${pkg.version} skills=${skillCount} agents=${agentCount}`);

 return {
  name: entry.name,
  description: entry.description ?? pkg.description,
  version: pkg.version,
  category: entry.category ?? "development",
  homepage: entry.homepage ?? pkg.homepage,
  repository:
   entry.repository ??
   (typeof pkg.repository === "string"
    ? pkg.repository
    : pkg.repository?.url),
  license: pkg.license,
  keywords: entry.keywords ?? pkg.keywords,
  author: pkg.author,
 };
}

function writeCatalog(plugins) {
 mkdirSync(dirname(CATALOG_PATH), { recursive: true });
 const catalog = {
  $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
  name: "hstack",
  owner: {
   name: "harsha",
  },
  metadata: {
   description:
    "OMP marketplace of normalized plugins. Root-repo hstack remains the Cursor-only core plugin and is not listed here.",
   version: "0.4.0",
   pluginRoot: "plugins",
  },
  plugins: plugins.map((p) => {
   const e = {
    name: p.name,
    description: p.description,
    version: p.version,
    // pluginRoot is "plugins", so source is relative to that root
    source: `./${p.name}`,
    category: p.category,
   };
   if (p.homepage) e.homepage = p.homepage;
   if (p.repository) e.repository = p.repository;
   if (p.license) e.license = p.license;
   if (p.keywords) e.keywords = p.keywords;
   if (p.author) e.author = p.author;
   return e;
  }),
 };
 writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
 console.log(`\nwrote ${CATALOG_PATH}`);
}

function main() {
 if (flags.has("--clean") && existsSync(PLUGINS_DIR)) {
  rmSync(PLUGINS_DIR, { recursive: true, force: true });
 }
 mkdirSync(PLUGINS_DIR, { recursive: true });

 const built = SOURCES.map(buildOne);
 writeCatalog(built);
}

main();
