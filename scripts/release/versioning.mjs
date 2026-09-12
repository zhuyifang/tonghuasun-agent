export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function versionParts(value) {
  const match = versionPattern.exec(value);
  if (!match) throw new Error(`版本号必须是严格语义版本：${value}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function incrementVersion(currentVersion, bump) {
  const [major, minor, patch] = versionParts(currentVersion);
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "major") return `${major + 1}.0.0`;
  throw new Error(`自动升级类型无效：${bump}`);
}

export function resolveReleaseVersion(currentVersion, bump, customVersion = "") {
  versionParts(currentVersion);
  if (!new Set(["patch", "minor", "major", "custom"]).has(bump)) {
    throw new Error(`发布类型无效：${bump}`);
  }
  if (bump === "custom") {
    if (!customVersion) throw new Error("选择 custom 时必须填写指定版本。");
    versionParts(customVersion);
    if (compareVersions(customVersion, currentVersion) <= 0) {
      throw new Error(`指定版本必须高于当前版本：${currentVersion}`);
    }
    return customVersion;
  }
  if (customVersion) throw new Error("只有选择 custom 时才能填写指定版本。");
  return incrementVersion(currentVersion, bump);
}
