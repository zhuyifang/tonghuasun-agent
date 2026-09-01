[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

function ConvertTo-Hashtable([object]$Value) {
    if ($null -eq $Value) {
        return $null
    }
    if ($Value -is [System.Collections.IDictionary]) {
        $result = @{}
        foreach ($key in $Value.Keys) {
            $result[[string]$key] = ConvertTo-Hashtable $Value[$key]
        }
        return $result
    }
    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        $result = @{}
        foreach ($property in $Value.PSObject.Properties) {
            $result[$property.Name] = ConvertTo-Hashtable $property.Value
        }
        return $result
    }
    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        return @($Value | ForEach-Object { ConvertTo-Hashtable $_ })
    }
    return $Value
}

function Read-JsonHashtable([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return @{}
    }
    try {
        return ConvertTo-Hashtable (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    }
    catch {
        throw "无法读取千问 MCP 配置：$Path。请先修复该 JSON 文件后重试。"
    }
}

function Write-JsonUtf8([string]$Path, [object]$Value) {
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $json = $Value | ConvertTo-Json -Depth 30
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, "$json`r`n", $utf8)
}

function Write-JsonUtf8IfChanged([string]$Path, [object]$Value) {
    $json = $Value | ConvertTo-Json -Depth 30
    $content = "$json`r`n"
    if ((Test-Path -LiteralPath $Path -PathType Leaf) -and
        (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) -ceq $content) {
        return $false
    }

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporaryPath = "$Path.$PID.tmp"
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($temporaryPath, $content, $utf8)
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    return $true
}

function Get-FileSha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "")
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Copy-FileIfChanged([string]$SourcePath, [string]$DestinationPath) {
    if ((Test-Path -LiteralPath $DestinationPath -PathType Leaf) -and
        (Get-FileSha256 $SourcePath) -eq (Get-FileSha256 $DestinationPath)) {
        return $false
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    return $true
}

function Get-QianwenAccountRoots([string]$AgentRoot) {
    if (-not (Test-Path -LiteralPath $AgentRoot -PathType Container)) {
        throw "没有找到千问本机数据目录。请先打开千问并进入一次工作任务，然后重试。"
    }

    $reservedNames = @("cache", "observability", "resources", "resources_workspaces", "state")
    $roots = @(Get-ChildItem -LiteralPath $AgentRoot -Directory -Force |
        Where-Object {
            $_.Name -notin $reservedNames -and
            ((Test-Path -LiteralPath (Join-Path $_.FullName "skills") -PathType Container) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName "projects.json") -PathType Leaf))
        })

    if ($roots.Count -eq 0) {
        throw "千问尚未创建工作任务数据。请先在千问中进入一次工作任务，然后重试。"
    }
    return $roots
}

function Test-ManagedSkill([string]$DestinationPath, [string]$SourcePath) {
    $markerPath = Join-Path $DestinationPath ".tonghuasun-agent-managed.json"
    if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
        return $true
    }

    $destinationSkill = Join-Path $DestinationPath "SKILL.md"
    $sourceSkill = Join-Path $SourcePath "SKILL.md"
    if (-not (Test-Path -LiteralPath $destinationSkill -PathType Leaf) -or
        -not (Test-Path -LiteralPath $sourceSkill -PathType Leaf)) {
        return $false
    }
    return (Get-FileSha256 $destinationSkill) -eq (Get-FileSha256 $sourceSkill)
}

function Test-ManagedMcpEntry([object]$Entry, [string]$ExpectedProxyPath) {
    if ($Entry -isnot [System.Collections.IDictionary]) {
        return $false
    }
    $args = @($Entry["args"])
    return $args.Count -eq 1 -and
        [string]$args[0] -eq $ExpectedProxyPath
}

function Test-CurrentMcpEntry(
    [object]$Entry,
    [string]$ExpectedNodePath,
    [string]$ExpectedProxyPath
) {
    if (-not (Test-ManagedMcpEntry $Entry $ExpectedProxyPath)) {
        return $false
    }
    if ([string]$Entry["type"] -ne "stdio" -or
        [string]$Entry["command"] -ne $ExpectedNodePath -or
        $Entry["env"] -isnot [System.Collections.IDictionary]) {
        return $false
    }
    return [string]$Entry["env"]["TONGHUASUN_MCP_TEXT_COMPATIBILITY"] -eq "true"
}

