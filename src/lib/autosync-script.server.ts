/**
 * Windows auto-sync generator.
 * Builds a self-contained watcher script + a one-click .cmd installer that
 * embeds the watcher as a base64 (UTF-16LE) PowerShell command.
 */

export function buildWatcherScript(opts: { apiKey: string; url: string; folder: string }) {
  const { apiKey, url, folder } = opts;
  return `# OrderBot auto sync watcher (Vyapar -> OrderBot rates)
param(
  [string]$Folder = "${folder}",
  [string]$ApiKey = "${apiKey}",
  [string]$Url = "${url}"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Folder)) { New-Item -ItemType Directory -Path $Folder | Out-Null }
$stateFile = Join-Path $env:LOCALAPPDATA "OrderBotSync\\last.txt"

function Convert-ToCsv([string]$path) {
  if ($path.ToLower().EndsWith(".csv")) { return $path }
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($path)
  $csv = Join-Path $env:TEMP "orderbot-vyapar.csv"
  if (Test-Path $csv) { Remove-Item $csv -Force }
  $wb.SaveAs($csv, 6)
  $wb.Close($false)
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  return $csv
}

function Get-Column($row, [string[]]$names) {
  foreach ($n in $names) {
    foreach ($p in $row.PSObject.Properties) {
      $clean = ((($p.Name -replace '[^a-zA-Z0-9 ]', ' ') -replace '\\s+', ' ')).Trim().ToLower()
      if ($clean -eq $n) { return $p.Value }
    }
  }
  foreach ($n in $names) {
    foreach ($p in $row.PSObject.Properties) {
      $clean = ((($p.Name -replace '[^a-zA-Z0-9 ]', ' ') -replace '\\s+', ' ')).Trim().ToLower()
      if ($clean.Contains($n)) { return $p.Value }
    }
  }
  return $null
}

function Map-Unit([string]$raw) {
  $u = ($raw -replace '[^a-zA-Z]', '').ToLower()
  switch -Regex ($u) {
    '^(kg|kgs|kilogram|kilograms)$' { return "kg" }
    '^(g|gm|gms|gram|grams|gramme|grammes)$' { return "grammes" }
    '^(l|ltr|ltrs|litre|litres|liter|liters)$' { return "litre" }
    '^(piece|pieces)$' { return "piece" }
    '^(bottle|bottles|btl)$' { return "bottles" }
    '^(bundle|bundles|bdl)$' { return "bundles" }
    default { return "pcs" }
  }
}

function To-Number($v) {
  if ($null -eq $v) { return 0 }
  $s = ([string]$v) -replace '[^0-9\\.\\-]', ''
  if ([string]::IsNullOrWhiteSpace($s)) { return 0 }
  return [double]$s
}

function Send-File([string]$path) {
  $csv = Convert-ToCsv $path
  $rows = Import-Csv -Path $csv
  $products = @()
  foreach ($r in $rows) {
    $name = Get-Column $r @("item name", "product name", "name", "item", "product")
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $price = To-Number (Get-Column $r @("sale price", "sales price", "selling price", "rate", "price"))
    if ($price -le 0) { continue }
    $unit = Get-Column $r @("unit", "base unit", "uom")
    $stock = Get-Column $r @("stock", "closing stock", "current stock", "quantity", "qty")
    $products += [pscustomobject]@{
      name       = ([string]$name).Trim()
      unit       = Map-Unit ([string]$unit)
      sale_price = $price
      stock      = To-Number $stock
    }
  }
  if ($products.Count -eq 0) { Write-Host "No product rows found in $path"; return }
  $body = @{ products = $products } | ConvertTo-Json -Depth 5 -Compress
  $resp = Invoke-RestMethod -Uri $Url -Method Post -Body $body -ContentType "application/json" -Headers @{ "x-api-key" = $ApiKey }
  Write-Host ("Synced " + $products.Count + " products: " + ($resp | ConvertTo-Json -Compress))
}

function Get-Latest {
  Get-ChildItem -Path $Folder -File |
    Where-Object { $_.Extension -match '^\\.(xlsx|xls|csv)$' -and $_.Name -notlike '~$*' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$last = ""
if (Test-Path $stateFile) { $last = (Get-Content $stateFile -Raw).Trim() }

Write-Host "Watching $Folder ..."
while ($true) {
  try {
    $f = Get-Latest
    if ($f) {
      $stamp = $f.FullName + "|" + $f.LastWriteTimeUtc.Ticks + "|" + $f.Length
      if ($stamp -ne $last) {
        Start-Sleep -Seconds 3
        $f = Get-Item $f.FullName
        $stamp = $f.FullName + "|" + $f.LastWriteTimeUtc.Ticks + "|" + $f.Length
        Send-File $f.FullName
        $last = $stamp
        New-Item -ItemType Directory -Force -Path (Split-Path $stateFile) | Out-Null
        Set-Content -Path $stateFile -Value $last
      }
    }
  } catch {
    Write-Host ("Error: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds 10
}
`;
}

function installerPowerShell(opts: { apiKey: string; url: string; folder: string }) {
  const watcher = buildWatcherScript(opts).replace(/'/g, "''");
  return `$dir = Join-Path $env:LOCALAPPDATA 'OrderBotSync'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$watch = Join-Path $dir 'watcher.ps1'
Set-Content -Path $watch -Value '${watcher}' -Encoding UTF8
if (-not (Test-Path '${opts.folder}')) { New-Item -ItemType Directory -Force -Path '${opts.folder}' | Out-Null }
$autoStart = $false
try {
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watch + '"')
  $trg = New-ScheduledTaskTrigger -AtLogOn
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName 'OrderBot Vyapar Sync' -Action $act -Trigger $trg -Settings $set -Force -ErrorAction Stop | Out-Null
  $autoStart = $true
} catch {
  $autoStart = $false
}
if (-not $autoStart) {
  try {
    $startup = [Environment]::GetFolderPath('Startup')
    $vbs = Join-Path $startup 'OrderBotSync.vbs'
    $cmd = 'CreateObject("WScript.Shell").Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + $watch + '""", 0, False'
    Set-Content -Path $vbs -Value $cmd -Encoding ASCII
    $autoStart = $true
  } catch {
    $autoStart = $false
  }
}
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.MainWindowTitle -eq 'OrderBot Sync' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process powershell -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watch + '"')
Write-Host ''
Write-Host 'OrderBot auto-sync ready.'
Write-Host 'Vyapar se export hamesha is folder me save karein: ${opts.folder}'
Write-Host 'Rates khud ba khud update ho jayenge. Ye window band kar sakte hain.'
Start-Sleep -Seconds 8
`;
}

function toUtf16leBase64(input: string) {
  let bin = "";
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff);
  }
  return btoa(bin);
}

export function buildSetupCmd(opts: { apiKey: string; url: string; folder: string }) {
  const encoded = toUtf16leBase64(installerPowerShell(opts));
  return [
    "@echo off",
    "title OrderBot Vyapar Auto Sync Setup",
    "echo Setting up OrderBot auto sync...",
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    "",
  ].join("\r\n");
}
