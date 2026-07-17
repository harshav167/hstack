/**
 * Push-to-main releaser (no Release PR).
 *
 * Reads conventional commits since the last `v*` tag, bumps package.json +
 * .cursor-plugin/*.json, finalizes CHANGELOG, commits, tags, and `gh release create`.
 * Exit 0 with no-op when nothing warrants a release.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { $ } from "bun";

const ROOT = path.resolve(import.meta.dir, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const PLUGIN_JSON = path.join(ROOT, ".cursor-plugin/plugin.json");
const MARKETPLACE_JSON = path.join(ROOT, ".cursor-plugin/marketplace.json");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");

type Bump = "major" | "minor" | "patch" | null;

function parseBump(messages: string[]): Bump {
	let bump: Bump = null;
	for (const msg of messages) {
		const first = msg.split("\n")[0] ?? "";
		if (/\bBREAKING CHANGE\b/.test(msg) || /^[a-z]+(\([^)]*\))?!:/.test(first)) {
			return "major";
		}
		if (/^feat(\(|:)/.test(first)) {
			bump = bump === "major" ? "major" : "minor";
		} else if (/^(fix|perf)(\(|:)/.test(first) && bump !== "minor" && bump !== "major") {
			bump = "patch";
		}
	}
	return bump;
}

function bumpSemver(version: string, kind: Exclude<Bump, null>): string {
	const [maj, min, pat] = version.split(".").map(n => Number(n));
	if ([maj, min, pat].some(n => !Number.isFinite(n))) {
		throw new Error(`bad version: ${version}`);
	}
	if (kind === "major") return `${maj + 1}.0.0`;
	if (kind === "minor") return `${maj}.${min + 1}.0`;
	return `${maj}.${min}.${pat + 1}`;
}

function setJsonVersion(file: string, version: string, jsonpath: "version" | "metadata.version"): void {
	const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
	if (jsonpath === "version") {
		raw.version = version;
	} else {
		const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
		metadata.version = version;
		raw.metadata = metadata;
	}
	fs.writeFileSync(file, `${JSON.stringify(raw, null, "\t")}\n`);
}

function finalizeChangelog(version: string, date: string): void {
	let text = fs.readFileSync(CHANGELOG, "utf8");
	if (!text.includes("## [Unreleased]")) {
		text = `# Changelog\n\n## [Unreleased]\n\n${text.replace(/^# Changelog\n*/, "")}`;
	}
	text = text.replace(
		"## [Unreleased]",
		`## [Unreleased]\n\n## [${version}] - ${date}`,
	);
	fs.writeFileSync(CHANGELOG, text);
}

async function lastVersionTag(): Promise<string | null> {
	const result = await $`git describe --tags --abbrev=0 --match "v*"`.nothrow().quiet();
	if (result.exitCode !== 0) return null;
	return result.text().trim() || null;
}

async function commitSubjectsSince(tag: string | null): Promise<string[]> {
	const range = tag ? `${tag}..HEAD` : "HEAD";
	const result = await $`git log ${range} --pretty=format:%B%x00`.quiet();
	return result
		.text()
		.split("\0")
		.map(s => s.trim())
		.filter(Boolean)
		.filter(s => !s.startsWith("chore(release):"));
}

async function main(): Promise<void> {
	const tag = await lastVersionTag();
	const subjects = await commitSubjectsSince(tag);
	const kind = parseBump(subjects);
	if (!kind) {
		console.log("no conventional feat/fix/breaking since last tag — skip");
		return;
	}

	const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")) as { version: string };
	const next = bumpSemver(pkg.version, kind);
	const date = new Date().toISOString().slice(0, 10);

	setJsonVersion(PACKAGE_JSON, next, "version");
	setJsonVersion(PLUGIN_JSON, next, "version");
	setJsonVersion(MARKETPLACE_JSON, next, "metadata.version");
	finalizeChangelog(next, date);

	const tagName = `v${next}`;
	await $`git add package.json .cursor-plugin/plugin.json .cursor-plugin/marketplace.json CHANGELOG.md`;
	await $`git commit -m ${`chore(release): ${next}`}`;
	await $`git tag ${tagName}`;
	await $`git push origin HEAD:main`;
	await $`git push origin ${tagName}`;
	await $`gh release create ${tagName} --title ${tagName} --generate-notes`;

	console.log(`released ${tagName} (${kind})`);
}

await main();
