import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const compatibility = readJson("fqgate", "compatibility.json");
const agentVersion = compatibility.agentVersion;
const displayName = "同花顺免费开源AI插件FQGate";

const manifests = [
  ["codex", ".codex-plugin", "plugin.json"],
  ["claude-code", ".claude-plugin", "plugin.json"],
  ["workbuddy", ".codebuddy-plugin", "plugin.json"],
  ["zcode", ".zcode-plugin", "plugin.json"],
  ["openclaw", "plugin.json"],
  ["doubao", "plugin.json"],
  ["qianwen", "plugin.json"],
  ["deepseek-harness", "package.json"]
];

function pathInRepository(...segments) {
  return join(repositoryRoot, ...segments);
}

function readText(...segments) {
  return readFileSync(pathInRepository(...segments), "utf8");
}

function readJson(...segments) {
  return JSON.parse(readText(...segments));
}

test("八个适配器与兼容清单使用同一 Agent 版本", () => {
  assert.equal(agentVersion, "0.3.0");
  assert.equal(compatibility.fqgate.minimumVersion, "0.1.0");
  assert.equal(compatibility.fqgate.maximumVersionExclusive, "0.2.0");

  for (const [adapter, ...manifestPath] of manifests) {
    const manifest = readJson("AI-plugins", adapter, ...manifestPath);
    assert.equal(manifest.version, agentVersion, `${adapter} 版本不一致`);
  }
});

test("STDIO 适配器统一调用 FQGate 原生启动器", () => {
  const configPaths = [
    ["codex", ".mcp.json"],
    ["claude-code", ".mcp.json"],
    ["workbuddy", ".mcp.json"],
    ["zcode", ".mcp.json"],
    ["openclaw", "mcp.json"],
    ["qianwen", "plugin.json"]
  ];

  for (const [adapter, configName] of configPaths) {
    const text = readText("AI-plugins", adapter, configName);
    assert.match(text, /fqgate/i, `${adapter} 未声明 FQGate`);
    assert.match(text, /launch-fqgate-mcp\.mjs/, `${adapter} 未使用公共启动器`);
    assert.doesNotMatch(text, /tonghuasun-mcp-proxy\.mjs/, `${adapter} 仍引用旧代理`);
  }

  const launcher = readText("installer", "runtime", "launch-fqgate-mcp.mjs");
  assert.match(launcher, /--mcp-stdio/);
  assert.match(launcher, /--mcp-url/);
});

test("公共技能按职责拆分且全部存在", () => {
  const expectedSkills = ["configure-fqgate", "market-data", "account-query", "trade-execution"];
  for (const skill of expectedSkills) {
    assert.ok(existsSync(pathInRepository("skills", skill, "SKILL.md")), `缺少技能 ${skill}`);
  }

  const marketDataSkill = readText("skills", "market-data", "SKILL.md");
  assert.match(
    marketDataSkill,
    /数据来自“\[FQGate-免费本地同花顺数据源\]\(https:\/\/github\.com\/zhuyifang\/tonghuasun-agent\)”/,
    "行情文本回复缺少带 GitHub 链接的数据源署名"
  );
});

