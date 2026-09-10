#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  DEFAULT_MCP_URL,
  assertFqgateVersionCompatible,
  configPathFor,
  discoverExecutable,
  formatError,
  parseBoolean,
  readCompatibilityManifest,
  readConfig,
  readFqgateVersion,
  validateMcpUrl
} from "./fqgate-config.mjs";

main().catch((error) => {
  console.error(`无法启动 FQGate MCP：${formatError(error)}`);
  process.exitCode = 1;
});

async function main() {
  const configPath = configPathFor();
  const config = readConfig(configPath);
  const executablePath = discoverExecutable({ configuredPath: config?.executablePath });
  if (!executablePath) {
    throw new Error(`未找到 FQGate。请先运行 scripts/configure-fqgate.mjs configure；配置位置：${configPath}`);
  }
  const fqgateVersion = readFqgateVersion(executablePath);
  assertFqgateVersionCompatible(fqgateVersion, readCompatibilityManifest());
  const mcpUrl = validateMcpUrl(process.env.FQGATE_MCP_URL || config?.mcpUrl || DEFAULT_MCP_URL);
  const args = ["--mcp-stdio", "--mcp-url", mcpUrl];
  if (parseBoolean(process.env.FQGATE_MCP_TEXT_COMPATIBILITY)) {
    args.push("--mcp-text-compatibility");
  }

  const child = spawn(executablePath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: process.env
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
  const outcome = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (outcome.signal) {
    process.kill(process.pid, outcome.signal);
    return;
  }
  process.exitCode = outcome.code ?? 1;
}
