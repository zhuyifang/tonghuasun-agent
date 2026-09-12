import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveReleaseVersion } from "./versioning.mjs";


const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`参数不完整：${name ?? "<empty>"}`);
    }
    values.set(name.slice(2), value);
  }
  return values;
}

async function readCurrentVersion(component) {
  const definitions = {
    agent: ["fqgate/compatibility.json", "agentVersion"],
    "mcp-apps": ["AI-plugins/ui-apps/mcp-apps/apps.json", "bundleVersion"]
  };
  const definition = definitions[component];
  if (!definition) throw new Error(`发布组件无效：${component}`);
  const value = JSON.parse(await readFile(resolve(repositoryRoot, definition[0]), "utf8"));
  return value[definition[1]];
}

const argumentsMap = parseArguments(process.argv.slice(2));
const component = argumentsMap.get("component");
const bump = argumentsMap.get("bump");
if (!component || !bump) throw new Error("缺少 --component 或 --bump。");
const currentVersion = await readCurrentVersion(component);
const version = resolveReleaseVersion(currentVersion, bump, argumentsMap.get("custom-version") ?? "");
process.stdout.write(version);
