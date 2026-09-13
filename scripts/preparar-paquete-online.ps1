param(
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "online-dist"),
  [string]$ZipName = "ServContable-PRO-Online.zip"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$ProjectRootFull = [System.IO.Path]::GetFullPath($ProjectRoot)

if (-not $OutputDir.StartsWith($ProjectRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Por seguridad, OutputDir debe estar dentro del proyecto: $ProjectRootFull"
}

$ZipPath = Join-Path $ProjectRoot $ZipName

Push-Location $ProjectRoot
try {
  npm run build:web

  if (Test-Path -LiteralPath $OutputDir) {
    Remove-Item -LiteralPath $OutputDir -Recurse -Force
  }

  New-Item -ItemType Directory -Path $OutputDir | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $OutputDir "backend") | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $OutputDir "frontend") | Out-Null

  Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\src") -Destination (Join-Path $OutputDir "backend\src") -Recurse
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\package.json") -Destination (Join-Path $OutputDir "backend\package.json")
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\package-lock.json") -Destination (Join-Path $OutputDir "backend\package-lock.json")
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\.env.example") -Destination (Join-Path $OutputDir "backend\.env.example")
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\.env.online.example") -Destination (Join-Path $OutputDir "backend\.env.online.example")

  Copy-Item -LiteralPath (Join-Path $ProjectRoot "frontend\dist") -Destination (Join-Path $OutputDir "frontend\dist") -Recurse
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "frontend\.env.example") -Destination (Join-Path $OutputDir "frontend\.env.example")
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "frontend\.env.online.example") -Destination (Join-Path $OutputDir "frontend\.env.online.example")

  if (Test-Path -LiteralPath (Join-Path $ProjectRoot "database")) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot "database") -Destination (Join-Path $OutputDir "database") -Recurse
  } elseif (Test-Path -LiteralPath (Join-Path $ProjectRoot "backend\database")) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\database") -Destination (Join-Path $OutputDir "database") -Recurse
  }

  Copy-Item -LiteralPath (Join-Path $ProjectRoot "deploy") -Destination (Join-Path $OutputDir "deploy") -Recurse
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "README_ONLINE.md") -Destination (Join-Path $OutputDir "README_ONLINE.md")
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "README_PRODUCCION.md") -Destination (Join-Path $OutputDir "README_PRODUCCION.md")

  if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
  }

  Compress-Archive -Path (Join-Path $OutputDir "*") -DestinationPath $ZipPath -Force

  Write-Host "Paquete online generado:"
  Write-Host "Carpeta: $OutputDir"
  Write-Host "ZIP: $ZipPath"
} finally {
  Pop-Location
}
