param(
  [string]$Out = "evidencias\QA-$(Get-Date -Format 'yyyy-MM-dd')"
)

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$script:resultados = @()

function Invoke-QA {
  param([string]$Nombre, [scriptblock]$Comando)
  $log = Join-Path $Out "$Nombre.log"
  "== $Nombre == $(Get-Date -Format o)" | Out-File -FilePath $log -Encoding utf8
  & $Comando *>&1 | Tee-Object -FilePath $log -Append | Out-Null
  $code = $LASTEXITCODE
  "EXIT_CODE=$code" | Tee-Object -FilePath $log -Append | Out-Null
  $script:resultados += [pscustomobject]@{
    Evidencia = $Nombre
    Codigo    = $code
    Archivo   = $log
  }
}

# Entorno
git rev-parse HEAD        | Tee-Object -FilePath "$Out\00-entorno.txt"
node --version            | Tee-Object -FilePath "$Out\00-entorno.txt" -Append
npm.cmd --version         | Tee-Object -FilePath "$Out\00-entorno.txt" -Append

# Backend
Invoke-QA "01-organizations" { npm.cmd test --workspace=@fge/organizations-service }
Invoke-QA "02-auth"          { npm.cmd test --workspace=@fge/auth-service }
Invoke-QA "03-insights"      { npm.cmd test --workspace=@fge/insights-service }
Invoke-QA "04-gateway"       { npm.cmd test --workspace=@fge/api-gateway }

# Base de datos embebida
Invoke-QA "05-donaciones-pglite" {
  node --experimental-strip-types --test frontend/tests/validaciones/donaciones.persistencia.test.mjs
}

# Frontend
Invoke-QA "06-frontend-unit" { npm.cmd test --workspace=frontend }
Invoke-QA "07-frontend-build" { npm.cmd run build:frontend }

$script:resultados | Format-Table -AutoSize
$script:resultados | Export-Csv "$Out\resumen.csv" -NoTypeInformation -Encoding utf8
