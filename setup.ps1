# One-time setup for Windows:
#   1. downloads the pinned PocketBase build for this CPU and verifies its checksum
#   2. creates pb_public\config.js from the example if it doesn't exist
# Safe to re-run. Usage: powershell -ExecutionPolicy Bypass -File setup.ps1 [-Force]
#   (-Force re-downloads PocketBase)
param([switch]$Force)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # makes Invoke-WebRequest much faster on PS 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot

$PbVersion = "0.39.4"

# --- PocketBase ---
$exe = Join-Path $PSScriptRoot "pocketbase.exe"
if ((Test-Path $exe) -and -not $Force) {
  $current = (& $exe --version) 2>$null
  if ($current -match [regex]::Escape($PbVersion)) {
    Write-Host "PocketBase $PbVersion already installed."
  } else {
    Write-Host "Found existing pocketbase.exe ($current); leaving it alone. Re-run with -Force to replace it with $PbVersion." -ForegroundColor Yellow
  }
} else {
  switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { $arch = "amd64" }
    "ARM64" { $arch = "arm64" }
    default { throw "Unsupported CPU architecture '$env:PROCESSOR_ARCHITECTURE'." }
  }
  if (Get-Process pocketbase -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }) {
    throw "PocketBase is running from this folder. Stop it first, then re-run setup."
  }

  $zip  = "pocketbase_${PbVersion}_windows_${arch}.zip"
  $base = "https://github.com/pocketbase/pocketbase/releases/download/v$PbVersion"
  $tmp  = Join-Path ([IO.Path]::GetTempPath()) ("pb_setup_" + [guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    Write-Host "Downloading $zip..."
    Invoke-WebRequest -UseBasicParsing "$base/$zip" -OutFile "$tmp\$zip"
    Invoke-WebRequest -UseBasicParsing "$base/checksums.txt" -OutFile "$tmp\checksums.txt"

    $line = Get-Content "$tmp\checksums.txt" | Where-Object { $_ -match "\s$([regex]::Escape($zip))$" }
    if (-not $line) { throw "No checksum listed for $zip." }
    $expected = ($line -split "\s+")[0].ToLower()
    $actual = (Get-FileHash "$tmp\$zip" -Algorithm SHA256).Hash.ToLower()
    if ($expected -ne $actual) { throw "Checksum mismatch for $zip (expected $expected, got $actual)." }
    Write-Host "Checksum OK."

    Expand-Archive "$tmp\$zip" -DestinationPath "$tmp\x" -Force
    Move-Item "$tmp\x\pocketbase.exe" $exe -Force
    Write-Host "Installed PocketBase $PbVersion (windows/$arch)." -ForegroundColor Green
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

# --- Config ---
$cfg = Join-Path $PSScriptRoot "pb_public\config.js"
if (Test-Path $cfg) {
  Write-Host "pb_public\config.js already exists; leaving it alone."
} else {
  Copy-Item (Join-Path $PSScriptRoot "pb_public\config.example.js") $cfg
  Write-Host "Created pb_public\config.js. Edit it to set your users' names." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1. (optional) create a dashboard admin: .\pocketbase.exe superuser upsert you@example.com <password>"
Write-Host "  2. start the app: double-click 'Launch Budget Tracker.bat'"
