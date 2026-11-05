# Plan para generar evidencias de tareas ya aprobadas

**Objetivo:** producir evidencia reproducible de las tareas del sprint que ya fueron aprobadas, para mostrarla en la presentación de QA.
**Tiempo estimado:** 3–4 horas (versión mínima: 90 minutos).
**Regla de oro:** si una prueba no se ejecutó, se registra como **pendiente**. Nunca como aprobada.

---

## 1. Qué se considera evidencia válida

Una evidencia sirve si permite que otra persona repita la verificación sin preguntarte nada:

1. **Comando exacto** o pasos manuales.
2. **Commit y rama** sobre los que se ejecutó.
3. **Resultado**: `N/N pruebas`, código de salida `0`, captura o PDF.
4. **Archivo o pantalla** que respalde el criterio.
5. **Fecha y entorno** (Node, navegador, sistema).

No sirve:
- “Los tests pasan” sin log.
- Una captura sin URL ni dato visible.
- Un video sin el nombre de la prueba.
- Una prueba de base de datos dicha de memoria.

---

## 2. Niveles de evidencia

| Nivel | Qué prueba | Evidencia |
|---|---|---|
| **E1 — Revisión estática** | Que el criterio está implementado y dónde | `archivo:línea`, diff o captura del código |
| **E2 — Pruebas automáticas** | Lógica, validaciones, errores | Log con `N/N` y código de salida |
| **E3 — Base de datos / RLS** | Permisos, triggers, funciones, vigencia | PGlite o pgTAP con resultado |
| **E4 — E2E** | Flujo real de punta a punta | Captura/video/trace de Playwright |
| **E5 — Manual / API** | Caso que no cubre un test | Captura de pantalla o respuesta HTTP guardada |

Para la presentación alcanza con **E1 + E2 + una E4**. E3 se agrega solo si el entorno lo permite.

---

## 3. Tareas seleccionadas (ya aprobadas)

| # | Tarea | ID | Qué verificar | Evidencia mínima |
|---|---|---|---|---|
| 1 | Operaciones y persistencia de países | SCRUM-149 | Alta, edición, listado, validaciones y permisos | `countries.test.ts` + E2E de países |
| 2 | Cuentas de coordinadores (backend + interfaz) | SCRUM-145 / 148 | Creación, edición, filtros, restricciones por rol | Tests de Auth + validaciones + E2E |
| 3 | Autorización territorial y caducidad de coberturas | SCRUM-153 | Vigencia, caducidad, alcance por país | Tests de coberturas + pgTAP 025 |
| 4 | Flujo completo de donaciones | SCRUM-135 | Registro, respaldo, permisos, montos | Tests de donaciones + PGlite + captura |
| 5 | Reportes y exportación PDF | SCRUM-139 / 141 | Filtros, vista previa, PDF, errores | Tests de Insights + E2E + PDF de muestra |
| 6 | Navegación contextual | SCRUM-126 | Rutas, filtros conservados, accesibilidad | E2E de navegación + capturas |

> Ajusta los IDs si tu tablero usa otro nombre. Lo importante es que cada fila tenga **criterio → prueba → archivo**.

---

## 4. Preparar un entorno limpio (no usar la rama con cambios en curso)

La copia actual puede tener trabajo sin commitear. Para la evidencia usa un **worktree limpio** del commit que vas a presentar:

```powershell
cd C:\Users\Benjamin\Desktop\ConsultoriaInformatica\consultoria-informatica
git fetch origin
git worktree add --detach ..\qa-sprint9 origin/sprint-9
cd ..\qa-sprint9
npm.cmd ci
```

Verifica el punto de partida y guárdalo como evidencia:

```powershell
git rev-parse HEAD
git branch --show-current
node --version
npm.cmd --version
```

> Si vas a mostrar las correcciones de SCRUM-136/152/157, usa la rama donde estén esas correcciones. No mezcles ese commit con otro en la misma evidencia.

---

## 5. Estructura de la carpeta de evidencias

```
evidencias/
  QA-2026-11-06/
    00-entorno.md
    00-indice.md
    01-paises/
      comando.txt
      test-organizations.log
      e2e-paises.png
      ficha.md
    02-coordinadores/
    03-coberturas/
    04-donaciones/
    05-reportes/
    06-navegacion/
    resumen.csv
```

Nombres de archivo:

```
<TAREA>-<capa>-<fecha>.<ext>
SCRUM-149-e2e-2026-11-06.png
SCRUM-135-pglite-2026-11-06.log
```

---

## 6. Comandos por tarea

Ejecuta desde la raíz del worktree limpio. Guarda cada salida en su carpeta.

