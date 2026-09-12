import assert from "node:assert/strict";
import test from "node:test";

import { compareVersions, incrementVersion, resolveReleaseVersion, versionParts } from "./versioning.mjs";


test("严格解析并比较语义版本", () => {
  assert.deepEqual(versionParts("0.1.1"), [0, 1, 1]);
  assert.equal(compareVersions("1.0.0", "0.1.1"), 1);
  assert.throws(() => versionParts("01.0.0"), /严格语义版本/);
  assert.throws(() => versionParts("1.0.0-rc.1"), /严格语义版本/);
});

test("自动计算 patch minor major", () => {
  assert.equal(incrementVersion("0.1.1", "patch"), "0.1.2");
  assert.equal(incrementVersion("0.1.1", "minor"), "0.2.0");
  assert.equal(incrementVersion("0.1.1", "major"), "1.0.0");
  assert.equal(incrementVersion("1.4.9", "major"), "2.0.0");
});

test("1.0.0 是显式版本决策，不推断兼容关系", () => {
  assert.equal(resolveReleaseVersion("0.1.1", "major"), "1.0.0");
  assert.equal(resolveReleaseVersion("0.1.1", "custom", "1.0.0"), "1.0.0");
});

test("自定义版本必须高于当前版本且不能与自动类型混用", () => {
  assert.equal(resolveReleaseVersion("1.2.3", "custom", "1.5.0"), "1.5.0");
  assert.throws(() => resolveReleaseVersion("1.2.3", "custom", "1.2.3"), /必须高于/);
  assert.throws(() => resolveReleaseVersion("1.2.3", "custom"), /必须填写/);
  assert.throws(() => resolveReleaseVersion("1.2.3", "patch", "1.2.4"), /只有选择 custom/);
});
