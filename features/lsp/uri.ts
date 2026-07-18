/** file:// URI conversion and extension → LSP languageId mapping. */
import * as path from "node:path";

export function fileToUri(filePath: string): string {
	return Bun.pathToFileURL(path.resolve(filePath)).href;
}

const LANGUAGE_ID_BY_EXT: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".mjs": "javascript",
	".cjs": "javascript",
	".mts": "typescript",
	".cts": "typescript",
	".go": "go",
	".py": "python",
	".pyi": "python",
	".json": "json",
	".jsonc": "jsonc",
	".html": "html",
	".htm": "html",
	".css": "css",
	".scss": "scss",
	".sass": "sass",
	".less": "less",
	".rs": "rust",
	".java": "java",
	".rb": "ruby",
	".c": "c",
	".cpp": "cpp",
	".h": "c",
	".hpp": "cpp",
	".yaml": "yaml",
	".yml": "yaml",
	".toml": "toml",
	".tf": "terraform",
	".tfvars": "terraform-vars",
	".mod": "gomod",
	".sum": "gosum",
	".dockerfile": "dockerfile",
};

export function languageIdForPath(filePath: string): string {
	const name = path.basename(filePath);
	if (name === "Dockerfile") return "dockerfile";
	return LANGUAGE_ID_BY_EXT[path.extname(filePath).toLowerCase()] ?? "plaintext";
}