### 6.1 Países — SCRUM-149

```powershell
npm.cmd test --workspace=@fge/organizations-service
```

```powershell
cd frontend
npm.cmd exec -- playwright test --config playwright.paises.config.mjs --trace on
cd ..
```

**Evidencia:** log de `countries.test.ts` + captura del listado/alta de países + trace si hubo fallo.

### 6.2 Coordinadores — SCRUM-145 / 148

```powershell
npm.cmd test --workspace=@fge/auth-service
node --experimental-strip-types --test frontend/tests/validaciones/coordinadores.test.mjs
```

```powershell
cd frontend
npm.cmd exec -- playwright test --config playwright.coordinadores.config.mjs --trace on
cd ..
```

**Evidencia:** tests de Auth, validaciones del formulario y captura de alta/edición.

### 6.3 Coberturas — SCRUM-153

```powershell
npm.cmd test --workspace=@fge/organizations-service
```

```powershell
supabase test db
```

> `supabase test db` requiere Docker y Supabase CLI. Si no están disponibles, **no lo ejecutes**: deja la fila como “pendiente de entorno” y usa como respaldo la revisión estática de `025_scrum153_autorizacion_temporal_local.test.sql`.

**Evidencia:** log de `coverages.test.ts`, captura de la pantalla de coberturas y, si se pudo, resultado de pgTAP.

### 6.4 Donaciones — SCRUM-135

```powershell
npm.cmd test --workspace=@fge/organizations-service
node --experimental-strip-types --test frontend/tests/validaciones/donaciones.persistencia.test.mjs
```

**Evidencia:** log de tests de donaciones, log de PGlite y captura del registro con monto/comprobante.

### 6.5 Reportes y PDF — SCRUM-139 / 141

```powershell
npm.cmd test --workspace=@fge/insights-service
node --experimental-strip-types --test frontend/tests/validaciones/reportes-configuracion.test.mjs
node --experimental-strip-types --test frontend/tests/validaciones/reportes-consulta.test.mjs
node --experimental-strip-types --test frontend/tests/validaciones/reportes-vista-previa.test.mjs
```

```powershell
cd frontend
npm.cmd exec -- playwright test --config playwright.reportes.config.mjs --trace on
cd ..
```

**Evidencia:** log de Insights, log de validaciones, captura de vista previa y **un PDF generado** guardado como muestra.

### 6.6 Navegación contextual — SCRUM-126

```powershell
npm.cmd run test:e2e:navegacion --workspace=frontend
```

**Evidencia:** log de Playwright + capturas de las tres rutas (Organización → Plan → Programa) mostrando que el filtro se conserva.

### 6.7 Cierre técnico del lote

```powershell
npm.cmd run check:architecture
npm.cmd run test:architecture
npm.cmd test --workspace=frontend
npm.cmd run build:frontend
```

**Evidencia:** log de arquitectura, tests de todos los servicios y build del frontend.

---

## 7. Script de captura automática (PowerShell)

Ya está creado en `scripts/qa-evidencias.ps1`. Ejecútalo desde la raíz del worktree limpio; guarda logs y un resumen CSV.

```powershell
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

$resultados | Format-Table -AutoSize
$resultados | Export-Csv "$Out\resumen.csv" -NoTypeInformation -Encoding utf8
```

> El script no ejecuta pgTAP ni pruebas contra Supabase remoto. Eso se hace aparte y se registra como evidencia E3 solo si el entorno existe.

---

## 8. Captura de evidencia visual

Para cada flujo que vayas a mostrar:

1. Abre la aplicación con datos de prueba.
2. Deja visible la **URL**, el **usuario** y el **dato** que prueba el criterio.
3. Captura pantalla completa (no solo el botón).
4. Guarda con el nombre `SCRUM-XXX-e2e-fecha.png`.
5. Si el flujo tiene varios pasos, guarda 2–3 capturas: antes, resultado y error controlado.

Para evidencia técnica adicional:

```powershell
cd frontend
npm.cmd exec -- playwright test --config playwright.paises.config.mjs --trace on
```

El `trace.zip` queda en `test-results/`. Se abre con:

```powershell
npm.cmd exec -- playwright show-trace test-results\<carpeta>\trace.zip
```

---

## 9. Ficha de evidencia por tarea (copiar y pegar)

```markdown
## SCRUM-XXX — <nombre de la tarea>

**Criterio verificado:** <texto del criterio>
**Commit:** <hash>
**Entorno:** Node <versión> · <navegador> · <fecha>

**Prueba ejecutada:**
`<comando exacto>`

**Resultado:**
<N/N pruebas> · código de salida <0/1>

**Evidencia:**
- Log: `<ruta>`
- Captura: `<ruta>`
- Código revisado: `<archivo:línea>`

**Observaciones:**
<ninguna / detalle>

**Estado:** aprobada / aprobada con observaciones / pendiente de entorno
```

