param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$DbPassword = $env:SUPABASE_DB_PASSWORD,
  [string]$DbUrl = $env:SUPABASE_DB_URL,
  [switch]$DryRun
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

if (-not $ProjectRef) {
  $ProjectRef = $env:SUPABASE_PROJECT_REF
}

if (-not $DbPassword) {
  $DbPassword = $env:SUPABASE_DB_PASSWORD
}

if (-not $DbUrl) {
  $DbUrl = $env:SUPABASE_DB_URL
}

if (-not $DbUrl -and -not $ProjectRef) {
  throw "Missing SUPABASE_PROJECT_REF. Set it in .env.local or pass -ProjectRef."
}

if (-not $DbUrl -and -not $DbPassword) {
  throw "Missing SUPABASE_DB_PASSWORD. Put the real database password in .env.local or pass -DbPassword."
}

if (-not $DbUrl) {
  $encodedPassword = [System.Uri]::EscapeDataString($DbPassword)
  $DbUrl = "postgresql://postgres:$encodedPassword@db.$ProjectRef.supabase.co:5432/postgres"
}

$supabaseArgs = @("supabase", "db", "push", "--db-url", $DbUrl, "--include-all", "--yes")

if ($DryRun) {
  $supabaseArgs += "--dry-run"
}

Push-Location $projectRoot
try {
  & npx --yes @supabaseArgs
  if ($LASTEXITCODE -ne 0) {
    throw "supabase db push failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
