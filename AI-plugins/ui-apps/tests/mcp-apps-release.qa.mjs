import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { assertStableBundleVersion, loadSigningPrivateKey, verifyRelease } from "../scripts/mcp-apps-lib.mjs";

for (const invalidVersion of ["1.0.0-beta.1", "1.0.0-rc.1"]) {
  try {
    assertStableBundleVersion(invalidVersion);
    throw new Error(`稳定通道错误接受了预发行版本：${invalidVersion}`);
  } catch (error) {
    if (!String(error.message).includes("稳定通道不能发布预发行版本")) throw error;
  }
}
assertStableBundleVersion("1.0.0");

await loadSigningPrivateKey({ environment: {} }).then(
  () => {
    throw new Error("正式发布缺少签名私钥时必须失败。");
  },
  (error) => {
    if (!String(error.message).includes("正式发布必须提供 Ed25519 私钥")) throw error;
  }
);

const configuredPrivateKeyPath = process.env.FQGATE_MCP_APPS_TEST_PRIVATE_KEY_FILE;
const configuredPublicKeyPath = process.env.FQGATE_MCP_APPS_TEST_PUBLIC_KEY_FILE;
if (Boolean(configuredPrivateKeyPath) !== Boolean(configuredPublicKeyPath)) {
  throw new Error("正式密钥验收必须同时指定私钥和公钥文件。 ");
}
const generatedKeys = configuredPrivateKeyPath ? undefined : generateKeyPairSync("ed25519");
const privateKeyPem = configuredPrivateKeyPath
  ? await readFile(resolve(configuredPrivateKeyPath), "utf8")
  : generatedKeys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = configuredPublicKeyPath
  ? createPublicKey(await readFile(resolve(configuredPublicKeyPath), "utf8"))
  : generatedKeys.publicKey;
if (createPrivateKey(privateKeyPem).asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
  throw new Error("签名验收只接受 Ed25519 密钥对。 ");
}
const releaseRoot = await mkdtemp(resolve(tmpdir(), "fqgate-mcp-apps-release-"));
try {
  const release = spawnSync(
    process.execPath,
    ["scripts/release-mcp-apps.mjs", "--output", releaseRoot],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, FQGATE_MCP_APPS_ED25519_PRIVATE_KEY: privateKeyPem }
    }
  );
  if (release.status !== 0) {
    throw new Error(`MCP Apps 正式发布失败：${release.stderr || release.stdout}`);
  }

  const stablePath = resolve(releaseRoot, "stable.json");
  const stableBytes = await readFile(stablePath);
  const stable = JSON.parse(stableBytes.toString("utf8"));
  if (JSON.stringify(Object.keys(stable)) !== JSON.stringify([
    "schemaVersion",
    "component",
    "channel",
    "bundleVersion",
    "manifest"
  ])) {
    throw new Error("stable.json 不是约定的最小指针。 ");
  }
  verifyDetachedSignature(stableBytes, await readFile(resolve(releaseRoot, "stable.sig"), "utf8"), publicKey);

  const manifestPath = resolve(releaseRoot, stable.manifest);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  verifyDetachedSignature(
    manifestBytes,
    await readFile(resolve(dirname(manifestPath), "manifest.sig"), "utf8"),
    publicKey
  );
  for (const app of manifest.apps) {
    if (["permissions", "appOnly", "csp", "connectDomains"].some((field) => field in app)) {
      throw new Error(`${app.id} 正式清单包含越权配置。`);
    }
    await readFile(resolve(dirname(manifestPath), app.file));
  }

  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  await verifyRelease({ releaseRoot, publicKeyPem });
  const changedAppPath = resolve(dirname(manifestPath), manifest.apps[0].file);
  await writeFile(changedAppPath, "<!doctype html><title>changed</title>", "utf8");
  await verifyRelease({ releaseRoot, publicKeyPem }).then(
    () => {
      throw new Error("发布包页面被修改后必须校验失败。 ");
    },
    (error) => {
      if (!String(error.message).includes("应用文件校验失败")) throw error;
    }
  );
} finally {
  await rm(releaseRoot, { recursive: true, force: true });
}

process.stdout.write("MCP Apps 正式发布与 Ed25519 签名验收通过。\n");

function verifyDetachedSignature(bytes, encodedSignature, key) {
  const signature = Buffer.from(encodedSignature.trim(), "base64");
  if (signature.byteLength !== 64) throw new Error("detached signature 必须是 64 字节 Ed25519 签名。 ");
  if (!verify(null, bytes, key, signature)) throw new Error("detached signature 验证失败。 ");
}