---

## 10. Índice para la presentación

```markdown
# Evidencias QA — <fecha>

Commit: <hash> · Rama: <rama> · Node: <versión>

| Tarea | Criterio | Evidencia | Archivo | Resultado |
|---|---|---|---|---|
| SCRUM-149 | Alta y listado de países | Tests + E2E | `01-paises/` | 12/12 · OK |
| SCRUM-145/148 | Cuentas de coordinadores | Tests + E2E | `02-coordinadores/` | 21/21 · OK |
| SCRUM-153 | Vigencia de coberturas | Tests + pgTAP | `03-coberturas/` | 8/8 · pgTAP pendiente |
| SCRUM-135 | Flujo de donaciones | Tests + PGlite | `04-donaciones/` | 14/14 · OK |
| SCRUM-139/141 | Reportes y PDF | Tests + E2E | `05-reportes/` | 32/32 · PDF adjunto |
| SCRUM-126 | Navegación contextual | E2E | `06-navegacion/` | 6/6 · OK |

**Pendiente de entorno:** pgTAP / Supabase remoto.
**No incluido:** tareas con hallazgos bloqueantes.
```

> Reemplaza los `N/N` por los números reales de tus logs. No copies cifras de ejemplo.

---

## 11. Criterios para declarar una tarea “con evidencia”

- [ ] El criterio está escrito y es verificable.
- [ ] Hay una prueba automatizada o un paso manual reproducibble.
- [ ] El log muestra el comando, el resultado y el código de salida.
- [ ] Hay al menos una captura o artefacto del flujo real.
- [ ] La evidencia está enlazada desde el índice.
- [ ] Si no se ejecutó algo, dice **pendiente** y explica por qué.

Si falta uno de los tres primeros puntos, la tarea queda como **“aprobada sin evidencia completa”**, no como cerrada.

---

## 12. Cronograma recomendado

### Versión completa (3–4 horas)

| Bloque | Tiempo | Actividad |
|---|---|---|
| 1 | 30 min | Worktree limpio, `npm ci`, registrar entorno |
| 2 | 60 min | Tests backend + PGlite + build |
| 3 | 60 min | E2E y capturas de los 6 flujos |
| 4 | 30 min | Completar fichas e índice |
| 5 | 20 min | Adjuntar evidencias al PPT |

### Versión mínima (90 minutos)

1. Worktree limpio y `npm ci` (20 min).
2. `npm.cmd run test:architecture` + `npm.cmd test --workspace=frontend` (30 min).
3. E2E de países, coordinadores y reportes (30 min).
4. Tres capturas + índice corto (10 min).

Con eso ya tienes evidencia real para las diapositivas 5 y 7.

---

## 13. Riesgos y límites (dilos en la presentación)

| Riesgo | Cómo se maneja |
|---|---|
| No hay Docker ni Supabase CLI | pgTAP queda **pendiente**; se usa PGlite y revisión estática |
| No hay Supabase remoto | No se afirma despliegue ni migración aplicada |
| La rama actual tiene cambios en curso | Se usa un worktree limpio del commit presentado |
| E2E depende de datos y usuario de prueba | Se documenta el seed y el usuario usado |
| Hay fallos preexistentes fuera del lote | Se registran como línea base, no como regresión |
| Videos/logs pesados | Se guardan fuera de Git y se enlazan desde el índice |

---

## 14. Cómo se conecta con el PPT

| Diapositiva | Evidencia que adjuntas |
|---|---|
| 3 — Protocolo | Índice de tareas y veredictos |
| 4 — Dimensiones | Un hallazgo por dimensión (captura de código) |
| 5 — Evidencia | Log de tests + captura E2E + ficha |
| 6 — Hallazgo | Ficha completa con `archivo:línea` |
| 7 — Estado | Tabla de veredictos + pendientes |
| 8 — Cierre | Lista de próximos pasos |

---

## 15. Checklist final

- [ ] Worktree limpio y commit identificado.
- [ ] Logs con `EXIT_CODE=0` de las suites que voy a mostrar.
- [ ] Al menos 3 capturas con URL y dato visible.
- [ ] Fichas de evidencia completas.
- [ ] Índice con enlaces a los archivos.
- [ ] Pendientes declarados explícitamente.
- [ ] Nada de cifras inventadas.
- [ ] Nada de “desplegado” si no se desplegó.
