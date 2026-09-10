import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildMcpApps,
  createRelease,
  defaultReleaseOutput,
  loadSigningPrivateKey,
  parseArguments,
  projectDirectory
} from "./mcp-apps-lib.mjs";

const argumentsMap = parseArguments(process.argv.slice(2));
const allowedArguments = new Set(["output", "signing-key-file"]);
for (const key of argumentsMap.keys()) {
  if (!allowedArguments.has(key)) throw new Error(`正式发布不支持参数 --${key}。`);
}

// 先检查签名凭证，避免缺少正式密钥时仍生成一个看似可发布的目录。
const privateKey = await loadSigningPrivateKey({ keyFile: argumentsMap.get("signing-key-file") });
const releaseRoot = resolve(argumentsMap.get("output") ?? defaultReleaseOutput);
const buildDirectory = resolve(projectDirectory, "dist", `.mcp-apps-release-${process.pid}`);
try {
  await buildMcpApps({ channel: "stable", outputDirectory: buildDirectory });
  const result = await createRelease({ buildDirectory, releaseRoot, privateKey });
  process.stdout.write(`MCP Apps 正式包已生成：${result.versionDirectory}\n`);
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}