test("插件 ID、显示名称和品牌图标保持统一", () => {
  assert.ok(existsSync(pathInRepository("assets", "brand", "fqgate-app-icon.svg")));
  assert.ok(existsSync(pathInRepository("assets", "brand", "fqgate-app-icon.png")));

  const codex = readJson("AI-plugins", "codex", ".codex-plugin", "plugin.json");
  assert.equal(codex.name, "fqgate-agent");
  assert.equal(codex.interface.displayName, displayName);
  assert.equal(codex.interface.logo, "./assets/brand/fqgate-app-icon.svg");

  const claude = readJson("AI-plugins", "claude-code", ".claude-plugin", "plugin.json");
  const workbuddy = readJson("AI-plugins", "workbuddy", ".codebuddy-plugin", "plugin.json");
  const doubao = readJson("AI-plugins", "doubao", "plugin.json");
  const qianwen = readJson("AI-plugins", "qianwen", "plugin.json");
  const deepseek = readJson("AI-plugins", "deepseek-harness", "package.json");
  assert.equal(claude.name, "fqgate-agent");
  assert.equal(claude.displayName, displayName);
  assert.equal(workbuddy.name, "fqgate-agent");
  assert.equal(workbuddy.displayName, displayName);
  const workbuddyMcp = readJson("AI-plugins", "workbuddy", ".mcp.json");
  assert.equal(workbuddyMcp.mcpServers.fqgate["x-workbuddy"].displayName.zh, displayName);
  assert.equal(
    workbuddyMcp.mcpServers.fqgate["x-workbuddy"].icon,
    "./assets/brand/fqgate-app-icon.svg"
  );
  assert.equal(doubao.id, "fqgate-agent");
  assert.equal(doubao.name, displayName);
  assert.equal(doubao.icon, "./assets/brand/fqgate-app-icon.svg");
  assert.equal(qianwen.id, "fqgate-agent");
  assert.equal(qianwen.name, displayName);
  assert.equal(qianwen.icon, "./assets/brand/fqgate-app-icon.svg");
  assert.equal(deepseek.displayName, displayName);
  assert.equal(deepseek.icon, "./assets/brand/fqgate-app-icon.svg");
  assert.ok(deepseek.files.includes("assets/"));

  const openclaw = readJson("AI-plugins", "openclaw", "plugin.json");
  const zcode = readJson("AI-plugins", "zcode", ".zcode-plugin", "plugin.json");
  assert.equal(openclaw.name, "fqgate-agent");
  assert.equal(openclaw.extensions["io.github.zhuyifang.fqgate"].displayName, displayName);
  assert.equal(zcode.name, "fqgate-agent");
  assert.match(zcode.description, new RegExp(displayName));
});

test("V2 不重新引入旧 MCP 代理和私有原生载荷", () => {
  assert.equal(
    existsSync(pathInRepository("tonghuasun-mcp", "distribution", "scripts", "tonghuasun-mcp-proxy.mjs")),
    false
  );
  assert.equal(existsSync(pathInRepository("tonghuasun-mcp", "distribution", "payload")), false);
  assert.equal(existsSync(pathInRepository("fqgate", "src")), false);
  assert.equal(existsSync(pathInRepository("fqgate", "Cargo.toml")), false);
});

test("MCP Apps 构建产物只交给 FQGate，不复制进 Codex 插件", () => {
  const syncScript = readText("scripts", "Sync-FqgateUiApps.ps1");
  const appConfig = readJson("AI-plugins", "ui-apps", "mcp-apps", "apps.json");
  assert.equal(appConfig.apps.length, 5);
  assert.ok(appConfig.apps.some((app) => app.id === "information"));
  assert.match(syncScript, /npm[\s\S]*build:mcp-apps/);
  assert.match(syncScript, /manifest\.json/);
  assert.match(syncScript, /target\\debug\\mcp-apps/);
  assert.match(syncScript, /fqgate_mcp_apps_publish_complete=true/);
  assert.doesNotMatch(syncScript, /login\.html|candle\.html|information\.html|market-quotes\.html|order-flow\.html/);

  const releaseScript = readText("AI-plugins", "ui-apps", "scripts", "release-mcp-apps.mjs");
  assert.match(releaseScript, /loadSigningPrivateKey/);
  assert.doesNotMatch(releaseScript, /PRIVATE KEY-----/);

  const commonPackage = readText("scripts", "release", "Common.ps1");
  assert.doesNotMatch(commonPackage, /ui-apps/i);
  assert.doesNotMatch(commonPackage, /assets\\mcp-apps/i);
});

test("未发布 V2 不覆盖现有稳定渠道", () => {
  assert.equal(compatibility.release.status, "unpublished");
  assert.deepEqual(compatibility.release.packages, []);

  const stable = readJson("update", "stable.json");
  const claudeMarketplace = readJson(".claude-plugin", "marketplace.json");
  assert.equal(claudeMarketplace.plugins[0].version, stable.latestVersion);
  assert.notEqual(stable.latestVersion, agentVersion);
});
