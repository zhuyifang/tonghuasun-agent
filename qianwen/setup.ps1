[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$ThsPath,
    [switch]$RepairClient
)

$ErrorActionPreference = "Stop"

trap {
    Write-Output "安装没有完成：$($_.Exception.Message)"
    exit 1
}

function ConvertTo-ReleaseVersion([string]$Value) {
    $versionText = if ($null -eq $Value) { "" } else { $Value }
    $match = [regex]::Match($versionText, "^\d+\.\d+\.\d+")
    if (-not $match.Success) {
        throw "无法识别版本号：$Value"
    }
    return [version]$match.Value
}

function Get-LocalPluginHealth {
    try {
        $response = Invoke-RestMethod `
            -Uri "http://127.0.0.1:17180/health" `
            -Method Get `
            -TimeoutSec 3
        if ($response.ok -eq $true -and $null -ne $response.data) {
            return $response.data
        }
    }
    catch {
        return $null
    }
    return $null
}

function Get-QianwenNodePath {
    $qianwenNodePath = Join-Path `
        $env:LOCALAPPDATA `
        "Qianwen\User Data\qwen-agent\resources\bins\node.exe"
    if (Test-Path -LiteralPath $qianwenNodePath -PathType Leaf) {
        return $qianwenNodePath
    }

    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand) {
        return $nodeCommand.Source
    }
    throw "没有找到可用的 Node.js。请先升级或修复千问客户端后重试。"
}

function Invoke-QianwenAdapterInstaller([switch]$Remove) {
    $adapterInstallerPath = Join-Path $PSScriptRoot "install.ps1"
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $adapterInstallerPath
    )
    if ($Remove) {
        $arguments += "-Uninstall"
    }

    & powershell.exe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "千问插件入口安装失败。"
    }
}

if ($Uninstall) {
    Invoke-QianwenAdapterInstaller -Remove
    exit 0
}

if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA 不可用，无法定位千问配置。"
}

$manifestPath = Join-Path $PSScriptRoot "plugin.json"
$configurePath = Join-Path $PSScriptRoot "scripts\configure.mjs"
if (-not (Test-Path -LiteralPath $configurePath -PathType Leaf)) {
    $configurePath = Join-Path `
        (Split-Path -Parent $PSScriptRoot) `
        "tonghuasun-mcp\distribution\scripts\configure.mjs"
}
foreach ($requiredPath in @($manifestPath, $configurePath, (Join-Path $PSScriptRoot "install.ps1"))) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "安装包不完整，缺少：$requiredPath"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$packageVersion = ConvertTo-ReleaseVersion ([string]$manifest.version)
$health = Get-LocalPluginHealth
$requiresClientSetup = $RepairClient.IsPresent

if ($null -ne $health -and -not $requiresClientSetup) {
    $runningVersion = ConvertTo-ReleaseVersion ([string]$health.version)
    if ($runningVersion -gt $packageVersion) {
        throw "当前电脑上的同花顺 Agent 版本更新，请改用与当前版本一致或更新的千问安装包。"
    }

    $requiresClientSetup = `
        $runningVersion -lt $packageVersion -or `
        $health.hasDataAccessor -ne $true

    if (-not $requiresClientSetup) {
        Write-Output "本机同花顺接口已是当前版本，无需重复配置。"
    }
}
elseif ($null -eq $health) {
    $requiresClientSetup = $true
}

$clientConfigured = $false
if ($requiresClientSetup) {
    if (Get-Process -Name happ -ErrorAction SilentlyContinue) {
        throw "需要安装或更新本机同花顺插件。请先正常退出同花顺，再重新运行本安装程序。"
    }

    $nodePath = Get-QianwenNodePath
    $configureArguments = @($configurePath, "configure", "--json")
    if (-not [string]::IsNullOrWhiteSpace($ThsPath)) {
        $configureArguments += @("--ths-path", $ThsPath)
    }

    & $nodePath @configureArguments
    if ($LASTEXITCODE -ne 0) {
        throw "本机同花顺插件配置失败。"
    }
    $clientConfigured = $true
}

Invoke-QianwenAdapterInstaller

if ($clientConfigured) {
    Write-Output "本机同花顺插件已经配置完成，请启动同花顺并完成登录。"
}
Write-Output "如果千问提示正在重新加载工具，请等待加载完成后新建工作任务，再验证同花顺 Agent。"
