#!/usr/bin/env bun
/**
 * Convert a Cursor-style plugin directory into an OMP extension package.
 *
 * OMP package surface (from omp:// plugin + skills + task-agent docs):
 *   package.json  { name, version, omp: { skills: ["./skills"], extensions?: [...] } }
 *   skills/<name>/SKILL.md   (lenient OMP skill frontmatter)
 *   agents/<name>.md         (OMP task-agent frontmatter)
 *   commands/<name>.md       (optional slash commands)
 *   rules/, prompts/, hooks/, tools/, .mcp.json as present
 *
 * Usage:
 *   bun scripts/cursor-plugin-to-omp.mjs <srcDir> <outDir> [--in-place] [--pstack]
 *
 * --in-place   write into srcDir (no copy of whole tree; mutates agents/skills/package.json)
 * --pstack     rewrite setup-pstack + skill config paths to ~/.omp/agent/pstack.yaml
 */
import {
 cpSync,
 existsSync,
 mkdirSync,
 readdirSync,
 readFileSync,
 rmSync,
 statSync,
 writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.length < 1) {
 console.error(
  "usage: bun scripts/cursor-plugin-to-omp.mjs <srcDir> [outDir] [--in-place] [--pstack]",
 );
 process.exit(2);
}

const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const srcDir = resolve(positional[0]);
const inPlace = flags.has("--in-place");
const pstackMode = flags.has("--pstack");
const outDir = inPlace
 ? srcDir
 : resolve(positional[1] ?? `${srcDir.replace(/\/$/, "")}-omp`);

function readJson(path) {
 return JSON.parse(readFileSync(path, "utf8"));
}

function tryReadJson(path) {
 try {
  return readJson(path);
 } catch {
  return undefined;
 }
}

function listSkillDirs(skillsRoot) {
 if (!existsSync(skillsRoot)) return [];
 return readdirSync(skillsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("."))
  .filter((e) => existsSync(join(skillsRoot, e.name, "SKILL.md")))
  .map((e) => e.name);
}

function parseFrontmatter(raw) {
 if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
  return { frontmatter: {}, body: raw, hasFm: false };
 }
 const end = raw.indexOf("\n---", 4);
 if (end < 0) return { frontmatter: {}, body: raw, hasFm: false };
 let bodyStart = end + 4;
 if (raw[bodyStart] === "\r") bodyStart += 1;
 if (raw[bodyStart] === "\n") bodyStart += 1;
 const fmRaw = raw.slice(4, end);
 return {
  frontmatter: parseSimpleFrontmatter(fmRaw),
  fmRaw,
  body: raw.slice(bodyStart),
  hasFm: true,
 };
}

function stripQuotes(value) {
 if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
 ) {
  return value.slice(1, -1);
 }
 return value;
}

function parseSimpleFrontmatter(yaml) {
 const lines = yaml.split(/\r?\n/);
 const obj = {};
 let i = 0;
 while (i < lines.length) {
  const line = lines[i];
  if (!line.trim() || line.trim().startsWith("#")) {
   i += 1;
   continue;
  }
  if (/^[\t ]/.test(line)) {
   i += 1;
   continue;
  }
  const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
  if (!match) {
   i += 1;
   continue;
  }
  const key = match[1];
  const rest = match[2];
  if (rest === "") {
   i += 1;
   const list = [];
   let sawList = false;
   while (i < lines.length) {
    const nested = lines[i];
    if (!nested.trim()) {
     i += 1;
     continue;
    }
    const listMatch = nested.match(/^[\t ]+-[\t ]+(.*)$/);
    if (!listMatch) break;
    sawList = true;
    list.push(stripQuotes(listMatch[1].trim()));
    i += 1;
   }
   obj[key] = sawList ? list : "";
   continue;
  }
  let value = rest;
  if (value.startsWith("[") && value.endsWith("]")) {
   const inner = value.slice(1, -1).trim();
   obj[key] = inner
    ? inner.split(",").map((part) => stripQuotes(part.trim()))
    : [];
  } else if (
   (value.startsWith('"') && value.endsWith('"')) ||
   (value.startsWith("'") && value.endsWith("'"))
  ) {
   obj[key] = value.slice(1, -1);
  } else if (value === "true") obj[key] = true;
  else if (value === "false") obj[key] = false;
  else if (/^-?\d+(\.\d+)?$/.test(value)) obj[key] = Number(value);
  else obj[key] = value;
  i += 1;
 }
 return obj;
}

