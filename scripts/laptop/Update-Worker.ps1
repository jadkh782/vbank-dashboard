<#
.SYNOPSIS
  Pulls the latest worker code and restarts the scheduled task.

.EXAMPLE
  cd C:\vbank\vbank-dashboard
  powershell -ExecutionPolicy Bypass -File scripts\laptop\Update-Worker.ps1
#>
param([string]$TaskName = 'V-Bank Ingest Worker')

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
# The task runs cmd → npm → node; stop any leftover worker process too.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like '*services/ingest*' -or $_.CommandLine -like '*services\ingest*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'git pull failed' }
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
npm run ingest -- check
if ($LASTEXITCODE -ne 0) { Write-Warning 'ingest check reported failures (VPN down?) — the task is restarted anyway; it retries on its own.' }

Start-ScheduledTask -TaskName $TaskName
Write-Host "Updated to $(git rev-parse --short HEAD) and restarted '$TaskName'."
