import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareVersions, versionParts } from "./versioning.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function parseArguments(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`参数不完整：${name ?? "<empty>"}`);
    }
    result.set(name.slice(2), value);
  }
  return result;
}

function normalizeNotes(value) {
  const notes = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
  if (notes.length < 1 || notes.length > 12) throw new Error("更新说明必须包含 1 到 12 条内容。");
  if (notes.some((note) => note.length > 200)) throw new Error("每条更新说明不能超过 200 个字符。");
  if (new Set(notes).size !== notes.length) throw new Error("更新说明不能包含重复条目。");
  return notes;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await writeFile(resolve(repositoryRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function replaceVersion(relativePath, oldVersion, newVersion) {
  const path = resolve(repositoryRoot, relativePath);
  const source = await readFile(path, "utf8");
  if (!source.includes(oldVersion)) throw new Error(`文件中没有当前版本 ${oldVersion}：${relativePath}`);
  await writeFile(path, source.replaceAll(oldVersion, newVersion), "utf8");
}

const argumentsMap = parseArguments(process.argv.slice(2));
const version = argumentsMap.get("version");
if (!version) throw new Error("缺少 --version。");
versionParts(version);
const notes = normalizeNotes(process.env.AGENT_RELEASE_NOTES ?? "");

const compatibility = await readJson("fqgate/compatibility.json");
const oldVersion = compatibility.agentVersion;
if (compareVersions(version, oldVersion) <= 0) {
  throw new Error(`新版本必须高于当前 Agent 版本：${oldVersion}`);
}
compatibility.agentVersion = version;
await writeJson("fqgate/compatibility.json", compatibility);

const versionedJsonFiles = [
  "package.json",
  "installer/package.json",
  "AI-plugins/codex/.codex-plugin/plugin.json",
  "AI-plugins/claude-code/.claude-plugin/plugin.json",
  "AI-plugins/workbuddy/.codebuddy-plugin/plugin.json",
  "AI-plugins/zcode/.zcode-plugin/plugin.json",
  "AI-plugins/openclaw/plugin.json",
  "AI-plugins/doubao/plugin.json",
  "AI-plugins/qianwen/plugin.json",
  "AI-plugins/deepseek-harness/package.json"
];
for (const relativePath of versionedJsonFiles) {
  const value = await readJson(relativePath);
  if (value.version !== oldVersion) throw new Error(`JSON 版本与兼容清单不一致：${relativePath}`);
  value.version = version;
  await writeJson(relativePath, value);
}

const textFiles = [
  "README.md",
  "fqgate/README.md",
  "AI-plugins/codex/README.md",
  "AI-plugins/claude-code/README.md",
  "AI-plugins/workbuddy/README.md",
  "AI-plugins/zcode/README.md",
  "AI-plugins/openclaw/README.md",
  "AI-plugins/deepseek-harness/README.md",
  "AI-plugins/doubao/install.ps1",
  "AI-plugins/qianwen/install.ps1",
  "installer/runtime/fqgate-config.mjs",
  "sdk/python/pyproject.toml",
  "sdk/python/src/fqgate_client/client.py"
];
for (const relativePath of textFiles) await replaceVersion(relativePath, oldVersion, version);

const notesPath = resolve(repositoryRoot, "RELEASE_NOTES.md");
const existingNotes = await readFile(notesPath, "utf8");
if (existingNotes.startsWith(`# ${version} 更新说明`)) throw new Error(`${version} 更新说明已经存在。`);
const section = `# ${version} 更新说明\n\n## 本次更新\n\n${notes.map((note) => `- ${note}`).join("\n")}\n\n`;
await writeFile(notesPath, section + existingNotes, "utf8");

process.stdout.write(`Agent 版本已从 ${oldVersion} 更新到 ${version}。\n`);
