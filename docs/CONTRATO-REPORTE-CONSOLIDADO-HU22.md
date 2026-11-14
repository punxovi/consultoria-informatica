# Consolidado HU22: contrato y verificación

## Arquitectura

`GET /api/v1/reports/consolidated` pasa por Gateway, rutas HTTP de Insights,
Application y `InsightsRepository.loadConsolidated`. El repositorio valida con
Zod y llama a `public.consultar_reporte_consolidado(p_filtros jsonb)` usando
la clave pública y el JWT del usuario. La RPC es `STABLE SECURITY INVOKER`:
consolida una instantánea por sentencia, aplica RLS y no usa service role.
Además limita las organizaciones mediante el permiso de consulta existente.
No cambia políticas, roles ni permisos sobre las tablas de origen.

Migración: `20261106200000_fge_hu22_reporte_consolidado.sql`. Requiere las
migraciones previas de actas, donaciones, indicadores, países y permisos.
Aplicarla antes de desplegar el repositorio nuevo. No cambia datos existentes.

## Solicitud

```http
GET /api/v1/reports/consolidated?fecha_inicio=2026-06-01&fecha_termino=2026-06-30&id_pais=<UUID>&destino=interno
Authorization: Bearer <sesión>
```

Obligatorios: `fecha_inicio`, `fecha_termino`, fechas calendario YYYY-MM-DD,
año 0000 prohibido, inicio <= término. Opcionales: `id_pais`,
`id_organizacion`, `id_programa`, `indicadores`, `resultados`, `destino`.
Identificadores UUID; listas separadas por comas, entre 1 y 100 elementos.
Se rechazan parámetros desconocidos, repetidos, vacíos e inválidos.

La adaptación HTTP → RPC es:

| HTTP | RPC |
| --- | --- |
| fecha_inicio / fecha_termino | startDate / endDate |
| id_pais | countryId |
| id_organizacion | organizationId |
| id_programa | programId |
| indicadores | indicatorIds: UUID[] |
| resultados | resultIds: UUID[] |

`destino` pertenece a Application y no se envía a la RPC. Los filtros se
intersectan con los permisos: no amplían el acceso. La política vigente permite
consulta transversal a COORD; INVIT permanece limitado a su país/asignación.
Cada sección conserva adicionalmente las restricciones RLS propias del módulo.
Un filtro inexistente, incompatible o fuera del acceso produce secciones vacías,
sin distinguir si existe un registro oculto.

## Semántica de consolidación

- Organizaciones y beneficiarios: fotografía actual de organizaciones no
  archivadas y países no archivados, una fila y un conteo por organización.
  No representa beneficiarios históricos del período. Con Programa se exige
  una relación visible no archivada mediante plan o donación; esa asociación
  organizacional se evalúa independientemente del período de actividades.
- Planes y Acciones: fechas de inicio/término con intersección inclusiva con el
  período solicitado. Acciones pertenecen exclusivamente a los planes elegidos.
  Programa filtra los planes mismos, no solo sus organizaciones.
- Compromisos: pertenecen al acta de la organización seleccionada. Cumplidos se
  incluyen por `cumplido_at` desde inicio 00:00 UTC hasta el día siguiente al
  término, exclusivo. Pendientes por `fecha_limite` inclusiva. Se excluyen actas
  y compromisos archivados. Programa se relaciona mediante el plan del acta.
- Donaciones: fecha inclusiva y Programa directo cuando se selecciona.
- Indicadores: pertenecen a las acciones seleccionadas. `valor_obtenido` es la
  última medición no archivada dentro del período; empates por created_at e ID.
  Sin medición devuelve null y la vista/PDF muestra «No informado».
- Resultados: mediciones de esos indicadores dentro del período inclusivo.
  `indicadores` y `resultados` restringen sus propias secciones; no eliminan
  donaciones, compromisos ni organizaciones. Con resultados específicos solo
  se incluyen indicadores con al menos uno de esos resultados.
- Secciones independientes, ordenadas por UUID: no hay join multiplicativo de
  planes, donaciones y mediciones para calcular totales. No se exportan correos,
  teléfonos ni otros datos de contacto de organizaciones.

## Respuesta y errores

