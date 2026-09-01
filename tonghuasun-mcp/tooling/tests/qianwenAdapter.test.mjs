import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const adapterRoot = resolve("..", "..", "qianwen");
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

test("千问入口同时提供 MCP、技能和安装器", () => {
  const manifest = JSON.parse(readFileSync(resolve(adapterRoot, "plugin.json"), "utf8"));
  const manifestText = readFileSync(resolve(adapterRoot, "plugin.json"), "utf8");
  const readme = readFileSync(resolve(adapterRoot, "README.md"), "utf8");
  const installerPath = resolve(adapterRoot, "install.ps1");
  const setupPath = resolve(adapterRoot, "setup.ps1");

  assert.equal(manifest.apiVersion, "qwen-agent/plugin/v1");
  assert.equal(manifest.id, "tonghuasun-agent");
  assert.equal(manifest.version, "0.2.13");
  assert.equal(existsSync(installerPath), true);
  assert.equal(existsSync(setupPath), true);
  assert.equal(existsSync(commonSkillPath), true);
  assert.equal(existsSync(adapterGuidancePath), true);
  assert.match(manifestText, /\$\{QWEN_PLUGIN_ROOT\}/);
  assert.match(manifestText, /TONGHUASUN_MCP_TEXT_COMPATIBILITY/);
  assert.match(readme, /tonghuasun-agent-qianwen-版本号\.zip/);
  assert.match(readme, /工作任务/);
  assert.match(readme, /setup\.ps1/);
});

test("千问统一安装入口会先检查本机接口并避免重复配置", () => {
  const setup = readFileSync(resolve(adapterRoot, "setup.ps1"), "utf8");

  assert.match(setup, /http:\/\/127\.0\.0\.1:17180\/health/);
  assert.match(setup, /hasDataAccessor/);
  assert.match(setup, /本机同花顺接口已是当前版本，无需重复配置/);
  assert.match(setup, /scripts\\configure\.mjs/);
  assert.match(setup, /install\.ps1/);
  assert.match(setup, /AgentRuntime|重新加载工具/);
});

test("千问安装器保留现有配置并注册本机 MCP", () => {
  const installer = readFileSync(resolve(adapterRoot, "install.ps1"), "utf8");
  const skill = `${readFileSync(commonSkillPath, "utf8")}\n${readFileSync(adapterGuidancePath, "utf8")}`;

  assert.match(installer, /Qianwen\\User Data\\qwen-agent/);
  assert.match(installer, /mcpServers/);
  assert.match(installer, /resources\\bins\\node\.exe/);
  assert.match(installer, /tonghuasun-mcp-proxy\.mjs/);
  assert.match(installer, /Write-JsonUtf8IfChanged/);
  assert.match(installer, /Test-CurrentMcpEntry/);
  assert.match(installer, /Test-CurrentSkill/);
  assert.match(skill, /不得用千问内置金融数据源/);
  assert.match(skill, /用户指定多少条就传多少/);
});

test("重复安装同一版本时不改写千问运行配置", { skip: process.platform !== "win32" }, () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "tonghuasun-qianwen-"));
  try {
    const packageRoot = resolve(temporaryRoot, "package");
    const packageSkillRoot = resolve(packageRoot, "skills", "tonghuasun-agent");
    mkdirSync(resolve(packageRoot, "scripts"), { recursive: true });
    mkdirSync(packageSkillRoot, { recursive: true });
    copyFileSync(resolve(adapterRoot, "install.ps1"), resolve(packageRoot, "install.ps1"));
    copyFileSync(resolve(adapterRoot, "plugin.json"), resolve(packageRoot, "plugin.json"));
    copyFileSync(
      resolve("..", "distribution", "scripts", "tonghuasun-mcp-proxy.mjs"),
      resolve(packageRoot, "scripts", "tonghuasun-mcp-proxy.mjs"),
    );
    writeFileSync(
      resolve(packageSkillRoot, "SKILL.md"),
      `${readFileSync(commonSkillPath, "utf8").trimEnd()}\n\n${readFileSync(adapterGuidancePath, "utf8").trim()}\n`,
    );

    const agentRoot = resolve(temporaryRoot, "Qianwen", "User Data", "qwen-agent");
    const accountRoot = resolve(agentRoot, "test-account");
    const nodePath = resolve(agentRoot, "resources", "bins", "node.exe");
    mkdirSync(resolve(accountRoot, "skills"), { recursive: true });
    mkdirSync(resolve(nodePath, ".."), { recursive: true });
    writeFileSync(resolve(accountRoot, "projects.json"), "{}\n");
    writeFileSync(nodePath, "test node placeholder\n");

    const runInstaller = () =>
      spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          resolve(packageRoot, "install.ps1"),
        ],
        {
          cwd: packageRoot,
          encoding: "utf8",
          env: { ...process.env, LOCALAPPDATA: temporaryRoot },
        },
      );

    const first = runInstaller();
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const mcpPath = resolve(accountRoot, "mcp.json");
    const skillPath = resolve(accountRoot, "skills", "tonghuasun-agent", "SKILL.md");
    const firstMcpTime = statSync(mcpPath).mtimeMs;
    const firstSkillTime = statSync(skillPath).mtimeMs;

    const second = runInstaller();
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /没有重复改写配置/);
    assert.equal(statSync(mcpPath).mtimeMs, firstMcpTime);
    assert.equal(statSync(skillPath).mtimeMs, firstSkillTime);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
