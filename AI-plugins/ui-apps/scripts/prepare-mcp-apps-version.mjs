import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`参数不完整：${name}`);
    values.set(name.slice(2), value);
  }
  return values;
}

function versionParts(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`版本号必须是严格语义版本：${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

const argumentsMap = parseArguments(process.argv.slice(2));
const version = argumentsMap.get("version");
const minimumFqgateVersion = argumentsMap.get("minimum-fqgate-version");
if (!version || !minimumFqgateVersion) throw new Error("缺少版本参数。");
versionParts(version);
versionParts(minimumFqgateVersion);

const configPath = resolve(repositoryRoot, "AI-plugins/ui-apps/mcp-apps/apps.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
if (compareVersions(version, config.bundleVersion) <= 0) {
  throw new Error(`新版本必须高于当前 MCP Apps 版本：${config.bundleVersion}`);
}
config.bundleVersion = version;
config.minimumFqgateVersion = minimumFqgateVersion;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
process.stdout.write(`MCP Apps 版本已更新为 ${version}。\n`);
