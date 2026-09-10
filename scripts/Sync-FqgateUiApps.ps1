<#
.SYNOPSIS
构建 MCP Apps，并发布到 FQGate 开发运行目录。

.DESCRIPTION
页面列表和文件校验全部来自构建生成的 manifest.json，不在此脚本重复维护。
默认输出到 FQGate 的 target\debug\mcp-apps；可用 -DestinationRoot 指定 FQGate
源码目录内的其他开发位置。

.EXAMPLE
.\scripts\Sync-FqgateUiApps.ps1 -SkipInstall
#>
[CmdletBinding()]
param(
    [string]$FqgateSourceRoot,
    [string]$DestinationRoot,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd("\", "/")
$uiRoot = Join-Path $repositoryRoot "AI-plugins\ui-apps"
$uiOutputRoot = Join-Path $uiRoot "dist\mcp-apps"

if ([string]::IsNullOrWhiteSpace($FqgateSourceRoot)) {
    $FqgateSourceRoot = Join-Path $repositoryRoot "..\fqgate"
}
$resolvedFqgateRoot = [IO.Path]::GetFullPath($FqgateSourceRoot).TrimEnd("\", "/")
$fqgateRootPrefix = "$resolvedFqgateRoot$([IO.Path]::DirectorySeparatorChar)"
if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $DestinationRoot = Join-Path $resolvedFqgateRoot "target\debug\mcp-apps"
}
$resolvedDestinationRoot = [IO.Path]::GetFullPath($DestinationRoot).TrimEnd("\", "/")

if ($resolvedFqgateRoot.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedFqgateRoot.StartsWith("$repositoryRoot$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)) {
    throw "FQGate 源码目录不能位于公开 Agent 仓库内：$resolvedFqgateRoot"
}
if (-not $resolvedDestinationRoot.StartsWith($fqgateRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "开发发布目录必须位于 FQGate 源码目录内：$resolvedDestinationRoot"
}

$cargoManifest = Join-Path $resolvedFqgateRoot "Cargo.toml"
if (-not (Test-Path -LiteralPath $cargoManifest -PathType Leaf)) {
    throw "指定目录不是可识别的 FQGate 源码目录（缺少 Cargo.toml）：$resolvedFqgateRoot"
}
$cargoManifestText = Get-Content -LiteralPath $cargoManifest -Raw -Encoding UTF8
if ($cargoManifestText -notmatch '(?m)^name\s*=\s*["'']fqgate["'']\s*$') {
    throw "指定 Cargo 项目的包名不是 fqgate：$resolvedFqgateRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $uiRoot "package-lock.json") -PathType Leaf)) {
    throw "缺少 UI 依赖锁定文件：$uiRoot\package-lock.json"
}

function Invoke-Npm([string[]]$Arguments) {
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "npm 命令执行失败：npm $($Arguments -join ' ')"
    }
}

Push-Location $uiRoot
try {
    if (-not $SkipInstall) {
        Invoke-Npm @("ci")
    }
    Invoke-Npm @("run", "build:mcp-apps")
}
finally {
    Pop-Location
}

$manifestPath = Join-Path $uiOutputRoot "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "UI 构建缺少 manifest.json：$manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.component -ne "fqgate-mcp-apps" -or $manifest.channel -ne "dev") {
    throw "UI 构建清单不是可用的 FQGate MCP Apps 开发清单。"
}
if (-not $manifest.apps -or $manifest.apps.Count -eq 0) {
    throw "UI 构建清单没有应用。"
}

$expectedFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
[void]$expectedFiles.Add("manifest.json")
foreach ($app in $manifest.apps) {
    if ([string]::IsNullOrWhiteSpace($app.file) -or $app.file -notmatch '^[a-z0-9-]+\.html$') {
        throw "UI 构建清单包含无效文件名：$($app.file)"
    }
    $sourcePath = Join-Path $uiOutputRoot $app.file
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "UI 构建缺少清单文件：$sourcePath"
    }
    $fileInfo = Get-Item -LiteralPath $sourcePath
    $hash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($fileInfo.Length -ne $app.size -or $hash -ne $app.sha256) {
        throw "UI 构建文件校验失败：$sourcePath"
    }
    $html = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8
    if ($html -notmatch '(?i)<!doctype\s+html' -or
        $html -match '(?i)<script\b[^>]*\bsrc\s*=' -or
        $html -match '(?i)<link\b[^>]*\brel\s*=\s*["'']stylesheet["''][^>]*\bhref\s*=') {
        throw "UI 页面不是完整的自包含 HTML：$sourcePath"
    }
    [void]$expectedFiles.Add($app.file)
}

New-Item -ItemType Directory -Path $resolvedDestinationRoot -Force | Out-Null
foreach ($app in $manifest.apps) {
    $sourcePath = Join-Path $uiOutputRoot $app.file
    $destinationPath = Join-Path $resolvedDestinationRoot $app.file
    $temporaryPath = "$destinationPath.$PID.tmp"
    Copy-Item -LiteralPath $sourcePath -Destination $temporaryPath -Force
    Move-Item -LiteralPath $temporaryPath -Destination $destinationPath -Force
    Write-Output "fqgate_mcp_app=$destinationPath"
    Write-Output "fqgate_mcp_app_sha256=$($app.sha256)"
}

# 页面全部就位后再切换清单，运行中的 FQGate 不会加载到半套资源。
$destinationManifest = Join-Path $resolvedDestinationRoot "manifest.json"
$temporaryManifest = "$destinationManifest.$PID.tmp"
Copy-Item -LiteralPath $manifestPath -Destination $temporaryManifest -Force
Move-Item -LiteralPath $temporaryManifest -Destination $destinationManifest -Force

Get-ChildItem -LiteralPath $resolvedDestinationRoot -File -Filter "*.html" | ForEach-Object {
    if (-not $expectedFiles.Contains($_.Name)) {
        Remove-Item -LiteralPath $_.FullName -Force
    }
}
Write-Output "fqgate_mcp_apps_publish_complete=true"
