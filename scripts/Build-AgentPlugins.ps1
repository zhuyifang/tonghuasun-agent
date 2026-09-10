[CmdletBinding()]
param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "release\Common.ps1")

$compatibilityPath = Join-Path $repositoryRoot "fqgate\compatibility.json"
$compatibility = Read-JsonFile $compatibilityPath
$agentVersion = [string]$compatibility.agentVersion
if ($agentVersion -notmatch "^\d+\.\d+\.\d+$") {
    throw "Agent 版本必须是严格语义版本：$agentVersion"
}
if ($Release -and [string]$compatibility.release.status -ne "published") {
    throw "FQGate 发行清单尚未发布，不能生成正式发布包。"
}

$adapterDefinitions = @(
    [ordered]@{ Name="codex"; Manifest=".codex-plugin\plugin.json"; Archive="fqgate-agent-codex-$agentVersion.zip" },
    [ordered]@{ Name="claude-code"; Manifest=".claude-plugin\plugin.json"; Archive="fqgate-agent-claude-code-$agentVersion.zip" },
    [ordered]@{ Name="workbuddy"; Manifest=".codebuddy-plugin\plugin.json"; Archive="fqgate-agent-workbuddy-$agentVersion.zip" },
    [ordered]@{ Name="zcode"; Manifest=".zcode-plugin\plugin.json"; Archive="fqgate-agent-zcode-$agentVersion.zip" },
    [ordered]@{ Name="openclaw"; Manifest="plugin.json"; Archive="fqgate-agent-openclaw-$agentVersion.zip" },
    [ordered]@{ Name="doubao"; Manifest="plugin.json"; Archive="fqgate-agent-doubao-$agentVersion.zip" },
    [ordered]@{ Name="qianwen"; Manifest="plugin.json"; Archive="fqgate-agent-qianwen-$agentVersion.zip" }
)

foreach ($definition in $adapterDefinitions) {
    $manifestPath = Join-Path $repositoryRoot "AI-plugins\$($definition.Name)\$($definition.Manifest)"
    $actualVersion = Get-FileVersionFromManifest $manifestPath
    if ($actualVersion -ne $agentVersion) {
        throw "$($definition.Name) 版本与兼容清单不一致：$actualVersion != $agentVersion"
    }
}
$deepSeekManifest = Join-Path $repositoryRoot "AI-plugins\deepseek-harness\package.json"
if ((Get-FileVersionFromManifest $deepSeekManifest) -ne $agentVersion) {
    throw "DeepSeek Harness 版本与兼容清单不一致。"
}

$artifactDirectory = Join-Path $repositoryRoot "artifacts"
$temporaryBase = Join-Path $repositoryRoot ".tmp"
$temporaryRoot = Join-Path $temporaryBase "agent-build-$agentVersion-$PID"
$resolvedTemporaryBase = [IO.Path]::GetFullPath($temporaryBase).TrimEnd("\") + "\"
$resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
if (-not $resolvedTemporaryRoot.StartsWith($resolvedTemporaryBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝使用 .tmp 之外的构建目录：$resolvedTemporaryRoot"
}

$artifacts = @()
try {
    New-Item -ItemType Directory -Path $resolvedTemporaryRoot, $artifactDirectory -Force | Out-Null

    foreach ($definition in $adapterDefinitions) {
        $sourceRoot = Join-Path $repositoryRoot "AI-plugins\$($definition.Name)"
        $packageRoot = Join-Path $resolvedTemporaryRoot "$($definition.Name)\fqgate-agent"
        Copy-DirectoryContents $sourceRoot $packageRoot @("ADAPTER.md")
        Copy-CommonPackage $repositoryRoot $packageRoot (Join-Path $sourceRoot "ADAPTER.md")
        Assert-Package $packageRoot $agentVersion $definition.Manifest
        $archive = Compress-Package $packageRoot $artifactDirectory $definition.Archive
        Assert-ArchiveRoot $archive "fqgate-agent"
        $artifacts += $archive

        if ($definition.Name -eq "zcode") {
            $marketplaceRoot = Join-Path $resolvedTemporaryRoot "zcode-marketplace\fqgate-agent-zcode-marketplace"
            $marketplacePluginRoot = Join-Path $marketplaceRoot "fqgate-agent"
            Copy-DirectoryContents $packageRoot $marketplacePluginRoot
            Write-JsonFile (Join-Path $marketplaceRoot ".claude-plugin\marketplace.json") ([ordered]@{
                name = "fqgate-agent-local"
                description = "同花顺免费开源AI插件FQGate的 ZCode 本地插件市场。"
                plugins = @([ordered]@{
                    name = "fqgate-agent"
                    source = "./fqgate-agent"
                    description = "同花顺免费开源AI插件FQGate，连接本机 FQGate 查询行情、账户和交易记录。"
                    version = $agentVersion
                    category = "productivity"
                    tags = @("FQGate", "证券", "行情", "MCP")
                    strict = $true
                })
            })
            $zcodeIconDirectory = Join-Path $marketplaceRoot "assets\fqgate-agent"
            New-Item -ItemType Directory -Path $zcodeIconDirectory -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $repositoryRoot "assets\brand\fqgate-app-icon.png") `
                -Destination (Join-Path $zcodeIconDirectory "icon.png") -Force
            $marketplaceArchive = Compress-Package `
                $marketplaceRoot `
                $artifactDirectory `
                "fqgate-agent-zcode-marketplace-$agentVersion.zip"
            Assert-ArchiveRoot $marketplaceArchive "fqgate-agent-zcode-marketplace"
            $artifacts += $marketplaceArchive
        }
    }

    $deepSeekSource = Join-Path $repositoryRoot "AI-plugins\deepseek-harness"
    $deepSeekRoot = Join-Path $resolvedTemporaryRoot "deepseek-harness\package"
    Copy-DirectoryContents $deepSeekSource $deepSeekRoot @("ADAPTER.md")
    Copy-CommonPackage $repositoryRoot $deepSeekRoot (Join-Path $deepSeekSource "ADAPTER.md")
    Assert-Package $deepSeekRoot $agentVersion "package.json"
    Push-Location $deepSeekRoot
    try {
        $npmCache = Join-Path $resolvedTemporaryRoot "npm-cache"
        $packName = @(& npm pack --cache $npmCache --pack-destination $artifactDirectory --silent) | Select-Object -Last 1
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$packName)) {
            throw "DeepSeek Harness npm 包生成失败。"
        }
        $artifacts += Join-Path $artifactDirectory ([string]$packName)
    }
    finally { Pop-Location }

    foreach ($artifact in $artifacts) {
        Write-Output "artifact_path=$artifact"
        Write-Output "artifact_sha256=$((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant())"
    }
    Write-Output "agent_version=$agentVersion"
    Write-Output "fqgate_range=$($compatibility.fqgate.minimumVersion)..<$($compatibility.fqgate.maximumVersionExclusive)"
    Write-Output "build_complete=true"
}
finally {
    if (Test-Path -LiteralPath $resolvedTemporaryRoot -PathType Container) {
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
    }
}
