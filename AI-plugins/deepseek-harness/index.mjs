import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";

export const name = "fqgate-agent";
export const inject = mcpClient.inject;

export async function apply(ctx) {
  const launcherPath = fileURLToPath(new URL("./scripts/launch-fqgate-mcp.mjs", import.meta.url));
  const explicitEnvironment = Object.fromEntries(
    ["LOCALAPPDATA", "HOME", "PATH", "FQGATE_EXECUTABLE", "FQGATE_MCP_URL"]
      .map((key) => [key, process.env[key]])
      .filter((entry) => typeof entry[1] === "string" && entry[1].length > 0)
  );

  await mcpClient.apply(ctx, {
    transport: "stdio",
    serverName: "fqgate",
    command: process.execPath,
    args: [launcherPath],
    env: explicitEnvironment,
    cwd: dirname(launcherPath),
    toolCallTimeoutMs: 120_000,
    failOnStartupError: false,
    reconnect: {
      enabled: true,
      initialDelayMs: 500,
      maxDelayMs: 30_000,
      maxAttempts: 10
    }
  });
}
