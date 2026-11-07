# SCRUM-152: auditoría, correcciones y contrato de coberturas

## Dictamen y alcance

Se revisó el recorrido Gateway → organizations-service → rutas HTTP → Application
→ repositorio Supabase → RPC administrar_coberturas → permisos_temporales e historial.
Se revisaron también la autorización territorial y las migraciones históricas
20261029, 20261029100000, 20261031120000, 20261102150000 y 20261102170000.

El listado administrativo, historial, alta, extensión y revocación requieren
ADMIN activo y global, con perfil y asignación activos. Por confirmación explícita
del usuario, se conserva /mine para consultar exclusivamente el contexto propio
vigente de COORD; no permite consultar ni administrar las coberturas de terceros.

## Hallazgos y correcciones

| Hallazgo | Corrección |
| --- | --- |
| El repositorio aceptaba history como array y luego lo rechazaba como objeto | Validación de respuesta Zod por operación, incluido historial |
| version_esperada omitida o null eludía la comparación SQL por lógica NULL | Número entero positivo obligatorio y seguro tanto en Zod como en SQL |
| SQL aceptaba formatos flexibles de fecha o infinity aunque HTTP los rechazaba | Función privada de fecha calendario YYYY-MM-DD, año 0000 e imposibles rechazados |
| Alta sin bloqueo por beneficiario/país, extensión sin comprobar solapamiento | Bloqueo advisory transaccional común y comprobación de intervalos locales en ambas operaciones |
| Comparación de fechas usando zona de sesión en vez de la del país | Conversión explícita por zona del país y término inclusivo hasta medianoche siguiente |
| Las migraciones del historial no garantizaban por sí mismas su inmutabilidad | RLS, revocación de acceso directo, FK a cobertura y actor, eventos válidos y triggers contra UPDATE/DELETE/TRUNCATE |
| Incompatibilidad entre id_historial/accion_at e id/created_at | Lectura compatible sin renombrar ni borrar registros, contrato externo estable |
| /mine aceptaba datos extra y no comprobaba que el beneficiario siguiera siendo COORD | Objeto vacío obligatorio y perfil, rol, asignación y país activos |
| Existía código antiguo sin montar, con x-user-id, cliente compartido e historial en escrituras separadas | Eliminado el circuito no utilizado; queda la RPC autenticada transaccional como único flujo |
| URL con codificación inválida terminaba en 500 | Error DATOS_INVALIDOS 400 |
| HTTP 401 con SQLSTATE 42501 se convertía en 403 | SESION_INVALIDA 401 tiene prioridad |
| Application dependía de validación exclusiva de la ruta | Valida también entradas e ID; el ID de ruta no puede sobrescribirse desde el cuerpo |

La compilación estricta detectó además incompatibilidad de Buffer como BodyInit
en el lector multipart compartido. Se adapta a Uint8Array sin cambiar el formato
HTTP; la regresión de Organizations incluye operaciones con archivos.

## Archivos de implementación

- backend/shared/contracts/src/coverages.contracts.ts: DTO alineados con la API
  activa, versión requerida y respuestas administrativas, de contexto e historial.

- backend/services/organizations/src/domain/coverages-api.ts: esquemas de entrada,
  respuesta y errores CoverageError, derivado de ServiceError.
- backend/services/organizations/src/application/coverages-service.ts: casos de
  uso y validación antes del repositorio.
- backend/services/organizations/src/http/coverages-routes.ts: sesión Bearer,
  rutas, contratos success/failure e identificadores de solicitud.
- backend/services/organizations/src/infrastructure/supabase-coverages.repository.ts:
  llamada RPC con JWT del solicitante y clave pública; sin clave service role.
- backend/services/organizations/src/http/body.ts: compatibilidad de tipos multipart.
- supabase/migrations/20261107010000_fge_scrum152_coberturas_integridad.sql:
  reemplazo de RPC y restricciones del historial, conservando registros existentes.
- backend/services/organizations/tests/coverages.test.ts: HTTP y respuestas remotas.
- frontend/tests/validaciones/coberturas.persistencia.test.mjs: PostgreSQL real
  embebido, migraciones, roles, RPC y HTTP integrado con la respuesta SQL.
- supabase/checks/coberturas-scrum152.sql: ciclo transaccional verificable en Supabase.

Se retiraron siete archivos sin consumidores fuera de su propio circuito:
domain/coverages.ts; http/routes/coverages.routes.ts;
http/controllers/coverages.controller.ts;
infrastructure/repositories/coberturas.repository.ts; y los tres casos de uso
application/use-cases/{otorgar,extender,revocar}-cobertura.ts.
No eran las rutas utilizadas por server.ts. Se conservan las interfaces HTTP activas.

## Contrato HTTP

Prefijo del Gateway: /api/v1/organizations/temporary-coverages.
El servicio recibe el mismo sufijo bajo /v1/organizations.
Todas las operaciones requieren Authorization: Bearer <sesión>.
No se admite x-user-id como identidad, actor enviado por cliente, credenciales
compartidas ni password en estos cuerpos. La identidad/auditoría deriva de auth.uid().
Esto no puede detectar que una persona comparta manualmente su contraseña fuera
del sistema; no existe una operación de suplantación o intercambio de credenciales.

