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

function Get-DoubaoNodePath {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand) {
        return $nodeCommand.Source
    }

    $runtimeRoot = Join-Path $env:LOCALAPPDATA "Doubao\User Data\sandbox_runtime\bases"
    if (Test-Path -LiteralPath $runtimeRoot -PathType Container) {
        $runtimeNode = Get-ChildItem -LiteralPath $runtimeRoot -Filter node.exe -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match "\\node\\node\.exe$" } |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if ($null -ne $runtimeNode) {
            return $runtimeNode.FullName
        }
    }
    throw "没有找到可用的 Node.js。请先升级或修复豆包客户端后重试。"
}

function Invoke-DoubaoSkillInstaller([switch]$Remove) {
    $installerPath = Join-Path $PSScriptRoot "install.ps1"
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $installerPath
    )
    if ($Remove) {
        $arguments += "-Uninstall"
    }

    $installerOutput = @(& powershell.exe @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $message = @($installerOutput |
            ForEach-Object { [string]$_ } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -Last 1)
        if ($message.Count -eq 0) {
            throw "豆包技能安装失败。"
        }
        throw $message[0]
    }
    $installerOutput | ForEach-Object { Write-Output ([string]$_) }
}

if ($Uninstall) {
    Invoke-DoubaoSkillInstaller -Remove
    exit 0
}

if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA 不可用，无法定位豆包配置。"
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
        throw "当前电脑上的同花顺 Agent 版本更新，请改用与当前版本一致或更新的豆包安装包。"
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

    $nodePath = Get-DoubaoNodePath
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

Invoke-DoubaoSkillInstaller

if ($clientConfigured) {
    Write-Output "本机同花顺插件已经配置完成，请启动同花顺并完成登录。"
}
Write-Output '安装完成。请在豆包工作任务中选中“同花顺 Agent”技能和连接器；验证时只使用连接器，成功返回后即可停止。'