function Test-CurrentSkill(
    [string]$DestinationPath,
    [string]$SourcePath,
    [string]$ExpectedVersion
) {
    if (-not (Test-Path -LiteralPath $DestinationPath -PathType Container)) {
        return $false
    }

    $markerPath = Join-Path $DestinationPath ".tonghuasun-agent-managed.json"
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        return $false
    }
    $marker = Read-JsonHashtable $markerPath
    if ([int]$marker["schemaVersion"] -ne 1 -or [string]$marker["version"] -ne $ExpectedVersion) {
        return $false
    }

    $sourceRoot = $SourcePath.TrimEnd("\")
    $destinationRoot = $DestinationPath.TrimEnd("\")
    $sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File)
    $destinationFiles = @(Get-ChildItem -LiteralPath $destinationRoot -Recurse -File |
        Where-Object { $_.FullName -ne $markerPath })
    if ($sourceFiles.Count -ne $destinationFiles.Count) {
        return $false
    }

    foreach ($sourceFile in $sourceFiles) {
        $relativePath = $sourceFile.FullName.Substring($sourceRoot.Length).TrimStart("\")
        $destinationFile = Join-Path $destinationRoot $relativePath
        if (-not (Test-Path -LiteralPath $destinationFile -PathType Leaf) -or
            (Get-FileSha256 $sourceFile.FullName) -ne (Get-FileSha256 $destinationFile)) {
            return $false
        }
    }
    return $true
}

if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA 不可用，无法定位千问配置。"
}

$qianwenAgentRoot = Join-Path $env:LOCALAPPDATA "Qianwen\User Data\qwen-agent"
$accountRoots = @(Get-QianwenAccountRoots $qianwenAgentRoot)
$adapterInstallRoot = Join-Path $env:LOCALAPPDATA "TonghuasunCodex\agents\qianwen"
$installedProxyPath = Join-Path $adapterInstallRoot "scripts\tonghuasun-mcp-proxy.mjs"

if ($Uninstall) {
    foreach ($accountRoot in $accountRoots) {
        $mcpPath = Join-Path $accountRoot.FullName "mcp.json"
        $config = Read-JsonHashtable $mcpPath
        if ($config.ContainsKey("mcpServers") -and $config["mcpServers"] -is [System.Collections.IDictionary]) {
            $config["mcpServers"].Remove("tonghuasun-agent")
            Write-JsonUtf8 $mcpPath $config
        }

        $skillPath = Join-Path $accountRoot.FullName "skills\tonghuasun-agent"
        if (Test-Path -LiteralPath $skillPath -PathType Container) {
            $markerPath = Join-Path $skillPath ".tonghuasun-agent-managed.json"
            if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
                Remove-Item -LiteralPath $skillPath -Recurse -Force
            }
        }
    }
    if (Test-Path -LiteralPath $adapterInstallRoot -PathType Container) {
        $resolvedInstallRoot = [IO.Path]::GetFullPath($adapterInstallRoot)
        $expectedParent = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "TonghuasunCodex\agents"))
        if (-not $resolvedInstallRoot.StartsWith("$expectedParent\", [StringComparison]::OrdinalIgnoreCase)) {
            throw "拒绝删除预期目录之外的文件：$resolvedInstallRoot"
        }
        Remove-Item -LiteralPath $resolvedInstallRoot -Recurse -Force
    }
    Write-Output "千问中的同花顺 Agent 已卸载。新建工作任务后生效。"
    exit 0
}

$packageRoot = $PSScriptRoot
$sourceProxyPath = Join-Path $packageRoot "scripts\tonghuasun-mcp-proxy.mjs"
if (-not (Test-Path -LiteralPath $sourceProxyPath -PathType Leaf)) {
    $sourceProxyPath = Join-Path (Split-Path -Parent $packageRoot) "tonghuasun-mcp\distribution\scripts\tonghuasun-mcp-proxy.mjs"
}
$sourceSkillPath = Join-Path $packageRoot "skills\tonghuasun-agent"
$sourceManifestPath = Join-Path $packageRoot "plugin.json"

