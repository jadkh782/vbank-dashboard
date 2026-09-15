<#
.SYNOPSIS
  Installs the V-Bank ingest worker on a Windows machine that has the Barracuda VPN.

  Registers a scheduled task "V-Bank Ingest Worker" that starts `npm run ingest -- serve`
  two minutes after boot, keeps it running (restart on failure), and logs to logs\ingest.log.
  Optionally switches the power plan to "never sleep" so a laptop can act as a server.

.EXAMPLE
  cd C:\vbank\vbank-dashboard
  powershell -ExecutionPolicy Bypass -File scripts\laptop\Install-Worker.ps1 -NoSleep

.NOTES
  Run from the repository root, as the Windows user that should own the task (no admin needed
  for the task; -NoSleep needs an elevated shell). Requires Node.js 22 and services\ingest\.env.
#>
param(
  [switch]$NoSleep,
  [string]$TaskName = 'V-Bank Ingest Worker'
)

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo 'services\ingest\.env'))) {
  throw "services\ingest\.env not found — copy it from the previous machine first (see docs\LAPTOP-SETUP.md)."
}
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { throw 'npm not found — install Node.js 22 LTS first.' }
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Remove a previous registration so the script is re-runnable.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' `
  -Argument "/c `"$npm`" run ingest -- serve >> `"$logDir\ingest.log`" 2>&1" `
  -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT2M'   # give the Barracuda client time to connect
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 5) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew
# S4U: "run whether user is logged on or not" without storing a password.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'UiPath Orchestrator → Supabase worker for the V-Bank Statusbericht. Logs: logs\ingest.log' | Out-Null

if ($NoSleep) {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  powercfg /change disk-timeout-ac 0
  # Lid close: do nothing (AC and DC)
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
  powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
  powercfg /setactive SCHEME_CURRENT
  Write-Host 'Power plan: never sleep/hibernate on AC, lid close does nothing.'
}

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Task '$TaskName' registered and started (state: $((Get-ScheduledTask -TaskName $TaskName).State), last result: $($info.LastTaskResult))."
Write-Host "Log: $logDir\ingest.log — the Control Board (Einstellungen) should show 'Worker aktiv' within a minute."