function yamlScalar(value) {
 const s = String(value);
 if (s === "") return '""';
 if (
  /[:#{}\[\],&*?|>!%@`]/.test(s) ||
  s !== s.trim() ||
  s.includes("\n") ||
  s.includes('"') ||
  s.includes("'")
 ) {
  return JSON.stringify(s);
 }
 return s;
}

function serializeFrontmatter(data) {
 const lines = ["---"];
 for (const [key, value] of Object.entries(data)) {
  if (value === undefined) continue;
  if (Array.isArray(value)) {
   if (value.length === 0) {
    lines.push(`${key}: []`);
   } else if (value.every((v) => typeof v !== "object" || v === null)) {
    // OMP agents accept CSV tools; prefer single-line CSV for tools/spawns/model
    if (key === "tools" || key === "spawns" || key === "model" || key === "autoloadSkills") {
     lines.push(`${key}: ${value.map(String).join(", ")}`);
    } else {
     lines.push(`${key}:`);
     for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
    }
   } else {
    lines.push(`${key}: ${JSON.stringify(value)}`);
   }
   continue;
  }
  if (typeof value === "object" && value !== null) {
   lines.push(`${key}: ${JSON.stringify(value)}`);
   continue;
  }
  if (typeof value === "boolean" || typeof value === "number") {
   lines.push(`${key}: ${value}`);
   continue;
  }
  lines.push(`${key}: ${yamlScalar(value)}`);
 }
 lines.push("---");
 return `${lines.join("\n")}\n`;
}

function slugifyAgentFileName(name) {
 return name
  .trim()
  .toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, "-")
  .replaceAll(/^-+|-+$/g, "");
}

/** Map Cursor agent frontmatter → OMP task-agent frontmatter. */
function normalizeAgent(frontmatter, fileBase) {
 const out = { ...frontmatter };
 const name =
  typeof out.name === "string" && out.name.trim()
   ? out.name.trim()
   : fileBase;
 // OMP agent names should be stable ids; keep explicit name, slug file separately.
 out.name = name.includes(" ") ? slugifyAgentFileName(name) : name;

 // Cursor is_background means async/non-blocking spawn default.
 if ("is_background" in out || "isBackground" in out) {
  const bg = out.is_background ?? out.isBackground;
  delete out.is_background;
  delete out.isBackground;
  if (out.blocking === undefined) {
   // background => non-blocking (omit or false). OMP default is non-blocking.
   if (bg === true) out.blocking = false;
   if (bg === false) out.blocking = true;
  }
 }

 // Cursor-only noise
 for (const k of ["readonly", "background", "filePatterns", "file-patterns"]) {
  // keep filePatterns? OMP agents don't use it — drop
  if (k === "filePatterns" || k === "file-patterns") delete out[k];
 }

 if (typeof out.description !== "string" || !out.description.trim()) {
  out.description = out.name;
 }
 return out;
}

function copyTree(src, dest, { ignoreNames = new Set() } = {}) {
 mkdirSync(dest, { recursive: true });
 for (const entry of readdirSync(src, { withFileTypes: true })) {
  if (ignoreNames.has(entry.name)) continue;
  if (entry.name === ".git" || entry.name === "node_modules") continue;
  const from = join(src, entry.name);
  const to = join(dest, entry.name);
  if (entry.isDirectory()) copyTree(from, to, { ignoreNames });
  else if (entry.isFile()) {
   mkdirSync(dirname(to), { recursive: true });
   cpSync(from, to);
  }
 }
}

