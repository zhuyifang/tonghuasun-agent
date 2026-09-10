import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertFqgateVersionCompatible,
  configPathFor,
  discoverExecutable,
  probeFqgate,
  readCompatibilityManifest,
  readConfig,
  validateMcpUrl,
  writeConfig
} from "../runtime/fqgate-config.mjs";

test("配置位置按平台隔离", () => {
  assert.equal(
    configPathFor({ env: { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" }, platform: "win32" }),
    "C:\\Users\\tester\\AppData\\Local\\fqgate\\agent-plugin.json"
  );
  assert.equal(
    configPathFor({ env: { HOME: "/Users/tester" }, platform: "darwin" }),
    "/Users/tester/Library/Application Support/fqgate/agent-plugin.json"
  );
});

test("MCP 地址只能使用无凭据的本机 /mcp", () => {
  assert.equal(validateMcpUrl("http://127.0.0.1:17281/mcp"), "http://127.0.0.1:17281/mcp");
  for (const value of [
    "https://127.0.0.1:17281/mcp",
    "http://192.168.1.10:17281/mcp",
    "http://127.0.0.1:17281/openapi.json",
    "http://127.0.0.1:17281/mcp?token=secret"
  ]) {
    assert.throws(() => validateMcpUrl(value));
  }
});

test("共享配置可以原子写入并重新读取", () => {
  const root = mkdtempSync(join(tmpdir(), "fqgate-agent-config-"));
  try {
    const configPath = join(root, "agent-plugin.json");
    const written = writeConfig(
      {
        executablePath: process.execPath,
        mcpUrl: "http://localhost:17281/mcp",
        fqgateVersion: "0.1.0"
      },
      configPath
    );
    const reread = readConfig(configPath);
    assert.equal(reread.executablePath, process.execPath);
    assert.equal(reread.mcpUrl, "http://localhost:17281/mcp");
    assert.equal(reread.fqgateVersion, "0.1.0");
    assert.match(readFileSync(configPath, "utf8"), /"schemaVersion": 1/);
    assert.equal(discoverExecutable({ explicitPath: process.execPath }), process.execPath);
    assert.equal(written.schemaVersion, 1);

    writeConfig(
      {
        executablePath: process.execPath,
        mcpUrl: "http://127.0.0.1:17282/mcp",
        fqgateVersion: "0.1.1"
      },
      configPath
    );
    assert.equal(readConfig(configPath).mcpUrl, "http://127.0.0.1:17282/mcp");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("运行时从公共清单执行 FQGate 版本边界", () => {
  const compatibility = readCompatibilityManifest();
  assert.equal(compatibility.minimumVersion, "0.1.0");
  assert.equal(compatibility.maximumVersionExclusive, "0.2.0");
  assert.equal(assertFqgateVersionCompatible("0.1.0", compatibility), true);
  assert.equal(assertFqgateVersionCompatible("0.1.99-dev.1", compatibility), true);
  assert.throws(() => assertFqgateVersionCompatible("0.0.99", compatibility), /不在支持范围/);
  assert.throws(() => assertFqgateVersionCompatible("0.2.0", compatibility), /不在支持范围/);
});

test("状态探针统计全部 MCP 工具分页", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    if (options.method === "GET") return new Response("{}", { status: 200 });
    const request = JSON.parse(options.body);
    if (request.method === "initialize") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: request.id,
        result: { serverInfo: { name: "fqgate", version: "0.1.0" } }
      });
    }
    const cursor = request.params.cursor;
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: cursor
        ? { tools: [{ name: "fqgate_market_quote" }] }
        : { tools: [{ name: "fqgate_market_market_health" }], nextCursor: "1" }
    });
  };

  const result = await probeFqgate("http://127.0.0.1:17281/mcp", { fetchImpl: fakeFetch });
  assert.equal(result.healthReachable, true);
  assert.equal(result.mcpReachable, true);
  assert.equal(result.serverVersion, "0.1.0");
  assert.equal(result.toolCount, 2);
  assert.equal(calls.length, 4);
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
