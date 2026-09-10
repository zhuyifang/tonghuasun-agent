import { resolve } from "node:path";

import {
  buildMcpApps,
  defaultBuildOutput,
  defaultDevOutput,
  parseArguments,
  publishDevelopmentBundle
} from "./mcp-apps-lib.mjs";

const argumentsMap = parseArguments(process.argv.slice(2));
for (const key of argumentsMap.keys()) {
  if (key !== "output") throw new Error(`开发发布不支持参数 --${key}。`);
}
const destinationDirectory = resolve(
  argumentsMap.get("output") ?? process.env.FQGATE_DEV_MCP_APPS_DIR ?? defaultDevOutput
);
const { manifest } = await buildMcpApps({ channel: "dev", outputDirectory: defaultBuildOutput });
await publishDevelopmentBundle({ sourceDirectory: defaultBuildOutput, destinationDirectory });
process.stdout.write(`MCP Apps 开发包已发布：${destinationDirectory}（${manifest.bundleVersion}）\n`);
