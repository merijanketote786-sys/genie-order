# Vyapar -> OrderBot rate sync
# Windows par chalne wali script. Vyapar se export ki hui Excel/CSV file
# ko parh kar rates app par bhej deti hai.
#
# Chalane ka tareeqa (PowerShell me):
#   .\vyapar-sync.ps1 -Folder "C:\VyaparExport" -ApiKey "<aapki key>"

param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [Parameter(Mandatory = $true)][string]$ApiKey,
  [string]$Url = "https://orderbot.hbchemicalspakistan.com/api/public/sync/products"
)

$ErrorActionPreference = "Stop"

function Get-LatestExport {
  Get-ChildItem -Path $Folder -Include *.xlsx, *.xls, *.csv -File -Recurse:$false |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Convert-ToCsv([string]$path) {
  if ($path.ToLower().EndsWith(".csv")) { return $path }
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($path)
  $csv = Join-Path $env:TEMP "vyapar-sync.csv"
  $wb.SaveAs($csv, 6)
  $wb.Close($false)
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  return $csv
}

function Get-Column($row, [string[]]$names) {
  foreach ($n in $names) {
    foreach ($p in $row.PSObject.Properties) {
      $clean = ($p.Name -replace '[^a-zA-Z0-9 ]', ' ') -replace '\s+', ' '
      if ($clean.Trim().ToLower() -eq $n) { return $p.Value }
    }
  }
  foreach ($n in $names) {
    foreach ($p in $row.PSObject.Properties) {
      $clean = (($p.Name -replace '[^a-zA-Z0-9 ]', ' ') -replace '\s+', ' ').Trim().ToLower()
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
  $s = ([string]$v) -replace '[^0-9\.\-]', ''
  if ([string]::IsNullOrWhiteSpace($s)) { return 0 }
  return [double]$s
}

$file = Get-LatestExport
if (-not $file) { Write-Error "Folder me koi Excel/CSV file nahi mili: $Folder"; exit 1 }
Write-Host "File: $($file.FullName)"

$csv = Convert-ToCsv $file.FullName
$rows = Import-Csv -Path $csv

$products = @()
foreach ($r in $rows) {
  $name = Get-Column $r @("item name", "product name", "name", "item", "product")
  if ([string]::IsNullOrWhiteSpace($name)) { continue }
  $price = Get-Column $r @("sale price", "sales price", "selling price", "rate", "price")
  $unit = Get-Column $r @("unit", "base unit", "uom")
  $stock = Get-Column $r @("stock", "closing stock", "current stock", "quantity", "qty")

  $products += [pscustomobject]@{
    name       = ([string]$name).Trim()
    unit       = Map-Unit ([string]$unit)
    sale_price = To-Number $price
    stock      = To-Number $stock
  }
}

if ($products.Count -eq 0) { Write-Error "Koi product row nahi mili."; exit 1 }
Write-Host "Products: $($products.Count)"

$body = @{ products = $products } | ConvertTo-Json -Depth 5 -Compress
$resp = Invoke-RestMethod -Uri $Url -Method Post -Body $body `
  -ContentType "application/json" -Headers @{ "x-api-key" = $ApiKey }

Write-Host "Sync done:" ($resp | ConvertTo-Json -Compress)
