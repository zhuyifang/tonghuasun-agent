import { relative, resolve } from "node:path";

import { buildMcpApps, defaultBuildOutput, parseArguments, projectDirectory } from "./mcp-apps-lib.mjs";

const argumentsMap = parseArguments(process.argv.slice(2));
for (const key of argumentsMap.keys()) {
  if (!new Set(["channel", "output"]).has(key)) throw new Error(`构建命令不支持参数 --${key}。`);
}
const channel = argumentsMap.get("channel") ?? "dev";
const outputDirectory = resolve(argumentsMap.get("output") ?? defaultBuildOutput);
const result = await buildMcpApps({ channel, outputDirectory });

process.stdout.write(
  `MCP Apps 已构建：${relative(projectDirectory, result.outputDirectory)}（${result.manifest.channel} ${result.manifest.bundleVersion}）\n`
);