function loadCursorMetadata(src) {
 const cursor = tryReadJson(join(src, ".cursor-plugin", "plugin.json"));
 const factory = tryReadJson(join(src, ".factory-plugin", "plugin.json"));
 const claude = tryReadJson(join(src, ".claude-plugin", "plugin.json"));
 const existingPkg = tryReadJson(join(src, "package.json"));
 const m = cursor ?? factory ?? claude ?? {};
 return {
  id: m.name ?? existingPkg?.name ?? basename(src),
  version: m.version ?? existingPkg?.version ?? "0.0.0",
  description: m.description ?? existingPkg?.description ?? "",
  author: m.author ?? existingPkg?.author,
  homepage: m.homepage ?? existingPkg?.homepage,
  repository: m.repository ?? existingPkg?.repository,
  license: m.license ?? existingPkg?.license ?? "MIT",
  keywords: m.keywords ?? existingPkg?.keywords ?? [],
 };
}

function writePackageJson(dest, meta, { hasSkills, hasExtension }) {
 const keywords = new Set([
  ...(Array.isArray(meta.keywords) ? meta.keywords : []),
  "omp-package",
 ]);
 const omp = {};
 if (hasSkills) omp.skills = ["./skills"];
 if (hasExtension) omp.extensions = ["./extension.ts"];

 const pkg = {
  name: meta.id,
  version: meta.version,
  description: meta.description,
  type: "module",
  license: meta.license,
  keywords: [...keywords],
  omp,
 };
 if (meta.author) pkg.author = meta.author;
 if (meta.homepage) pkg.homepage = meta.homepage;
 if (meta.repository) {
  pkg.repository =
   typeof meta.repository === "string"
    ? { type: "git", url: meta.repository }
    : meta.repository;
 }
 writeFileSync(join(dest, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

function normalizeSkillNames(skillsRoot) {
 if (!existsSync(skillsRoot)) return 0;
 let n = 0;
 for (const dirName of listSkillDirs(skillsRoot)) {
  const skillMd = join(skillsRoot, dirName, "SKILL.md");
  const raw = readFileSync(skillMd, "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed.hasFm) continue;
  if (parsed.frontmatter.name !== dirName) {
   const fm = { ...parsed.frontmatter, name: dirName };
   writeFileSync(
    skillMd,
    serializeFrontmatter(fm) + "\n" + parsed.body.replace(/^\n+/, ""),
   );
   n += 1;
  }
 }
 return n;
}

function convertAgents(agentsDir) {
 if (!existsSync(agentsDir)) return { count: 0, files: [] };
 const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
 const written = [];
 for (const file of files) {
  const full = join(agentsDir, file);
  const raw = readFileSync(full, "utf8");
  const { frontmatter, body, hasFm } = parseFrontmatter(raw);
  if (!hasFm) continue;
  const base = file.replace(/\.md$/i, "");
  const normalized = normalizeAgent(frontmatter, base);
  const outName = `${slugifyAgentFileName(normalized.name)}.md`;
  const outPath = join(agentsDir, outName);
  const content =
   serializeFrontmatter(normalized) + "\n" + body.replace(/^\n+/, "");
  // remove old file if renamed
  if (outName !== file && existsSync(full)) rmSync(full);
  writeFileSync(outPath, content);
  written.push(outName);
 }
 return { count: written.length, files: written };
}

const CURSOR_PSTACK_CONFIG = [
 "~/.cursor/rules/pstack-models.mdc",
 ".cursor/rules/pstack-models.mdc",
];
const OMP_PSTACK_CONFIG = "~/.omp/agent/pstack.yaml";

function rewritePstackConfigPaths(text) {
 let out = text;
 for (const old of CURSOR_PSTACK_CONFIG) {
  out = out.split(old).join(OMP_PSTACK_CONFIG);
 }
 return out;
}

function rewriteSetupPstackSkill(skillPath) {
 const body = `# Setup pstack

Write \`${OMP_PSTACK_CONFIG}\`, a small YAML file that sets pstack's model per workflow role. Skills read it and fall back to their inline defaults when a key is absent, so this is an override layer, not a requirement.

This is **not** the same as OMP \`/agents\` → \`task.agentModelOverrides\` (those override named agent *types* like \`poteto-agent\`). setup-pstack configures **skill/workflow roles** (how critics, arena runners, swarm workers, …).

## Steps

### 1. Detect available models

Enumerate the model slugs you can pass to a \`Task\` subagent in this session; that is the dependable source. If you cannot detect any, ask the user to paste the slugs they have access to. Never write a real slug you have not confirmed is available. The aliases \`inherit-parent\` and \`auto\` are always valid even though they are not detected slugs.

### 2. Load current state

The default role-to-model mapping is the shape shown in step 5 below. If \`${OMP_PSTACK_CONFIG}\` already exists, read it and treat its values as the current choices. Otherwise start from those defaults.

Also note: named OMP agents shipped by this package (\`poteto-agent\`, \`comment-sicko\`) can still be overridden later via OMP's \`/agents\` UI, which writes \`task.agentModelOverrides\` in \`~/.omp/agent/config.yml\`. Do not put those agent-type overrides into pstack.yaml.

### 3. Map and confirm

Show every role with its current model, marking any real slug not in the detected set as needing a choice. Ask whether to accept as-is or change specific roles, offering the detected models plus \`inherit-parent\` and \`auto\` (both mean: this role runs on the parent chat model) as the options. Prefer a structured multiple-choice ask over free text.

For panel roles (\`how critics\`, \`arena runners\`, \`architect runners\`, \`interrogate reviewers\`) the value is a **list**, and one subagent runs per entry, alias entries included, so the list length sets the count. \`arena cross-judge pool\` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. \`swarm workers\` is a single default model for every worker unless a race names a model per arm.

### 4. Validate

Every real slug written must be in the detected set; \`inherit-parent\` and \`auto\` always pass. If a chosen real slug is not available, stop and ask again.

### 5. Write the config

Write \`${OMP_PSTACK_CONFIG}\` as YAML. Overwrite the whole file so re-runs stay idempotent. Use quoted keys (role labels contain commas/spaces). List roles are YAML arrays.

\`\`\`yaml
# pstack model configuration. Delete a key to fall back to the skill default.
# inherit-parent / auto: role runs on the parent chat model (omit Task model).
"feature, refactoring": grok-4.5-fast-xhigh
bug-fix: gpt-5.6-sol-max
perf-issue: gpt-5.6-sol-max
hillclimb: gpt-5.6-sol-max
"judgment and prose": claude-fable-5-thinking-max
"hardest tasks": claude-fable-5-thinking-max
"how explorer": grok-4.5-fast-xhigh
"how explainer": claude-fable-5-thinking-max
"how critics":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"why investigators": grok-4.5-fast-xhigh
"why synthesizer": claude-fable-5-thinking-max
"reflect tooling": gpt-5.6-sol-max
"reflect judgment, divergent, synthesizer": claude-fable-5-thinking-max
"arena runners":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"arena cross-judge pool":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"swarm workers": grok-4.5-fast-xhigh
"architect runners":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"interrogate reviewers":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
\`\`\`

Create \`~/.omp/agent/\` if needed. Do not write Cursor rules.

### 6. Confirm

Tell the user the file was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a \`verify-*\` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke that skill. On no, move on without pushing.
`;

 const content = serializeFrontmatter({
  name: "setup-pstack",
  description:
   "Configure which models pstack uses per workflow role. Detects available models and writes ~/.omp/agent/pstack.yaml. Use for /setup-pstack, configure pstack models, or changing pstack model choices.",
 }) + "\n" + body;
 writeFileSync(skillPath, content);
}

function ensureSetupCommand(dest) {
 const commandsDir = join(dest, "commands");
 mkdirSync(commandsDir, { recursive: true });
 // OMP slash command from commands/*.md — name = filename stem → /setup-pstack
 const content = serializeFrontmatter({
  description:
   "Configure pstack per-role models into ~/.omp/agent/pstack.yaml (skill workflow roles, not /agents type overrides).",
 }) +
  "\n" +
  "Run the `setup-pstack` skill end-to-end.\n" +
  "\n" +
  "Read `skill://setup-pstack` (or the package `skills/setup-pstack/SKILL.md`) and follow every step.\n" +
  "Write config only to `~/.omp/agent/pstack.yaml`.\n";
 writeFileSync(join(commandsDir, "setup-pstack.md"), content);
}

function rewriteTextFilesForPstack(root) {
 const rels = [
  "docs/guide/01-setup.md",
  "skills/arena/SKILL.md",
  "skills/interrogate/SKILL.md",
  "skills/swarm/SKILL.md",
  "skills/poteto-mode/SKILL.md",
  "README.md",
 ];
 let n = 0;
 for (const rel of rels) {
  const full = join(root, rel);
  if (!existsSync(full)) continue;
  const raw = readFileSync(full, "utf8");
  const next = rewritePstackConfigPaths(raw)
   // Cursor rule wording → OMP file
   .replaceAll("always-applied rule", "OMP user config file")
   .replaceAll("always-applied", "user-level");
  if (next !== raw) {
   writeFileSync(full, next);
   n += 1;
  }
 }
 return n;
}

// ── main ────────────────────────────────────────────────────────────

if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
 console.error(`src not a directory: ${srcDir}`);
 process.exit(1);
}

if (!inPlace) {
 if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
 copyTree(srcDir, outDir, {
  ignoreNames: new Set([
   "pstack-soubi",
   ".soubi-out",
   "node_modules",
   // keep cursor/claude manifests out of pure omp package? keep them — harmless
  ]),
 });
}

const meta = loadCursorMetadata(srcDir);
const skillsRoot = join(outDir, "skills");
const skillNames = listSkillDirs(skillsRoot);
const agentsDir = join(outDir, "agents");

// Prefer agents/ over droids/ for OMP; if only droids, copy to agents
const droidsDir = join(outDir, "droids");
if (!existsSync(agentsDir) && existsSync(droidsDir)) {
 mkdirSync(agentsDir, { recursive: true });
 for (const f of readdirSync(droidsDir)) {
  if (f.endsWith(".md")) cpSync(join(droidsDir, f), join(agentsDir, f));
 }
}

const agentResult = convertAgents(agentsDir);
const _skillNameFixes = normalizeSkillNames(skillsRoot);

if (pstackMode) {
 const setupSkill = join(skillsRoot, "setup-pstack", "SKILL.md");
 if (existsSync(setupSkill)) rewriteSetupPstackSkill(setupSkill);
 ensureSetupCommand(outDir);
 rewriteTextFilesForPstack(outDir);
}

// Never emit Agent Plugins root plugin.json here — that path is skills+MCP only
// and OMP's strict loader rejects Cursor skill frontmatter.
if (existsSync(join(outDir, "plugin.json"))) {
 // Only remove if it looks like Agent Plugins schema we may have added earlier
 try {
  const pj = readJson(join(outDir, "plugin.json"));
  if (
   typeof pj.$schema === "string" &&
   pj.$schema.includes("agent-plugins.org")
  ) {
   rmSync(join(outDir, "plugin.json"));
  }
 } catch {
  /* leave */
 }
}

writePackageJson(outDir, meta, {
 hasSkills: skillNames.length > 0,
 hasExtension: existsSync(join(outDir, "extension.ts")),
});

console.log(
 JSON.stringify(
  {
   srcDir,
   outDir,
   inPlace,
   pstackMode,
   packageId: meta.id,
   skills: skillNames.length,
   agents: agentResult,
   commands: existsSync(join(outDir, "commands"))
    ? readdirSync(join(outDir, "commands")).filter((f) => f.endsWith(".md"))
    : [],
  },
  null,
  2,
 ),
);
