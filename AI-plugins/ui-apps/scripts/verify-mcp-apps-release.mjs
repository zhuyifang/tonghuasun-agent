import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseArguments, verifyRelease } from "./mcp-apps-lib.mjs";

const argumentsMap = parseArguments(process.argv.slice(2));
const allowedArguments = new Set(["release-root", "public-key-file", "version"]);
for (const key of argumentsMap.keys()) {
  if (!allowedArguments.has(key)) throw new Error(`发布校验不支持参数 --${key}。`);
}
for (const required of ["release-root", "public-key-file"]) {
  if (!argumentsMap.has(required)) throw new Error(`发布校验缺少参数 --${required}。`);
}

const result = await verifyRelease({
  releaseRoot: resolve(argumentsMap.get("release-root")),
  publicKeyPem: await readFile(resolve(argumentsMap.get("public-key-file")), "utf8"),
  bundleVersion: argumentsMap.get("version")
});
process.stdout.write(`MCP Apps 发布包校验通过：${result.manifest.bundleVersion}\n`);
