[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$FQGatePath,
    [string]$McpUrl = "http://127.0.0.1:17281/mcp"
)

$ErrorActionPreference = "Stop"

trap {
    Write-Output "安装没有完成：$($_.Exception.Message)"
    exit 1
}

function Get-QianwenNodePath {
    $bundledNode = Join-Path $env:LOCALAPPDATA "Qianwen\User Data\qwen-agent\resources\bins\node.exe"
    if (Test-Path -LiteralPath $bundledNode -PathType Leaf) { return $bundledNode }
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand) { return $nodeCommand.Source }
    throw "没有找到可用的 Node.js。请先升级或修复千问客户端后重试。"
}

$installerPath = Join-Path $PSScriptRoot "install.ps1"
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "安装包不完整，缺少：$installerPath"
}

if ($Uninstall) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerPath -Uninstall
    if ($LASTEXITCODE -ne 0) { throw "千问入口卸载失败。" }
    exit 0
}

$configurePath = Join-Path $PSScriptRoot "scripts\configure-fqgate.mjs"
if (-not (Test-Path -LiteralPath $configurePath -PathType Leaf)) {
    throw "安装包不完整，缺少：$configurePath"
}
$nodePath = Get-QianwenNodePath
$configureArguments = @($configurePath, "configure", "--mcp-url", $McpUrl, "--json")
if (-not [string]::IsNullOrWhiteSpace($FQGatePath)) {
    $configureArguments += @("--fqgate-path", $FQGatePath)
}
& $nodePath @configureArguments
if ($LASTEXITCODE -ne 0) {
    throw "FQGate 连接配置失败；请用 -FQGatePath 指定 FQGate 可执行文件。"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerPath
if ($LASTEXITCODE -ne 0) { throw "千问入口安装失败。" }

Write-Output "安装完成。请先启动 FQGate，再在千问中新建工作任务验证。"
