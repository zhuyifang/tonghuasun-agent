[CmdletBinding()]
param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "scripts\Build-AgentPlugins.ps1") -Release:$Release
exit $LASTEXITCODE
