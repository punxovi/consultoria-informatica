# SCRUM-157 — Registro de eventos e inmutabilidad RF62

## Alcance revisado

Se revisaron los triggers de sellado y auditoría iniciales, su ejecución SECURITY
DEFINER, el contexto de Planes/Acciones, privacidad y exportaciones, administración
de Coordinadores/Invitados, países, coberturas, consulta administrativa y los
accesos a expediente legal, respaldos, evidencias y adjuntos de actas.

Migraciones históricas evaluadas: 20260908002327, 20260923020339,
20261002225137, 20261019140000, 20261027120000, 20261028020000,
20261029100000, 20261029 (historial de coberturas), 20261031120000,
20261031140000, 20261102150000, 20261102170000, 20261105200000 y la
corrección SCRUM-152 20261107010000. Se conserva el trabajo anterior de HU22
y SCRUM-152 que ya estaba en el checkout.

## Hallazgos y correcciones

| Hallazgo | Ajuste |
| --- | --- |
| Triggers de cambios y bloqueo UPDATE/DELETE/TRUNCATE ya existentes | Se conservan y se habilitan ALWAYS para el historial central |
| Rol, IP y país inconsistentes en distintos escritores | Trigger común de enriquecimiento antes de cada inserción |
| Hora local presente solo en el entorno remoto, fuera de migraciones | Migración compatible con columnas preexistentes, sin reescribir eventos |
| Las IP de HTTP no llegaban consistentemente a PostgREST | Contexto AsyncLocalStorage por petición y transporte restringido al origen Supabase |
| Acceso legal silenciaba fallos de registro y aceptaba ID sin autorización | Registro obligatorio y validación de existencia y permiso antes de anexar |
| Descargas privadas no dejaban evento de acceso | Registro con ID exacto de archivo/evidencia/adjunto antes de devolver bytes |
| Login se declaraba desde una RPC de cliente; errores HTTP se ignoraban | Atestación de respuestas verificadas en Auth y copia idempotente del proveedor; fallos desde el servicio Auth |
| Intento fallido se enviaba sin sesión a una función que no admitía anon | Función privada por permisos de ejecución service_role; no se amplía acceso anónimo |
| Eventos de exportación sin rol/IP completos ni referencia del PDF preparado | Enriquecimiento común y reportId; se incluye PDF de Compromisos |
| Backend confundía un 401 de auditoría con denegación de rol 403 | Prioridad correcta para SESION_INVALIDA |

## Esquema de evento

Se reutiliza fge_private.historial_cambios, sin crear un registro paralelo.

| Campo | Significado |
| --- | --- |
| id_historial_cambio | Identificador estable del evento |
| tabla_afectada / clave_registro | Entidad e identificador exacto, incluidos IDs compuestos |
| tipo_accion | INSERT, UPDATE o DELETE físico |
| tipo_evento | Operación funcional estable, adicional a tipo_accion |
| id_usuario / id_asignacion / codigo_rol | Actor y rol capturado en el momento del evento |
| fecha_hora | Instante timestamptz original |
| id_pais / zona_horaria / fecha_hora_local | Contexto territorial y conversión local al insertar |
| ip_origen / fuente_ip | IP disponible y procedencia: aplicacion, conexion_bd o proveedor_auth |
| ip_conexion_bd | Dirección de conexión a PostgreSQL, cuando existe |
| request_id | Correlación HTTP, cuando está disponible |
| antes / despues | Antecedente y estado resultante de escrituras; detalle mínimo en accesos/Auth |

Cuando no hay país aplicable, la zona es UTC. No se infiere retrospectivamente
un país para los eventos anteriores. Los metadatos históricos ausentes se
mantienen nulos; el contrato de consulta los admite. En eventos nuevos se
completa el rol o se identifica explícitamente SIN_ROL, SISTEMA o ANON, según
el contexto. Un login fallido no se atribuye a la persona cuyo correo escribió
un tercero: no hay identidad verificada y se registra ANON.

Eventos funcionales: cuenta_creada, cuenta_modificada, cuenta_desactivada,
rol_otorgado, rol_modificado, rol_revocado, pais_creado, pais_modificado,
pais_desactivado, cobertura_otorgada, cobertura_extendida, cobertura_revocada,
documento_consultado, reporte_exportado y auth:<acción del proveedor>.
Las demás escrituras conservan entidad:operación física como clasificación.
La revocación de la última asignación del propio actor conserva su rol previo.

## Módulos instrumentados

