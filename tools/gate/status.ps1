# Print the overview (cards, jobs, scheduler, alerts) and refresh <Root>/overview.md + status.json (skip with -NoWrite).
#   -Unacked        only list unacknowledged alerts
#   -All            show everything (default: unfinished items, items finished within -SinceHours, items with an unacked alert)
#   -SinceHours n   window for finished items (default 12)
# Exit code: 0 = rendered, nothing to acknowledge; 1 = rendered, unacknowledged alerts exist; 2 = could not render.
param(
  [switch]$Unacked,
  [switch]$NoWrite,
  [switch]$All,
  [double]$SinceHours = 12,
  [string]$Root = 'F:/dnd/logs/gate',
  [string]$Sessions = 'F:/dnd/logs/sessions'
)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
if (-not $env:TEMP) { $env:TEMP = 'F:/dnd-tmp' }
if (-not $env:TMP) { $env:TMP = $env:TEMP }
$observe = Join-Path $PSScriptRoot 'observe.mjs'
$a = @($observe, 'report', '--root', $Root, '--sessions', $Sessions, '--since-hours', "$SinceHours")
if (-not $NoWrite) { $a += '--write' }
if ($Unacked) { $a += '--unacked' }
if ($All) { $a += '--all' }
& node @a
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 2 }
exit ([int]$code)
