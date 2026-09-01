import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const installerPath = resolve("dist", "installer.js");

test("configure --check 只预检并返回宿主兼容错误码", () => {
  const root = mkdtempSync(join(tmpdir(), "tonghuasun-installer-check-"));
  try {
    const productHome = join(root, "product");
    const thsRoot = join(root, "ths");
    const binPath = join(thsRoot, "bin");
    const payloadPath = join(root, "payload");
    mkdirSync(binPath, { recursive: true });
    mkdirSync(payloadPath, { recursive: true });
    writeFileSync(join(binPath, "happ.exe"), "not-a-real-executable");
    writeFileSync(join(payloadPath, "ThsPlugin.Plugin.dll"), "plugin");

    const result = runInstaller(
      ["configure", "--check", "--json", "--ths-path", thsRoot, "--payload", payloadPath],
      productHome,
    );
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.match(body.hostCompatibility.code, /^(unsupported_client|client_version_unreadable)$/);
    assert.throws(() => readFileSync(join(productHome, "config.json")), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("找不到客户端时以 JSON 返回 client_not_found", () => {
  const root = mkdtempSync(join(tmpdir(), "tonghuasun-installer-missing-"));
  try {
    const result = runInstaller(
      ["configure", "--check", "--json", "--ths-path", join(root, "missing")],
      join(root, "product"),
    );
    assert.equal(result.status, 1);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "client_not_found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("卸载预检和保留旧状态均不修改本机文件", () => {
  const root = mkdtempSync(join(tmpdir(), "tonghuasun-uninstall-check-"));
  try {
    const productHome = join(root, "product");
    const configPath = join(productHome, "config.json");
    const legacyStatePath = join(productHome, "account.dat");
    mkdirSync(productHome, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ mappings: [] }));
    writeFileSync(legacyStatePath, "legacy-state");

    const result = runInstaller(
      ["uninstall", "--dry-run", "--keep-legacy-state", "--json"],
      productHome,
    );
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.dryRun, true);
    assert.equal(body.legacyStatePreserved, true);
    assert.equal(readFileSync(configPath, "utf8"), JSON.stringify({ mappings: [] }));
    assert.equal(readFileSync(legacyStatePath, "utf8"), "legacy-state");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("安装器只登记本机和私有局域网地址", () => {
  const source = readFileSync(resolve("src", "installer.ts"), "utf8");

  assert.match(source, /http:\/\/\$\{address\}:\$\{port\}\//);
  assert.match(source, /remoteip=LocalSubnet/);
  assert.match(source, /profile=private,domain/);
  assert.match(source, /isIdempotentFirewallDelete/);
  assert.match(source, /-Wait -PassThru `\s*\n\s*\+ `-ArgumentList/);
  assert.match(source, /\["http", "delete", "urlacl", `url=\$\{legacyWildcardPrefix\}`\]/);
  assert.doesNotMatch(source, /\["http", "add", "urlacl", `url=\$\{legacyWildcardPrefix\}`\]/);
});

function runInstaller(args, productHome) {
  return spawnSync(process.execPath, [installerPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TONGHUASUN_AGENT_HOME: productHome,
    },
    encoding: "utf8",
    windowsHide: true,
  });
}