| Módulo | Fuente de eventos |
| --- | --- |
| Cuentas y roles | Triggers en perfiles y asignaciones_roles; reservas/cuentas privadas conservan sus triggers |
| Países | Trigger de INSERT/UPDATE/DELETE; desactivación por archived_at |
| Coberturas | Trigger de permisos_temporales con antes/después y clasificación del ciclo; historial específico inmutable de SCRUM-152 |
| Autenticación | Atestación verificada del backend y sincronización idempotente de auth.audit_log_entries |
| Login rechazado | registrar_intento_autenticacion, invocada exclusivamente por el proceso Auth con service_role |
| Expediente legal | registrar_acceso_documento, ligada al expediente existente y autorizado |
| Respaldos de donación | registrar_acceso_archivo('donacion', id_archivo) |
| Evidencias privadas | registrar_acceso_archivo('evidencia', id_evidencia) |
| Adjuntos de actas | registrar_acceso_archivo('adjunto_acta', id_adjunto) |
| Reportes | registrar_exportacion_reporte; PDF consolidado referencia el reportId preparado; Compromisos registra contexto y referencia propia |

Los listados de cuentas, países, coberturas y auditoría no escriben eventos
funcionales. La apertura de un expediente personal y la descarga de un documento
privado sí se registran; los listados de metadatos de archivos no se confunden
con la entrega del contenido. La generación del resumen de reporte mantiene su
registro funcional previo, separado de los listados administrativos.

## Accesos directos a Storage

