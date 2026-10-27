<#
  SecureMeet AI - safe local setup for Windows PowerShell.
  Run from the project root:
      powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
  What it does: checks Node.js, creates .env files (only if missing), installs dependencies,
  generates the Prisma client and starts PostgreSQL in Docker if Docker is available.
  It never overwrites an existing .env file and never deletes anything.
#>
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

Step 'Checking Node.js (need v20 or newer)'
try { $nodeVersion = (& node -v) } catch { Fail 'Node.js was not found. Install the LTS version from https://nodejs.org, reopen VS Code, then run this script again.' }
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 20) { Fail "Node.js $nodeVersion is too old. Install the current LTS from https://nodejs.org." }
Write-Host "Found Node.js $nodeVersion"

Step 'Creating environment files (only if they do not exist)'
$apiEnv = 'apps\api\.env'
if (-not (Test-Path $apiEnv)) {
  Copy-Item 'apps\api\.env.example' $apiEnv
  $secret = (& node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").Trim()
  $path = (Resolve-Path $apiEnv).Path
  $text = [IO.File]::ReadAllText($path).Replace('REPLACE_WITH_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS', $secret)
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding $false))
  Write-Host 'Created apps\api\.env with a freshly generated JWT secret.'
} else { Write-Host 'apps\api\.env already exists - left unchanged.' }
$webEnv = 'apps\web\.env.local'
if (-not (Test-Path $webEnv)) { Copy-Item 'apps\web\.env.example' $webEnv; Write-Host 'Created apps\web\.env.local' }
else { Write-Host 'apps\web\.env.local already exists - left unchanged.' }

Step 'Installing dependencies (this can take a few minutes)'
& npm.cmd install
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. See docs\TROUBLESHOOTING.md.' }

Step 'Generating the Prisma client'
& npm.cmd run db:generate
if ($LASTEXITCODE -ne 0) { Fail 'Prisma generate failed. Close any running dev servers and retry (see docs\TROUBLESHOOTING.md).' }

Step 'PostgreSQL via Docker'
if (Get-Command docker -ErrorAction SilentlyContinue) {
  & docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    & npm.cmd run db:up
    Write-Host 'Waiting for PostgreSQL to become healthy...'
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
      $status = (& docker inspect -f '{{.State.Health.Status}}' smai-postgres 2>$null)
      if ($status -eq 'healthy') { $ok = $true; break }
      Start-Sleep -Seconds 2
    }
    if ($ok) { Write-Host 'PostgreSQL is healthy on localhost:5433.' -ForegroundColor Green }
    else { Write-Host 'PostgreSQL did not report healthy in 60s. Run: docker logs smai-postgres' -ForegroundColor Yellow }
  } else { Write-Host 'Docker is installed but not running. Start Docker Desktop and run: npm run db:up' -ForegroundColor Yellow }
} else {
  Write-Host 'Docker not found. Install Docker Desktop OR install PostgreSQL locally and edit DATABASE_URL in apps\api\.env (see docs\VS_CODE_SETUP.md, step 6B).' -ForegroundColor Yellow
}

Step 'Done. Next steps (see docs\VS_CODE_SETUP.md)'
Write-Host '  1. npm run db:push     (create the tables)'
Write-Host '  2. npm run db:seed     (optional demo accounts)'
Write-Host '  3. Terminal A: npm run dev:api     Terminal B: npm run dev:web'
Write-Host '  4. Open http://localhost:3000'
