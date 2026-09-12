import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareVersions, versionParts } from "../../../scripts/release/versioning.mjs";

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
