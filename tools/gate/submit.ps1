# Short-lived submit entry: writes <Root>/jobs/<runId>/request.json and prints the runId.
# Never starts a Node test pool; the single long-lived scheduler picks the request up.
# The runId is derived from kind+card+tree+base+snapshot+files, so submitting the same thing twice
# lands in the same job directory (idempotent). -Rerun forces a new job.
param(
  [Parameter(Mandatory)][ValidateSet('card', 'baseline', 'full', 'collect')][string]$Kind,
  [string]$Card = '',
  [string]$Worktree = '',
  [string]$Base = '',
  [string[]]$Files = @(),
  [string]$FilesFile = '',
  [string]$Snapshot = '',
  [ValidateSet('', 'core', 'gate', 'card', 'scan', 'collect')][string]$Priority = '',
  [string]$TreeHash = '',
  [string]$Owner = '',
  [int]$DeadlineMs = 0,
  [string[]]$Env = @(),
  [string]$Root = 'F:/dnd/logs/gate',
  [switch]$Rerun
)
$ErrorActionPreference = 'Stop'

$list = @()
foreach ($item in $Files) { $list += ($item -split '[,;\r\n]+') | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() } }
if ($FilesFile) { $list += Get-Content -LiteralPath $FilesFile | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() } }
$list = @($list | Select-Object -Unique)
if ($list.Count -eq 0) { [Console]::Error.WriteLine('submit: no test files given (-Files / -FilesFile)'); exit 2 }

# Tree hash of the working tree including untracked files, via a throw-away index (the real index is untouched).
if (-not $TreeHash -and $Worktree -and $Kind -eq 'card' -and (Test-Path -LiteralPath $Worktree)) {
  $tempDir = if ($env:TEMP) { $env:TEMP } else { 'F:/dnd-tmp' }
  $idx = Join-Path $tempDir ("gate-idx-" + [guid]::NewGuid().ToString('N'))
  $saved = $env:GIT_INDEX_FILE; $ErrorActionPreference = 'Continue'  # git warnings on stderr must not become terminating errors in PS 5.1
  try {
    $env:GIT_INDEX_FILE = $idx
    & git -C $Worktree read-tree HEAD 2>$null
    if ($LASTEXITCODE -eq 0) { & git -C $Worktree add -A 2>$null }
    if ($LASTEXITCODE -eq 0) { $TreeHash = (& git -C $Worktree write-tree 2>$null | Select-Object -First 1) }
    if ($LASTEXITCODE -ne 0) { $TreeHash = '' }
  } catch { $TreeHash = '' } finally {
    if ($null -eq $saved) { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue } else { $env:GIT_INDEX_FILE = $saved }
    Remove-Item -LiteralPath $idx -Force -ErrorAction SilentlyContinue; $ErrorActionPreference = 'Stop'
  }
}
if ($Kind -eq 'baseline' -and -not $Base) { [Console]::Error.WriteLine('submit: baseline needs -Base <SHA>'); exit 2 }

$sha = [System.Security.Cryptography.SHA1]::Create()
function Get-Hash([string]$text) { -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) | ForEach-Object { $_.ToString('x2') }) }
$stable = [bool]($TreeHash -or $Snapshot -or $Base) -and -not $Rerun
$material = @($Kind, $Card, $TreeHash, $Base, $Snapshot, (Get-Hash ($list -join "`n"))) -join '|'
if (-not $stable) { $material += '|' + [guid]::NewGuid().ToString('N') }
$safeCard = if ($Card) { ($Card -replace '[^\w.-]+', '_') } else { 'anon' }
$runId = "$Kind-$safeCard-" + (Get-Hash $material).Substring(0, 12)

$envMap = [ordered]@{}
foreach ($pair in ($Env | ForEach-Object { $_ -split ';' })) { $i = $pair.IndexOf('='); if ($i -gt 0) { $envMap[$pair.Substring(0, $i)] = $pair.Substring($i + 1) } }  # K=V items, ';'-separated or repeated
$request = [ordered]@{
  runId = $runId; kind = $Kind; cardId = $Card; worktree = $Worktree; base = $Base; snapshot = $Snapshot; treeHash = $TreeHash
  files = $list; priority = $Priority; ownerSession = $Owner; rerun = [bool]$Rerun; env = $envMap
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
}
if ($DeadlineMs -gt 0) { $request['deadlineMs'] = $DeadlineMs }

$dir = Join-Path $Root "jobs/$runId"
$file = Join-Path $dir 'request.json'
if (-not (Test-Path -LiteralPath $file)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $temp = "$file.$PID.tmp"
  [IO.File]::WriteAllText($temp, ($request | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
  try { Move-Item -LiteralPath $temp -Destination $file -ErrorAction Stop } catch { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}
Write-Output $runId
