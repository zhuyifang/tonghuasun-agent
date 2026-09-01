import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const adapterRoot = resolve("..", "..", "doubao");
const commonSkillPath = resolve(
  "..",
  "distribution",
  "skills",
  "tonghuasun-agent",
  "SKILL.md",
);
const adapterGuidancePath = resolve(
  adapterRoot,
  "skills",
  "tonghuasun-agent",
  "ADAPTER.md",
);

test("豆包入口提供统一安装脚本、连接器和技能说明", () => {
  const readme = readFileSync(resolve(adapterRoot, "README.md"), "utf8");
  const buildScript = readFileSync(resolve(adapterRoot, "..", "Build-Distribution.ps1"), "utf8");
  const proxyPath = resolve(adapterRoot, "scripts", "tonghuasun-mcp-proxy.ps1");
  const manifestPath = resolve(adapterRoot, "plugin.json");
  const installerPath = resolve(adapterRoot, "install.ps1");
  const setupPath = resolve(adapterRoot, "setup.ps1");

  assert.equal(existsSync(commonSkillPath), true);
  assert.equal(existsSync(adapterGuidancePath), true);
  assert.equal(existsSync(proxyPath), false);
  assert.equal(existsSync(manifestPath), true);
  assert.equal(existsSync(installerPath), true);
  assert.equal(existsSync(setupPath), true);
  assert.match(readme, /一句话安装/);
  assert.match(readme, /直接运行这个目录中的 `setup\.ps1`/);
  assert.match(readme, /每个新工作任务仍需选中该连接器/);
  assert.match(readme, /只在本次安装任务中选择“全部允许”/);
  assert.match(readme, /查询成功即停止/);
  assert.match(readme, /连接方式：HTTP/);
  assert.match(readme, /http:\/\/127\.0\.0\.1:17180\/mcp/);
  assert.match(readme, /X-Tonghuasun-Codex-Token/);
  assert.match(readme, /localAccessToken/);
  assert.doesNotMatch(readme, /STDIO|powershell\.exe|tonghuasun-mcp-proxy\.ps1/);
  assert.match(buildScript, /Assert-DoubaoPackage/);
  assert.match(buildScript, /Copy-ReleaseTree \(Join-Path \$coreRoot "legal"\) \$DestinationPath @\("README\.md"\)/);
});

test("豆包安装器复用当前版本并安全写入用户技能目录", () => {
  const installer = readFileSync(resolve(adapterRoot, "install.ps1"), "utf8");
  const setup = readFileSync(resolve(adapterRoot, "setup.ps1"), "utf8");

  assert.match(installer, /Doubao\\User Data/);
  assert.match(installer, /\.user_skills\\tonghuasun-agent/);
  assert.match(installer, /已有同名技能且内容不同，未覆盖/);
  assert.match(installer, /Test-LegacyTonghuasunSkill/);
  assert.match(installer, /TonghuasunCodex\\agents\\doubao/);
  assert.match(setup, /http:\/\/127\.0\.0\.1:17180\/health/);
  assert.match(setup, /scripts\\configure\.mjs/);
  assert.match(setup, /install\.ps1/);
  assert.match(setup, /sandbox_runtime\\bases/);
});

test("豆包技能要求优先调用本机同花顺数据", () => {
  const skill = `${readFileSync(commonSkillPath, "utf8")}\n${readFileSync(adapterGuidancePath, "utf8")}`;

  assert.match(skill, /必须通过名为“同花顺 Agent”的连接器/);
  assert.match(skill, /不得用豆包内置金融数据源、Wind 或网络搜索/);
  assert.match(skill, /ths_order_flow/);
  assert.match(skill, /用户指定多少条就传多少/);
  assert.match(skill, /接口文档 `http:\/\/127\.0\.0\.1:17180\/docs`/);
});