Se conserva `{ok,code,message,data:{report}}`, vista previa y referencia de
PDF descritos en [REPORTES-PDF.md](REPORTES-PDF.md). Para destino interno,
`report.snapshot` contiene `generatedAt`, `period`, `filters`, `sections` y
`summary`. Secciones: organizations, plans, actions, commitments, donations,
indicators, results. Beneficiarios se presenta también en el resumen/documento.
`summary`: totalBeneficiaries, totalDonationsAmount, completedActions.

Por compatibilidad, totalDonationsAmount es la suma nominal de `monto` y no una
conversión monetaria ni un saldo recibido/entregado. No debe interpretarse como
un importe en moneda única si se mezclan monedas. No hay precios ni pagos.

Sin resultados: éxito 200 con arrays vacíos y totales cero; no se inventan
registros ni valores. Error: `{ok:false,error:{code,message,requestId},data:null}`.

| Código | HTTP | Situación |
| --- | --- | --- |
| DATOS_INVALIDOS | 400 | Fechas, orden o filtros inválidos |
| SIN_PERMISO | 401/403 | Sesión o autorización rechazada |
| RESPUESTA_INVALIDA | 502 | SQL/JSON incompleto, duplicados o contrato inconsistente |
| ERROR_BASE_DATOS | 502 | Error de consulta |
| SUPABASE_NO_DISPONIBLE | 503 | Conexión o timeout de 30 segundos |
| MIGRACION_PENDIENTE | 503 | RPC ausente o caché de esquema pendiente |
| REPORTE_DEMASIADO_GRANDE | 413 | Más de 20.000 filas entre secciones o 4 MiB |

La RPC devuelve un único JSON escalar, por lo que el límite PostgREST max_rows
no trunca sus secciones. Si se supera el límite explícito, falla la consulta
completa: nunca entrega un reporte parcial. El PDF usa la misma instantánea
preparada; descarga y privacidad externa mantienen su contrato previo.

## Pruebas reproducibles

```powershell
node --experimental-strip-types --test backend/services/insights/tests/*.test.ts frontend/tests/validaciones/reportes.consolidado.persistencia.test.mjs frontend/tests/validaciones/reportes-consulta.test.mjs
```

Las pruebas de persistencia usan PostgreSQL embebido (PGlite), migraciones SQL
reales, roles authenticated/anon y RLS. Auth/Storage tienen soporte mínimo;
no sustituyen una prueba de login con Supabase Auth. Se crean dos países,
organizaciones y programas, planes/acciones de distintos períodos, actas,
compromisos, donaciones e indicadores con mediciones dentro/fuera de fechas.
Se verifican conteos esperados, filtros cruzados, alcance INVIT y consulta COORD,
1.001 donaciones completas, límite de 20.000, ausencia de mediciones, archivados,
frontera UTC, consulta vacía, errores y el repositorio sobre la respuesta SQL real.
La suite de Insights verifica además HTTP/Gateway, contratos, privacidad y PDF.

## Evidencia de validación — 6 de noviembre de 2026

- Suite conjunta: 53 pruebas aprobadas, cero fallas (Insights + consulta cliente +
  persistencia). Se añadió después un caso para listas HTTP vacías; los tres
  casos del archivo de dominio pasan. La migración final con CREATE OR REPLACE
  se volvió a ejecutar en PostgreSQL: nueve casos de persistencia aprobados.
- TypeScript estricto sin errores para consolidated-report.ts y el repositorio
  Supabase, incluidas sus dependencias de tipos. git diff --check sin errores.
- Supabase remoto: proyecto fge-dev, referencia jjarthmbasxtjfyhscai.
  Prueba transaccional con ROL authenticated y la identidad de un ADMIN activo;
  consulta anual 2026: 25 organizaciones, 10 planes, 11 acciones, 7 compromisos,
  2 donaciones, 15 indicadores y 1 resultado. Se devolvieron solo conteos al
  editor; esa comprobación usó ROLLBACK.
- Migración aplicada y registrada posteriormente en schema_migrations:
  versión 20261106200000, nombre fge_hu22_reporte_consolidado.
  Comprobación final: security_definer=false, ejecución anon=false,
  ejecución authenticated=true. Se sustituyó una RPC preexistente no registrada
  para esta versión; CREATE OR REPLACE conserva compatibilidad de firma.
- La prueba remota usa SQL con identidad/rol y RLS reales; no constituye una
  prueba de inicio de sesión mediante Supabase Auth ni un despliegue del proceso
  Node.js. Los cambios de backend permanecen en este checkout para su despliegue.