| Método | Sufijo | Datos | Acceso |
| --- | --- | --- | --- |
| GET | / | Sin query ni cuerpo | ADMIN |
| POST | / | id_usuario_beneficiario, id_pais, inicio_at, fin_at, motivo | ADMIN |
| PATCH | /:id/extend | version_esperada, nueva_fin_at, motivo opcional | ADMIN |
| PATCH | /:id/revoke | version_esperada, motivo_revocacion | ADMIN |
| GET | /:id/history | Sin query | ADMIN |
| GET | /mine | Sin filtros, identidad ligada a sesión | COORD, contexto propio |

Ejemplo de alta:

```json
{
  "id_usuario_beneficiario": "22222222-2222-4222-8222-222222222222",
  "id_pais": "33333333-3333-4333-8333-333333333333",
  "inicio_at": "2026-11-10",
  "fin_at": "2026-11-15",
  "motivo": "Apoyo territorial durante ausencia del titular"
}
```

UUID válidos, fechas calendario, término posterior al inicio y motivo entre
5 y 1000 caracteres después de trim. Beneficiario COORD activo, país disponible
con zona horaria, sin acceso permanente al mismo país ni intervalos solapados.
Un ADMIN que también sea COORD no puede autoasignarse cobertura.
La extensión debe aumentar el término local, no solaparse y conservar la versión.
La revocación no cambia el término programado: registra instante, actor y motivo,
además del evento REVOCAR. Coberturas vencidas o revocadas no son editables.

Éxito: {ok:true,code,message,data:{coverage}} (alta 201, cambios 200),
{coverages:[]} para listas, {history:[]} para historial. Las listas vacías son 200.
Error: {ok:false,error:{code,message,requestId,fields?},data:null}.

| Código | HTTP | Causa |
| --- | --- | --- |
| SESION_REQUERIDA / SESION_INVALIDA | 401 | Bearer ausente/inválido o sesión expirada |
| SIN_PERMISO | 403 | Actor sin ADMIN global activo o autoasignación |
| DATOS_INVALIDOS | 400 | Fechas, ID, versión, motivo o campos inválidos |
| COBERTURA_NO_ENCONTRADA | 404 | ID inexistente |
| CONFLICTO_VERSION | 409 | Cambio concurrente; recargar versión |
| COBERTURA_NO_EDITABLE | 409 | Vencida o revocada |
| TERRITORIO_YA_ASIGNADO | 409 | Acceso permanente existente |
| COBERTURA_SOLAPADA | 409 | Otro intervalo para beneficiario/país |
| REFERENCIA_INVALIDA | 409 | Referencia no disponible |
| RESPUESTA_INVALIDA | 502 | Contrato remoto incompleto |
| COBERTURAS_NO_DISPONIBLES | 503 | Conexión, timeout o fallo de persistencia |
| MIGRACION_COBERTURAS_PENDIENTE | 503 | RPC no instalada |

Cada mutación y su evento se confirman en la misma transacción. Un fallo al
insertar historial revierte también la cobertura. FOR UPDATE y version_esperada
protegen cambios concurrentes; advisory lock serializa altas/extensiones para
un par Coordinador/país. Las pruebas PGlite son de una conexión; no equivalen a
una prueba de carga con múltiples conexiones simultáneas.

## Verificación reproducible

```powershell
node --experimental-strip-types --test backend/services/organizations/tests/*.test.ts backend/gateway/tests/gateway.test.ts frontend/tests/validaciones/coberturas.persistencia.test.mjs frontend/tests/clientes/coberturas.test.mjs
```

Se prueban ADMIN/COORD/anon, autoasignación, suplantación por header/cuerpo,
fechas imposibles, infinity, versión ausente/null/inválida/obsoleta, motivo,
país y Coordinador inexistentes/inactivos, conflictos de intervalos, vencidos,
historial antiguo y actual, consulta vacía y 404. Se comprueban exactamente
OTORGAR → EXTENDER → REVOCAR, término anterior y nuevo, actor, rollback si falla
el evento, pérdida inmediata de autorización y protección del historial.
Auth/Storage tienen soporte mínimo en PGlite; los resultados SQL no están
simulados. HTTP usa un adaptador de transporte al SQL real con identidades QA;
no es una prueba de login real en Supabase Auth.

Para Supabase: aplicar la migración nueva después de sus dependencias y ejecutar
supabase/checks/coberturas-scrum152.sql. Requiere ADMIN y COORD territorial activos;
crea un país/cobertura de prueba, verifica el ciclo como authenticated y revierte
todos los fixtures con ROLLBACK. No cambia las credenciales ni las cuentas.

## Resultado de verificación

6 de noviembre de 2026 (Santiago): regresión final aprobada, 181 pruebas y
12 suites de Organizations, Gateway, cliente y persistencia. TypeScript estricto
sobre dominio, Application, repositorio y rutas de coberturas sin errores;
git diff --check sin errores.

Supabase fge-dev (jjarthmbasxtjfyhscai): preflight con el ciclo completo bajo
ROLE authenticated e identidades ADMIN/COORD existentes devolvió
SCRUM152_CICLO_REAL_OK / OK. Todos sus fixtures se revirtieron.
La migración 20261107010000 quedó aplicada y registrada como
fge_scrum152_coberturas_integridad. Verificación final: historial con RLS,
sin SELECT directo para authenticated, sin EXECUTE de RPC para anon.
Se preservaron los triggers previos y se añadieron las dos protecciones de
inmutabilidad. No se eliminaron ni reescribieron eventos históricos.

La prueba remota usa roles/identidades SQL, no un login con Supabase Auth.
El proceso Node.js no fue desplegado ni reiniciado: el backend corregido está
en este checkout. Los cambios previos de HU22 permanecen separados de esta tarea.
