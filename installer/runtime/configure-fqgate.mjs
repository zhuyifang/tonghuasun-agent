#!/usr/bin/env node
import { existsSync } from "node:fs";
import {
  DEFAULT_MCP_URL,
  assertFqgateVersionCompatible,
  configPathFor,
  discoverExecutable,
  formatError,
  probeFqgate,
  readCompatibilityManifest,
  readConfig,
  readFqgateVersion,
  removeConfig,
  validateMcpUrl,
  writeConfig
} from "./fqgate-config.mjs";

await main().catch((error) => {
  console.error(`FQGate 配置失败：${formatError(error)}`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configPath = configPathFor();
  const compatibility = readCompatibilityManifest();

  if (options.command === "uninstall") {
    const removed = removeConfig(configPath);
    print({ command: "uninstall", configPath, removed }, options.json);
    return;
  }

  let existing = null;
  try {
    existing = readConfig(configPath);
  } catch (error) {
    if (options.command !== "configure") throw error;
  }
  const executablePath = discoverExecutable({
    explicitPath: options.fqgatePath,
    configuredPath: existing?.executablePath
  });
  const mcpUrl = validateMcpUrl(options.mcpUrl || existing?.mcpUrl || process.env.FQGATE_MCP_URL || DEFAULT_MCP_URL);

  if (options.command === "configure") {
    if (!executablePath) {
      throw new Error("未找到 FQGate。请使用 --fqgate-path 指定 fqgate.exe 或 FQGate.app 内的可执行文件。");
    }
    const fqgateVersion = readFqgateVersion(executablePath);
    assertFqgateVersionCompatible(fqgateVersion, compatibility);
    const config = writeConfig({ executablePath, mcpUrl, fqgateVersion }, configPath);
    const probe = await probeFqgate(mcpUrl);
    print({ command: "configure", configPath, configured: true, ...config, ...probe }, options.json);
    return;
  }

  const fqgateVersion = executablePath ? readFqgateVersion(executablePath) : null;
  const fqgateCompatible = fqgateVersion
    ? isCompatible(fqgateVersion, compatibility)
    : false;
  const probe = await probeFqgate(mcpUrl);
  print({
    command: "status",
    configPath,
    configured: existsSync(configPath),
    executablePath,
    executableFound: Boolean(executablePath),
    fqgateVersion,
    fqgateCompatible,
    supportedFqgateRange: `${compatibility.minimumVersion}..<${compatibility.maximumVersionExclusive}`,
    mcpUrl,
    ...probe
  }, options.json);
}

function isCompatible(version, compatibility) {
  try {
    return assertFqgateVersionCompatible(version, compatibility);
  } catch {
    return false;
  }
}

function parseArguments(args) {
  const options = { command: "status", fqgatePath: null, mcpUrl: null, json: false };
  if (args[0] && !args[0].startsWith("--")) options.command = args.shift();
  if (!new Set(["configure", "status", "uninstall"]).has(options.command)) {
    throw new Error(`未知命令：${options.command}`);
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    const value = args[++index];
    if (!value) throw new Error(`${argument} 缺少参数值。`);
    if (argument === "--fqgate-path") options.fqgatePath = value;
    else if (argument === "--mcp-url") options.mcpUrl = value;
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    console.log(`${key}=${item === null ? "" : typeof item === "object" ? JSON.stringify(item) : item}`);
  }
}
