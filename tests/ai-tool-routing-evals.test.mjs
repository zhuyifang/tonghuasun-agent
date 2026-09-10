import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixturePath = join(repositoryRoot, "tests", "fixtures", "ai-tool-routing-evals.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const appConfig = readJson("AI-plugins", "ui-apps", "mcp-apps", "apps.json");
const skillNames = new Set(
  readdirSync(join(repositoryRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(repositoryRoot, "skills", entry.name, "SKILL.md")))
    .map((entry) => entry.name)
);

const expectedCategories = [
  "market",
  "chart",
  "information",
  "level2",
  "account",
  "login",
  "trade",
  "failure",
  "ui"
];

const uiBindings = {
  login: {
    path: "/v1/market/session/qr/begin",
    tool: "fqgate_market_qr_login_begin"
  },
  candle: {
    path: "/v1/market/history/klines",
    tool: "fqgate_market_klines"
  },
  information: {
    path: "/v1/market/information/news",
    tool: "fqgate_market_news"
  },
  "market-quotes": {
    path: "/v1/market/realtime/cn",
    tool: "fqgate_market_market_data_cn"
  },
  "order-flow": {
    path: "/v1/market/level2/orders",
    tool: "fqgate_market_level2_orders"
  }
};

function readText(...segments) {
  return readFileSync(join(repositoryRoot, ...segments), "utf8");
}

function readJson(...segments) {
  return JSON.parse(readText(...segments));
}

function flattenedTools(entry) {
  return entry.expectedTools.sequences.flat();
}

test("路由评测集结构完整且规模适合首轮回归", () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.ok(typeof fixture.name === "string" && fixture.name.length > 0);
  assert.ok(fixture.cases.length >= 60 && fixture.cases.length <= 100);

  const ids = new Set();
  const forbiddenNames = new Set(Object.keys(fixture.forbiddenBehaviors));
  for (const entry of fixture.cases) {
    assert.match(entry.id, /^[a-z0-9]+-\d{3}$/);
    assert.ok(!ids.has(entry.id), `评测编号重复：${entry.id}`);
    ids.add(entry.id);
    assert.ok(expectedCategories.includes(entry.category), `${entry.id} 分类无效`);
    assert.ok(typeof entry.prompt === "string" && entry.prompt.length >= 8, `${entry.id} 请求过短`);
    assert.match(entry.prompt, /[\u3400-\u9fff]/, `${entry.id} 不是面向用户的自然语言请求`);
    assert.ok(skillNames.has(entry.expectedSkill), `${entry.id} 引用了不存在的技能`);
    assert.ok(["ordered", "oneOf", "none"].includes(entry.expectedTools?.mode), `${entry.id} 工具模式无效`);
    assert.ok(Array.isArray(entry.expectedTools?.sequences), `${entry.id} 缺少工具序列`);
    if (entry.expectedTools.mode === "none") {
      assert.deepEqual(entry.expectedTools.sequences, [], `${entry.id} 无工具场景不应保留序列`);
    } else {
      assert.ok(entry.expectedTools.sequences.length > 0, `${entry.id} 缺少候选工具序列`);
      assert.ok(entry.expectedTools.sequences.every((sequence) => sequence.length > 0), `${entry.id} 存在空序列`);
    }
    if (entry.expectedTools.mode === "ordered") {
      assert.equal(entry.expectedTools.sequences.length, 1, `${entry.id} 有序模式只能有一条序列`);
    }
    if (entry.expectedTools.mode === "oneOf") {
      assert.ok(entry.expectedTools.sequences.length >= 2, `${entry.id} 候选模式至少需要两条序列`);
    }
    assert.ok(entry.expectedUi === null || typeof entry.expectedUi === "string", `${entry.id} UI 引用无效`);
    assert.ok(Array.isArray(entry.forbidden) && entry.forbidden.length > 0, `${entry.id} 缺少禁止行为`);
    for (const behavior of entry.forbidden) {
      assert.ok(forbiddenNames.has(behavior), `${entry.id} 引用了未定义的禁止行为：${behavior}`);
    }
  }
});

test("评测中的技能存在且工具名格式有效", () => {
  const usedSkills = new Set();
  for (const entry of fixture.cases) {
    usedSkills.add(entry.expectedSkill);
    for (const tool of flattenedTools(entry)) {
      assert.match(tool, /^fqgate_[a-z0-9_]+$/, `${entry.id} 工具名格式无效：${tool}`);
    }
  }
  assert.deepEqual([...usedSkills].sort(), [...skillNames].sort());
});

test("九类请求都有代表性覆盖，关键安全边界不会缺失", () => {
  const counts = new Map(expectedCategories.map((category) => [category, 0]));
  const usedForbidden = new Set();
  for (const entry of fixture.cases) {
    counts.set(entry.category, counts.get(entry.category) + 1);
    entry.forbidden.forEach((behavior) => usedForbidden.add(behavior));
  }
  for (const [category, count] of counts) {
    assert.ok(count >= 6, `${category} 仅有 ${count} 条，覆盖不足`);
  }
  for (const behavior of [
    "use-web-or-other-source",
    "downgrade-permission-data",
    "ask-secrets-in-chat",
    "execute-without-confirmation",
    "retry-write-automatically",
    "perform-batch-or-unattended-trading",
    "treat-snapshot-as-stream"
  ]) {
    assert.ok(usedForbidden.has(behavior), `关键禁止行为没有评测覆盖：${behavior}`);
  }
  assert.ok(fixture.cases.some((entry) => entry.expectedTools.mode === "oneOf"));
  assert.ok(fixture.cases.some((entry) => entry.expectedTools.mode === "none"));
});

test("界面引用与 MCP Apps 清单及入口工具一致", () => {
  const appsById = new Map(appConfig.apps.map((app) => [app.id, app]));
  assert.deepEqual([...appsById.keys()].sort(), Object.keys(uiBindings).sort());

  for (const [appId, binding] of Object.entries(uiBindings)) {
    assert.ok(appsById.get(appId).toolPaths.includes(binding.path), `${appId} 缺少入口路径 ${binding.path}`);
  }

  const usedUi = new Set();
  for (const entry of fixture.cases) {
    if (entry.expectedUi === null) continue;
    usedUi.add(entry.expectedUi);
    const binding = uiBindings[entry.expectedUi];
    assert.ok(binding, `${entry.id} 引用了不存在的界面：${entry.expectedUi}`);
    assert.ok(flattenedTools(entry).includes(binding.tool), `${entry.id} 的工具不能打开 ${entry.expectedUi}`);
  }
  assert.deepEqual([...usedUi].sort(), Object.keys(uiBindings).sort());
});

test("交易写调用只出现在已经明确确认的评测请求中", () => {
  const writeTools = new Set([
    "fqgate_trade_place_order",
    "fqgate_trade_cancel",
    "fqgate_trade_subscribe_ipo",
    "fqgate_trade_transfer_bank",
    "fqgate_trade_transfer_collateral"
  ]);
  for (const entry of fixture.cases) {
    if (!flattenedTools(entry).some((tool) => writeTools.has(tool))) continue;
    assert.equal(entry.expectedSkill, "trade-execution");
    assert.match(entry.prompt, /确认/);
    assert.ok(entry.forbidden.includes("change-confirmed-parameters"));
    assert.ok(entry.forbidden.includes("reuse-operation-id"));
  }
});
