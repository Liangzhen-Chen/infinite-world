param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Join-Path $taskRoot 'SillyTavern'
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$logsDir = Join-Path $taskRoot 'logs'
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$taskListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $taskListener) {
    $taskProcess = Start-Process -FilePath $nodeExe -ArgumentList @('server.js') -WorkingDirectory $serverRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logsDir 'server.log') -RedirectStandardError (Join-Path $logsDir 'server-error.log') -PassThru
    Set-Content -LiteralPath (Join-Path $logsDir 'server.pid') -Value $taskProcess.Id
}
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/csrf-token' -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw '酒馆未能启动，请查看 dnd\logs 中的日志。' }
$backupRoot = Join-Path $taskRoot 'backups'
$backupDir = Join-Path $backupRoot (Get-Date -Format 'yyyy-MM-dd_HHmmss')
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$userData = Join-Path $serverRoot 'data\default-user'
foreach ($folder in @('chats','characters','worlds')) {
    $source = Join-Path $userData $folder
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $backupDir -Recurse }
}
$extensionSource = Join-Path $serverRoot 'public\scripts\extensions\third-party\infinite-fields'
if (Test-Path -LiteralPath $extensionSource) { Copy-Item -LiteralPath $extensionSource -Destination $backupDir -Recurse }
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8000/play-town.html' }
