# External (non-Node) heartbeat watchdog. Alerts only; never kills any process.
# Checks the LastWriteTime of -HeartbeatFile every -IntervalSec. If it has not changed
# for -StaleSec, appends one alert line (deduped per RunId+Type) to -AlertsFile and
# exits with code 2 so the background-task finish notification reaches the main session.
# Exit 0 = -StopFile appeared (run finished normally) or -MaxChecks reached without alert.
param(
  [Parameter(Mandatory)][string]$HeartbeatFile,
  [Parameter(Mandatory)][string]$AlertsFile,
  [Parameter(Mandatory)][string]$RunId,
  [double]$IntervalSec = 30,
  [double]$StaleSec = 90,
  [string]$StopFile = '',
  [int]$MaxChecks = 0
)
$ErrorActionPreference = 'Stop'
$type = 'HEARTBEAT_LOST'
$started = Get-Date
$checks = 0
while ($true) {
  if ($StopFile -and (Test-Path -LiteralPath $StopFile)) { exit 0 }
  if (Test-Path -LiteralPath $HeartbeatFile) { $last = (Get-Item -LiteralPath $HeartbeatFile).LastWriteTime } else { $last = $started }
  if ($last -lt $started) { $last = $started }
  $age = ((Get-Date) - $last).TotalSeconds
  if ($age -ge $StaleSec) {
    $dir = Split-Path -Parent $AlertsFile
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $exists = $false
    if (Test-Path -LiteralPath $AlertsFile) {
      foreach ($line in Get-Content -LiteralPath $AlertsFile) {
        if ($line -match '"runId":"' + [regex]::Escape($RunId) + '"' -and $line -match '"type":"' + $type + '"') { $exists = $true; break }
      }
    }
    if (-not $exists) {
      $alert = [ordered]@{ ts = (Get-Date).ToUniversalTime().ToString('o'); runId = $RunId; type = $type;
        heartbeatFile = $HeartbeatFile; ageSec = [math]::Round($age, 1); staleSec = $StaleSec }
      Add-Content -LiteralPath $AlertsFile -Value ($alert | ConvertTo-Json -Compress) -Encoding UTF8
    }
    exit 2
  }
  $checks++
  if ($MaxChecks -gt 0 -and $checks -ge $MaxChecks) { exit 0 }
  Start-Sleep -Milliseconds ([int]($IntervalSec * 1000))
}
