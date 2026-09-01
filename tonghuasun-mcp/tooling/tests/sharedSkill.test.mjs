import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve("..", "..");
const commonSkillPath = resolve(
  repositoryRoot,
  "tonghuasun-mcp",
  "distribution",
  "skills",
  "tonghuasun-agent",
  "SKILL.md",
);
const adapters = [
  "codex",
  "claude-code",
  "workbuddy",
  "zcode",
  "openclaw",
  "deepseek-harness",
  "doubao",
  "qianwen",
];

test("所有 Agent 共用同一份 MCP 使用规范", () => {
  const commonSkill = readFileSync(commonSkillPath, "utf8");
  assert.match(commonSkill, /ths_order_flow/);
  assert.match(commonSkill, /用户指定多少条就传多少/);
  assert.match(commonSkill, /127\.0\.0\.1:17180\/docs/);
  assert.match(commonSkill, /volclass.*不是委托量级/s);
  assert.match(commonSkill, /只调用 `ths_stock_brief`/);
  assert.match(commonSkill, /不要再调用完整快照、REST API 或接口文档做重复验证/);

  for (const adapter of adapters) {
    const adapterRoot = resolve(repositoryRoot, adapter);
    const guidancePath = resolve(
      adapterRoot,
      "skills",
      "tonghuasun-agent",
      "ADAPTER.md",
    );
    const copiedSkillPath = resolve(
      adapterRoot,
      "skills",
      "tonghuasun-agent",
      "SKILL.md",
    );
    assert.equal(existsSync(guidancePath), true, `${adapter} 应只维护专属适配片段`);
    assert.equal(existsSync(copiedSkillPath), false, `${adapter} 不应复制公共技能全文`);
    const guidance = readFileSync(guidancePath, "utf8");
    assert.doesNotMatch(guidance, /## 工具选择|## Level2 口径|## 原始字段/);
  }
});

test("发行脚本为所有 Agent 合成公共技能与专属片段", () => {
  const buildScript = readFileSync(resolve(repositoryRoot, "Build-Distribution.ps1"), "utf8");
  assert.match(buildScript, /function Merge-AdapterSkill/);
  for (const adapter of [
    "Codex",
    "Claude Code",
    "WorkBuddy",
    "ZCode",
    "OpenClaw",
    "DeepSeek Harness",
    "豆包",
    "千问",
  ]) {
    assert.match(buildScript, new RegExp(`Merge-AdapterSkill \\$[A-Za-z]+Stage "${adapter}"`));
  }
});
