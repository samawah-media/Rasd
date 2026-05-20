param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$AdminToken = $env:RASD_ADMIN_IMPORT_TOKEN,
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $projectRoot ".env.local"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") {
      return
    }

    $name, $value = $_ -split "=", 2
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

if (-not $AdminToken) {
  $AdminToken = $env:RASD_ADMIN_IMPORT_TOKEN
}

$dryRunValue = -not $Execute
$headers = @{ "Content-Type" = "application/json" }

if ($Execute) {
  if (-not $AdminToken) {
    throw "Missing RASD_ADMIN_IMPORT_TOKEN. Real upsert requires the same token loaded by the Next.js server."
  }
  $headers["x-rasd-admin-token"] = $AdminToken
}

$body = @{ dry_run = $dryRunValue } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/imports/legacy/upsert-supabase" -Headers $headers -Body $body