foreach ($requiredPath in @($sourceProxyPath, (Join-Path $sourceSkillPath "SKILL.md"), $sourceManifestPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "千问插件安装包不完整，缺少：$requiredPath"
    }
}

$qianwenNodePath = Join-Path $qianwenAgentRoot "resources\bins\node.exe"
if (-not (Test-Path -LiteralPath $qianwenNodePath -PathType Leaf)) {
    throw "没有找到千问自带的 Node.js。请升级或修复千问客户端后重试。"
}

New-Item -ItemType Directory -Path (Split-Path -Parent $installedProxyPath) -Force | Out-Null
$adapterChanged = Copy-FileIfChanged $sourceProxyPath $installedProxyPath
$adapterChanged = (Copy-FileIfChanged $sourceManifestPath (Join-Path $adapterInstallRoot "plugin.json")) -or $adapterChanged
$qianwenConfigurationChanged = $false

foreach ($accountRoot in $accountRoots) {
    $skillDestination = Join-Path $accountRoot.FullName "skills\tonghuasun-agent"
    New-Item -ItemType Directory -Path (Split-Path -Parent $skillDestination) -Force | Out-Null
    if (Test-Path -LiteralPath $skillDestination -PathType Container) {
        if (-not (Test-ManagedSkill $skillDestination $sourceSkillPath)) {
            throw "千问中已有同名技能且不属于本安装包，未覆盖：$skillDestination"
        }
    }
    if (-not (Test-CurrentSkill $skillDestination $sourceSkillPath "0.2.13")) {
        if (Test-Path -LiteralPath $skillDestination -PathType Container) {
            Remove-Item -LiteralPath $skillDestination -Recurse -Force
        }
        Copy-Item -LiteralPath $sourceSkillPath -Destination $skillDestination -Recurse -Force
        Write-JsonUtf8 (Join-Path $skillDestination ".tonghuasun-agent-managed.json") @{
            schemaVersion = 1
            version = "0.2.13"
        }
        $qianwenConfigurationChanged = $true
    }

    $mcpPath = Join-Path $accountRoot.FullName "mcp.json"
    $config = Read-JsonHashtable $mcpPath
    if (-not $config.ContainsKey("mcpServers") -or $config["mcpServers"] -isnot [System.Collections.IDictionary]) {
        $config["mcpServers"] = @{}
    }
    if ($config["mcpServers"].ContainsKey("tonghuasun-agent") -and
        -not (Test-ManagedMcpEntry $config["mcpServers"]["tonghuasun-agent"] $installedProxyPath)) {
        throw "千问中已有同名 MCP 且不属于本安装包，未覆盖：$mcpPath"
    }
    if (-not (Test-CurrentMcpEntry $config["mcpServers"]["tonghuasun-agent"] $qianwenNodePath $installedProxyPath)) {
        $config["mcpServers"]["tonghuasun-agent"] = @{
            type = "stdio"
            command = $qianwenNodePath
            args = @($installedProxyPath)
            env = @{
                TONGHUASUN_MCP_TEXT_COMPATIBILITY = "true"
            }
        }
        $qianwenConfigurationChanged = (Write-JsonUtf8IfChanged $mcpPath $config) -or $qianwenConfigurationChanged
    }
}

Write-Output "千问插件已安装到 $($accountRoots.Count) 个本机用户配置。"
if ($qianwenConfigurationChanged) {
    Write-Output "千问正在重新加载工具。请等待加载完成后重新打开当前草稿，或新建工作任务再发送。"
}
elseif ($adapterChanged) {
    Write-Output "插件文件已更新；千问下次调用时会使用新版本。"
}
else {
    Write-Output "千问插件已经是当前版本，没有重复改写配置。"
}
Write-Output "验证问题：使用同花顺 Agent 查看工业富联今天的行情。"
