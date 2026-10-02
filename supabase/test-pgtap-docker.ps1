param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^supabase_db_[a-zA-Z0-9_-]+$')]
  [string]$Container,
  [string]$LogPath
)

$ErrorActionPreference = 'Stop'
$taskTestsPath = Join-Path $PSScriptRoot 'tests/database'
$taskTests = Get-ChildItem -LiteralPath $taskTestsPath -Filter '*.sql' | Sort-Object Name
foreach ($taskTest in $taskTests) {
  $taskSql = Get-Content -LiteralPath $taskTest.FullName -Raw
  if ($taskSql -notmatch '(?m)^BEGIN;' -or $taskSql -notmatch '(?m)^ROLLBACK;\s*$') {
    throw ('La prueba debe ejecutarse en transacción con ROLLBACK: ' + $taskTest.Name)
  }
}
$taskHistory = & docker exec $Container psql -X -U postgres -d postgres -t -A -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261002225129','20261002225133','20261002225137');" 2>&1
if ($LASTEXITCODE -ne 0 -or ($taskHistory | Out-String).Trim() -ne '3') {
  throw 'El contenedor debe ser una base de pruebas FGE con las tres migraciones SCRUM-84/87 aplicadas.'
}
$taskContainerPath = '/tmp/fge-pgtap-' + [guid]::NewGuid().ToString('N')
& docker cp $taskTestsPath ("${Container}:" + $taskContainerPath)
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron copiar las pruebas al contenedor.' }
if ($LogPath) { Set-Content -LiteralPath $LogPath -Value '' -Encoding utf8 }
$taskAssertions = 0
$taskFailures = 0
foreach ($taskTest in $taskTests) {
  $taskOutput = & docker exec $Container psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -f ($taskContainerPath + '/' + $taskTest.Name) 2>&1
  $taskExit = $LASTEXITCODE
  $taskText = $taskOutput | Out-String
  if ($LogPath) { Add-Content -LiteralPath $LogPath -Value ($taskTest.Name + "`n" + $taskText) -Encoding utf8 }
  $taskAssertions += @($taskOutput | Where-Object { $_ -match '^ok [0-9]' }).Count
  if ($taskExit -ne 0 -or $taskText -match '(?m)^not ok [0-9]' -or $taskText -notmatch '(?m)^1\.\.[0-9]+\s*$') {
    $taskFailures++
    Write-Output ('FAIL ' + $taskTest.Name)
    $taskOutput | Where-Object { $_ -match 'not ok|ERROR|Failed test|have:|want:' }
  } else { Write-Output ('PASS ' + $taskTest.Name) }
}
Write-Output ('Aserciones: ' + $taskAssertions + '; archivos: ' + $taskTests.Count + '; fallos: ' + $taskFailures)
if ($taskFailures -ne 0) { throw 'La suite pgTAP contiene fallos.' }