La política RESTRICTIVE rf62_registrar_acceso_documental en storage.objects
intercepta además operaciones de descarga/firmado de objetos privados usando
los [helpers oficiales de operaciones de Storage](https://supabase.com/docs/guides/storage/schema/helper-functions).
No concede permisos nuevos ni registra object.list/list_v2, comprobaciones de
metadatos o imágenes públicas del catálogo. Así se cubren las peticiones que
acceden a Storage sin pasar por los endpoints Node.js.

El evento documento_acceso_storage identifica la solicitud evaluada por Storage
con el UUID exacto del objeto y el actor. No afirma que la transferencia de bytes
terminara; puede registrar un intento posteriormente denegado por otras RLS.
El evento del backend identifica, por separado, la entrega autorizada preparada.
Si ambos existen, representan dos etapas, no dos cambios del mismo registro.
Las URL firmadas se auditan al emitir la capacidad; una descarga anónima posterior
no permite identificar a una nueva persona. Los accesos públicos consentidos
no se convierten en consultas privadas ni reciben un actor ficticio.
El registro en RLS requiere la conexión primaria de escritura de Storage.

## Autenticación y seguridad

La fuente autoritativa de los eventos exitosos/ciclo de Auth es
[Auth Audit Logs de Supabase](https://supabase.com/docs/guides/auth/audit-logs).
Debe mantenerse habilitada la persistencia de Auth en auth.audit_log_entries.
El proceso Auth registra sus respuestas verificadas antes de devolver sesiones o
confirmaciones y sincroniza los eventos nativos con una RPC exclusiva de
service_role. Un trabajador cada 30 segundos recupera también eventos de Auth
ocurridos fuera del backend. No se crean triggers ni se cambian propietarios o
permisos de las tablas administradas de Supabase Auth.
La copia conserva solo ID del evento, ID de actor conocido, acción, fecha e IP;
no copia payload completo, contraseña, token, cookies ni correo intentado.
La RPC registrar_evento_autenticacion queda exclusiva de service_role, con
operaciones y campos mínimos validados; un usuario no puede inventar un login
exitoso desde la Data API. El proceso usa el ID retornado por Auth, no un actor
enviado por el cliente. En recuperación no se atribuye el correo a una identidad
verificada ni se cambia la respuesta para revelar si la cuenta existe.
Los eventos de respuesta verificada y los nativos identifican su procedencia;
no se confunden la aceptación del proveedor y la entrega de una sesión al cliente.
La sincronización copia eventos desde la activación de esta migración, por
lotes acotados, con índice único por ID nativo. Los reintentos no duplican ni
modifican eventos. Si hay una caída, los eventos pendientes permanecen en Auth
y el trabajador reintenta sin avanzar un cursor que pudiera perderlos.
El rol nativo se reconstruye según las fechas de la asignación al instante del
evento, conservándolo aunque el usuario cambie de rol antes de la copia.

Los rechazos HTTP 4xx del endpoint de credenciales se registran mediante una
función exclusiva de service_role. Se usa SUPABASE_SERVICE_ROLE_KEY ya requerida
por la administración de cuentas, solo en el proceso Auth. No se usa esa clave
en los repositorios normales ni se entrega al navegador. Si falta configuración
o falla la escritura del intento, se devuelve AUDITORIA_NO_DISPONIBLE 503;
no se anuncia falsamente que el evento fue registrado. Un fallo de red con Auth
no se clasifica como credenciales rechazadas.

La IP del Gateway se obtiene de socket.remoteAddress, ignorando cabeceras
arbitrarias del navegador. Los servicios aceptan la cabecera del Gateway desde
loopback o AUDIT_TRUSTED_PROXY_IPS (lista de IP separadas por coma). Si Gateway y
servicios están en hosts distintos, configurar exclusivamente las direcciones
de la red interna confiable y restringir el acceso a los servicios.
El contexto no se comparte entre peticiones concurrentes ni se añade a otros
orígenes HTTP. La IP no interviene en la autorización. fuente_ip=aplicacion
identifica contexto declarado por el emisor de PostgREST, no una prueba
criptográfica de identidad: se conserva también ip_conexion_bd para procedencia.
El actor autorizado siempre procede del JWT verificado, nunca de esos headers.

El historial mantiene RLS y no concede escritura ni lectura directa a anon,
authenticated o service_role. Solo funciones controladas anexan eventos. La API
administrativa es exclusivamente GET; no hay endpoints para editar/borrar.
Los triggers impiden UPDATE, DELETE y TRUNCATE incluso al propietario mientras
están activos y con session_replication_role=replica. El ADMIN funcional es un
rol de aplicación, no un superusuario de infraestructura. El control de DDL,
backups y administradores capaces de deshabilitar/eliminar la base pertenece a
la seguridad operativa de PostgreSQL; ninguna tabla protege contra su propio DBA.

Un error de auditoría impide entregar el expediente, archivo o PDF al cliente.
Los cambios de datos de negocio y sus eventos de trigger son transaccionales.
En una edición legal, el guardado puede haberse confirmado antes de una lectura
posterior fallida: no se entrega esa lectura sin registro y el cambio conserva
su propio evento de modificación.

## Contrato de consulta

GET /api/v1/audit/events, Bearer y ADMIN global activo. Se conservan filtros,
paginación y envoltorios success/failure. Cada evento añade opcionalmente:
tipo_evento, zona_horaria, fecha_hora_local, request_id y fuente_ip.
operacion sigue representando la operación física y el filtro operacion también
puede buscar códigos funcionales. Los campos adicionales son compatibles con
el cliente actual; los registros históricos pueden devolver null.

## Archivos principales

- supabase/migrations/20261107020000_fge_scrum157_auditoria_rf62.sql
- supabase/checks/auditoria-scrum157.sql
- backend/shared/observability/src/audit-context.ts y sus pruebas
- backend/gateway/src/clients/proxy.ts
- Servidores y repositorios Supabase de Auth, Guests, Organizations, Insights,
  Programs e Interventions: propagación del contexto compartido.
- backend/services/auth/src/infrastructure/supabase-auth.repository.ts y auth-audit.ts
- backend/services/organizations/src/domain/audit.ts
- backend/services/organizations/src/infrastructure/supabase-audit.repository.ts
- backend/services/organizations/src/infrastructure/supabase-organizations.repository.ts
- backend/services/organizations/src/domain/organizations.ts
- backend/services/organizations/src/application/commitments-pdf-service.ts
- backend/services/insights/src/application/insights-service.ts
- Repositorios privados de Evidencias y Adjuntos de Actas en Interventions.
- Pruebas de Auth, Organizations, Insights y contexto compartido actualizadas.
- frontend/tests/validaciones/auditoria.persistencia.test.mjs

## Verificación

Las pruebas PGlite aplican migraciones reales en PostgreSQL embebido, tanto
sobre esquema limpio como con columnas locales preexistentes. Auth/Storage
solo tienen un soporte mínimo. Se comprueban operaciones, metadatos esperados,
listados sin ruido, autenticación, lectura autorizada/inexistente, exportación,
restricciones de rol y bloqueo de modificaciones/borrado/truncado, incluso en
modo réplica. El script remoto reproduce la comprobación con ROLLBACK.

Las pruebas HTTP comprueban aislamiento concurrente de contexto, descarte de
cabeceras no confiables, transporte Bearer, fallos de auditoría, privacidad de
credenciales e imposibilidad de entregar datos/PDF cuando falla el registro.
Las inserciones de fixtures Auth no equivalen a iniciar sesión con credenciales
reales ni prueban el envío de correos o un proveedor OAuth.

```powershell
node --experimental-strip-types --test backend/shared/observability/tests/*.test.ts backend/services/auth/tests/*.test.ts backend/services/guests/tests/*.test.ts backend/services/organizations/tests/*.test.ts backend/services/insights/tests/*.test.ts backend/services/interventions/tests/*.test.ts backend/services/programs/tests/*.test.ts backend/gateway/tests/*.test.ts frontend/tests/validaciones/auditoria.persistencia.test.mjs frontend/tests/clientes/evidencias.integracion.test.mjs frontend/tests/clientes/actas.integracion.test.mjs frontend/tests/validaciones/expediente-legal.persistencia.test.mjs
```

Aplicar la migración antes de desplegar los procesos Node.js nuevos. Configurar
la clave privada existente en Auth y los proxies confiables según el despliegue.
No se regeneran credenciales ni se cambian permisos funcionales de usuarios.

## Evidencia final — 7 de noviembre de 2026

- Regresión combinada: **313 pruebas aprobadas, 28 suites, cero fallas**.
  Incluye Auth, Guests, Organizations, Insights, Interventions, Programs, Gateway,
  contexto compartido, persistencia RF62 y flujos HTTP de actas, evidencias y
  expediente legal. Persistencia verificada en esquema limpio y preexistente.
- TypeScript estricto del núcleo nuevo (contexto, transporte/Auth, sincronizador
  y repositorio de consulta) sin errores; git diff --check sin errores.
  No se presenta este chequeo acotado como una compilación estricta global del
  monorepositorio, que mantiene errores previos en otros módulos.
- Supabase fge-dev (jjarthmbasxtjfyhscai): el script transaccional devolvió
  **SCRUM157_RF62_OK / OK**, incluyendo fuentes Auth por lectura, metadatos,
  listados sin ruido, Storage y prohibición de UPDATE/DELETE/TRUNCATE.
- Migración **20261107020000**, fge_scrum157_auditoria_rf62, aplicada y registrada.
  Resultado final: RLS=true; UPDATE/DELETE de authenticated=false;
  dos protecciones inmutables ALWAYS; política de auditoría Storage instalada.
- Se preservaron las columnas y el trigger de contexto que ya existían en el
  entorno remoto; no se duplicó ese trigger ni se modificaron eventos históricos.
- Todos los fixtures remotos se revirtieron. Las comprobaciones usan roles SQL
  e identidades existentes; no son un login con contraseña real ni una descarga
  real de un blob de Storage. El proceso Node.js no fue desplegado ni reiniciado.
- La captura completa de Auth requiere desplegar el proceso actualizado con la
  clave privada existente y mantener habilitados los registros nativos de Auth.
  Los eventos nativos externos al backend se copian por el trabajador periódico.

Las pruebas de contexto compartido quedaron incorporadas a test:architecture y
check:architecture mediante el workspace @fge/observability.

## Inventario de propagación del contexto

Además de los archivos funcionales descritos arriba, estos archivos reutilizan
el contexto HTTP compartido sin cambiar sus contratos de negocio:

- backend/services/auth/src/infrastructure/supabase-auth.repository.ts
- backend/services/auth/src/infrastructure/supabase-coordinators.repository.ts
- backend/services/auth/src/server.ts
- backend/services/guests/src/infrastructure/supabase-guests.repository.ts
- backend/services/insights/src/infrastructure/supabase-insights.repository.ts
- backend/services/insights/src/server.ts
- backend/services/interventions/src/infrastructure/supabase-evidences.repository.ts
- backend/services/interventions/src/infrastructure/supabase-interventions.repository.ts
- backend/services/interventions/src/infrastructure/supabase-meeting-minute-attachments.repository.ts
- backend/services/interventions/src/infrastructure/supabase-public-evidences.repository.ts
- backend/services/interventions/src/server.ts
- backend/services/organizations/src/infrastructure/supabase-audit.repository.ts
- backend/services/organizations/src/infrastructure/supabase-countries.repository.ts
- backend/services/organizations/src/infrastructure/supabase-coverages.repository.ts
- backend/services/organizations/src/infrastructure/supabase-organizations.repository.ts
- backend/services/organizations/src/server.ts
- backend/services/programs/src/infrastructure/supabase-programs.repository.ts
- backend/services/programs/src/server.ts

Adaptadores SQL de integración actualizados: frontend/tests/helpers/auditoria-db.mjs,
actas-entorno.mjs, evidencias-entorno.mjs y expediente-entorno.mjs. Ejecutan las
RPC de auditoría reales y conservan RLS; no devuelven éxitos ficticios de auditoría.

### Extensión de protección de Storage

La migración posterior 20261107021000_fge_scrum157_auditoria_copias_storage.sql
incluye también copia y movimiento de documentos y lecturas de origen en S3.
Estas operaciones acceden al contenido aunque no sean una descarga HTTP.
Es una migración adicional para conservar íntegro el SQL ya registrado de la
migración principal; no concede permisos ni cambia los eventos existentes.

La extensión 20261107021000 también quedó aplicada y registrada en fge-dev.
Se volvieron a ejecutar los 20 casos de persistencia después de añadir copia y
movimiento: todos aprobados. La comprobación final confirmó ambas migraciones,
modificación/borrado bloqueados y copia de documentos incluida en la auditoría.
El script de pruebas del workspace de observabilidad se ejecutó correctamente.

Para el contrato vigente de filtros, cursor y rendimiento, ver
[CONTRATO-CONSULTA-AUDITORIA.md](CONTRATO-CONSULTA-AUDITORIA.md).
