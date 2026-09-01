[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

trap {
    Write-Output $_.Exception.Message
    exit 1
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

function Get-RelativeFileMap([string]$RootPath) {
    $resolvedRoot = [IO.Path]::GetFullPath($RootPath).TrimEnd("\")
    $result = [ordered]@{}
    Get-ChildItem -LiteralPath $resolvedRoot -Recurse -File -Force |
        Sort-Object FullName |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($resolvedRoot.Length).TrimStart("\")
            $result[$relativePath] = Get-FileSha256 $_.FullName
        }
    return $result
}

function Test-FileMapsEqual([object]$Left, [object]$Right) {
    $leftProperties = @($Left.PSObject.Properties)
    $rightProperties = @($Right.PSObject.Properties)
    if ($Left -is [System.Collections.IDictionary]) {
        $leftProperties = @($Left.Keys | ForEach-Object {
            [pscustomobject]@{ Name = [string]$_; Value = [string]$Left[$_] }
        })
    }
    if ($Right -is [System.Collections.IDictionary]) {
        $rightProperties = @($Right.Keys | ForEach-Object {
            [pscustomobject]@{ Name = [string]$_; Value = [string]$Right[$_] }
        })
    }
    if ($leftProperties.Count -ne $rightProperties.Count) {
        return $false
    }
    foreach ($property in $leftProperties) {
        $match = @($rightProperties | Where-Object { $_.Name -ceq $property.Name })
        if ($match.Count -ne 1 -or [string]$match[0].Value -cne [string]$property.Value) {
            return $false
        }
    }
    return $true
}

function Read-Json([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "无法读取豆包插件安装记录：$Path"
    }
}

function Write-JsonUtf8([string]$Path, [object]$Value) {
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $json = $Value | ConvertTo-Json -Depth 20
    $content = "$json`r`n"
    if ((Test-Path -LiteralPath $Path -PathType Leaf) -and
        (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) -ceq $content) {
        return $false
    }

    $temporaryPath = "$Path.$PID.tmp"
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($temporaryPath, $content, $utf8)
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    return $true
}

function Get-DoubaoWorkspaces([string]$UserDataRoot) {
    if (-not (Test-Path -LiteralPath $UserDataRoot -PathType Container)) {
        throw "没有找到豆包本机数据。请先打开豆包并进入一次工作任务，然后重试。"
    }

    $workspaces = @()
    foreach ($profile in Get-ChildItem -LiteralPath $UserDataRoot -Directory -Force) {
        $workspacePath = Join-Path $profile.FullName ".doubao\agent_mode\workspace"
        if (Test-Path -LiteralPath $workspacePath -PathType Container) {
            $workspaces += [pscustomobject]@{
                ProfileName = $profile.Name
                Path = $workspacePath
            }
        }
    }
    if ($workspaces.Count -eq 0) {
        throw "豆包尚未创建工作任务数据。请先在豆包中进入一次工作任务，然后重试。"
    }
    return $workspaces
}

function Test-PathWithin([string]$Path, [string]$ExpectedParent) {
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $resolvedParent = [IO.Path]::GetFullPath($ExpectedParent).TrimEnd("\")
    return $resolvedPath.StartsWith("$resolvedParent\", [StringComparison]::OrdinalIgnoreCase)
}

function Test-ManagedSkill(
    [string]$DestinationPath,
    [string]$StatePath,
    [object]$CurrentFiles
) {
    $state = Read-Json $StatePath
    if ($null -eq $state -or [int]$state.schemaVersion -ne 1) {
        return $false
    }
    if ([string]$state.destinationPath -cne [IO.Path]::GetFullPath($DestinationPath)) {
        return $false
    }
    return Test-FileMapsEqual $CurrentFiles $state.files
}

function Test-LegacyTonghuasunSkill([string]$DestinationPath) {
    $files = @(Get-ChildItem -LiteralPath $DestinationPath -Recurse -File -Force)
    if ($files.Count -ne 1 -or $files[0].Name -cne "SKILL.md") {
        return $false
    }

    $text = Get-Content -LiteralPath $files[0].FullName -Raw -Encoding UTF8
    return $text -match "(?m)^name:\s*tonghuasun-agent\s*$" -and
        $text.IndexOf("# 同花顺 Agent", [StringComparison]::Ordinal) -ge 0 -and
        $text.IndexOf("ths_order_flow", [StringComparison]::Ordinal) -ge 0 -and
        $text.IndexOf('名为“同花顺 Agent”的连接器', [StringComparison]::Ordinal) -ge 0
}

if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA 不可用，无法定位豆包配置。"
}

$doubaoUserDataRoot = Join-Path $env:LOCALAPPDATA "Doubao\User Data"
$workspaces = @(Get-DoubaoWorkspaces $doubaoUserDataRoot)
$stateRoot = Join-Path $env:LOCALAPPDATA "TonghuasunCodex\agents\doubao"

if ($Uninstall) {
    $removedCount = 0
    foreach ($workspace in $workspaces) {
        $destinationPath = Join-Path $workspace.Path ".user_skills\tonghuasun-agent"
        $statePath = Join-Path $stateRoot "$($workspace.ProfileName).json"
        if (-not (Test-Path -LiteralPath $destinationPath -PathType Container)) {
            continue
        }
        $currentFiles = Get-RelativeFileMap $destinationPath
        if (-not (Test-ManagedSkill $destinationPath $statePath $currentFiles)) {
            Write-Output "未删除已被修改或不属于本安装包的同名技能：$destinationPath"
            continue
        }
        if (-not (Test-PathWithin $destinationPath $doubaoUserDataRoot)) {
            throw "拒绝删除预期目录之外的文件：$destinationPath"
        }
        Remove-Item -LiteralPath $destinationPath -Recurse -Force
        Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
        $removedCount++
    }
    Write-Output "已从 $removedCount 个豆包本机用户配置中移除同花顺 Agent 技能。"
    Write-Output "豆包连接器属于账号设置，如不再使用，请在豆包的连接器页面中手动删除。"
    exit 0
}

$sourceSkillPath = Join-Path $PSScriptRoot "skills\tonghuasun-agent"
$manifestPath = Join-Path $PSScriptRoot "plugin.json"
foreach ($requiredPath in @((Join-Path $sourceSkillPath "SKILL.md"), $manifestPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "豆包安装包不完整，缺少：$requiredPath"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$sourceFiles = Get-RelativeFileMap $sourceSkillPath
$changedCount = 0

foreach ($workspace in $workspaces) {
    $destinationPath = Join-Path $workspace.Path ".user_skills\tonghuasun-agent"
    $statePath = Join-Path $stateRoot "$($workspace.ProfileName).json"
    $isManaged = $false

    if (Test-Path -LiteralPath $destinationPath -PathType Container) {
        $currentFiles = Get-RelativeFileMap $destinationPath
        $isManaged = Test-ManagedSkill $destinationPath $statePath $currentFiles
        $matchesCurrentPackage = Test-FileMapsEqual $currentFiles $sourceFiles
        $isLegacyPackage = Test-LegacyTonghuasunSkill $destinationPath
        if (-not $isManaged -and -not $matchesCurrentPackage -and -not $isLegacyPackage) {
            throw "豆包中已有同名技能且内容不同，未覆盖：$destinationPath"
        }
        if ($matchesCurrentPackage -or $isLegacyPackage) {
            $isManaged = $true
        }
    }

    if (-not (Test-Path -LiteralPath $destinationPath -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
        $isManaged = $true
    }

    if (-not $isManaged) {
        throw "无法确认豆包同名技能是否可安全更新：$destinationPath"
    }

    $sourceRoot = [IO.Path]::GetFullPath($sourceSkillPath).TrimEnd("\")
    $destinationRoot = [IO.Path]::GetFullPath($destinationPath).TrimEnd("\")
    foreach ($sourceFile in Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -Force) {
        $relativePath = $sourceFile.FullName.Substring($sourceRoot.Length).TrimStart("\")
        $destinationFile = Join-Path $destinationRoot $relativePath
        if (-not (Test-Path -LiteralPath $destinationFile -PathType Leaf) -or
            (Get-FileSha256 $sourceFile.FullName) -ne (Get-FileSha256 $destinationFile)) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $destinationFile) -Force | Out-Null
            Copy-Item -LiteralPath $sourceFile.FullName -Destination $destinationFile -Force
            $changedCount++
        }
    }

    foreach ($destinationFile in Get-ChildItem -LiteralPath $destinationRoot -Recurse -File -Force) {
        $relativePath = $destinationFile.FullName.Substring($destinationRoot.Length).TrimStart("\")
        if (-not $sourceFiles.Contains($relativePath)) {
            Remove-Item -LiteralPath $destinationFile.FullName -Force
            $changedCount++
        }
    }

    $installedFiles = Get-RelativeFileMap $destinationPath
    [void](Write-JsonUtf8 $statePath ([ordered]@{
        schemaVersion = 1
        version = [string]$manifest.version
        destinationPath = [IO.Path]::GetFullPath($destinationPath)
        files = $installedFiles
    }))
}

if ($changedCount -gt 0) {
    Write-Output "豆包技能已安装到 $($workspaces.Count) 个本机用户配置，豆包会自动同步更新。"
}
else {
    Write-Output "豆包技能已经是当前版本，没有重复写入。"
}
Write-Output '已有“同花顺 Agent”连接器无需重复创建；请在当前工作任务中选中该连接器后使用。'
