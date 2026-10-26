# Main-session wait adapter. Run it as a background task; the background-task-finished notification wakes the
# main session. Prints one reason line and exits non-zero on the first trigger:
#   10 unacked alert   11 watched card delivered/stalled/timed out   12 watched job ended   13 scheduler heartbeat stale
#   0  only when -MaxWaitSec elapsed with nothing to report (0 = wait forever)
# Acknowledge an alert by creating the file <Root>/control/ack-<alert id>; until then every restart reports it again.
# Pure reader: spends no model quota, sends nothing outside, kills nothing. Logic lives in observe.mjs (check).
param(
  [Parameter(Mandatory)][string]$Root,
  [Parameter(Mandatory)][string]$Sessions,
  [string[]]$Cards = @(),
  [string[]]$Jobs = @(),
  [double]$PollSec = 5,
  [double]$HeartbeatStaleSec = 90,   # 0 disables the heartbeat check
  [double]$CardStallSec = 900,
  [double]$MaxWaitSec = 0
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
$observe = Join-Path $PSScriptRoot 'observe.mjs'
if (-not $env:TEMP) { $env:TEMP = 'F:/dnd-tmp' }
if (-not $env:TMP) { $env:TMP = $env:TEMP }
$cardList = ($Cards | ForEach-Object { $_ -split '[,;]' } | Where-Object { $_ }) -join ','
$jobList = ($Jobs | ForEach-Object { $_ -split '[,;]' } | Where-Object { $_ }) -join ','
$codes = @{ alert = 10; card = 11; job = 12; heartbeat = 13 }
$started = Get-Date
$failures = 0
while ($true) {
  $nodeArgs = @($observe, 'check', '--root', $Root, '--sessions', $Sessions, '--hb-stale-sec', "$HeartbeatStaleSec", '--card-stall-sec', "$CardStallSec")
  if ($cardList) { $nodeArgs += @('--cards', $cardList) }
  if ($jobList) { $nodeArgs += @('--jobs', $jobList) }
  $text = & node @nodeArgs
  if ($LASTEXITCODE -eq 0 -and $text) {
    $failures = 0
    $result = ($text | Out-String) | ConvertFrom-Json
    $t = @($result.triggers)
    if ($t.Count -gt 0) {
      $first = $t[0]
      Write-Output ("NOTIFY[{0}] {1}" -f $first.kind, $first.reason)
      if ($t.Count -gt 1) { Write-Output ("（另有 {0} 项，见 status.ps1）" -f ($t.Count - 1)) }
      exit $codes[[string]$first.kind]
    }
  } else {
    $failures++
    if ($failures -ge 3) { Write-Output 'NOTIFY[error] observe.mjs 连续 3 次执行失败'; exit 14 }
  }
  if ($MaxWaitSec -gt 0 -and ((Get-Date) - $started).TotalSeconds -ge $MaxWaitSec) { exit 0 }
  Start-Sleep -Milliseconds ([int]($PollSec * 1000))
}
