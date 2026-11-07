# Consulta y filtros del historial de auditoría

## Qué se revisó y corrigió

Se siguió GET /api/v1/audit/events desde Gateway hasta audit-routes.ts,
audit-service.ts, los esquemas Zod de audit.ts, el repositorio Supabase y
consultar_eventos_auditoria(jsonb). Se revisaron también la consulta inicial
20261031140000, la proyección legible 20261105200000, las migraciones RF62,
los índices, el control de roles y la compatibilidad del cliente de auditoría.

- El cursor salía de la fila de comprobación limit+1. Como la página siguiente
  usa una comparación estricta, esa fila se perdía. Ahora se emite el último
  registro entregado, usando la fila adicional solo para saber si hay más.
- Los filtros de usuario/país eran solo texto. Se añadieron id_usuario e
  id_pais validados en Zod y en SQL, combinables con los demás filtros.
- El país persistido del evento se ignoraba. Ahora prevalece; para históricos
  se usa el país de la fila, luego cobertura y luego asignación si corresponde.
  El mismo país se usa al filtrar y al mostrar la respuesta.
- SQL aceptaba fechas flexibles, infinity, cursores débiles y comodines.
  Se restringen formato, fechas calendario, rango, UUID, límite y cursor.
  Las búsquedas de nombre/correo/país son literales; operación y entidad
  comparan por código exacto, sin distinguir mayúsculas.
- La respuesta exponía correo y serializaba claves JSON completas. Se omite
  correo, se conservan nombre/UUID del actor y país, y la referencia solo
  contiene identificadores escalares seguros, incluido id_reporte si existe.
  Se omiten filtros internos, datos antes/después y nombres de solicitantes/archivos.
- El repositorio valida cada evento, cantidad de filas y coherencia del cursor.
  Una respuesta vacía legítima se distingue de una respuesta upstream inválida.
- Se añadieron índices de fecha/ID y prefijos de actor, país y entidad para
  apoyar filtros y recorrido por cursor.

## Contrato HTTP

GET /api/v1/audit/events; Authorization: Bearer <sesión>.
El Gateway enruta a /v1/audit/events de Organizations. Solo lectura; el
repositorio reenvía el JWT y la clave pública. La RPC SECURITY DEFINER con
search_path vacío exige perfil activo, asignación global ADMIN vigente y
rol activo. No concede lectura directa del historial a los clientes.

| Parámetro opcional | Semántica |
| --- | --- |
| id_usuario | UUID RFC, coincidencia exacta con el actor registrado |
| id_pais | UUID RFC, coincidencia exacta con el país efectivo del evento |
| usuario | Texto literal en nombre o correo del actor; el correo no se devuelve |
| pais | Texto literal en nombre, o código ISO exacto |
| desde / hasta | Fechas calendario YYYY-MM-DD, inicio <= término; ambos días completos en UTC |
| operacion | Código físico INSERT/UPDATE/DELETE o código funcional RF62, exacto |
| entidad | Código exacto de tabla/entidad, por ejemplo permisos_temporales |
| limit | Entero de 1 a 100; por defecto 50 |
| cursor | Base64url opaco devuelto como nextCursor |

Los filtros se intersectan. Los rangos pueden quedar abiertos por un lado.
Se rechazan parámetros desconocidos, repetidos, fechas imposibles o año 0000,
UUID incorrectos, límites fuera de rango y cursores mal formados. El cursor
retiene la precisión temporal de PostgreSQL y el ID bigint como texto, sin
redondear a milisegundos ni a número JavaScript. Orden descendente por
(fecha_hora, id_historial_cambio), con desempate estable. Continuar con los
mismos filtros y el nextCursor recibido; reiniciar al cambiar filtros.
Después de actualizar desde la versión anterior, iniciar desde la primera
página para no reutilizar un cursor emitido con la lógica antigua.

Éxito: {ok:true,code:"AUDITORIA_CONSULTADA",message,data:{events,nextCursor}}.
Sin coincidencias: HTTP 200, events=[], nextCursor=null. Cada evento conserva
usuario/ID, rol, país/ID, fecha_hora, IP/procedencia, operación física/funcional,
entidad y referencia cuando existe, además de los metadatos RF62 pertinentes.
Error: {ok:false,error:{code,message,requestId,fields?},data:null}.

| HTTP | Código |
| --- | --- |
| 400 | DATOS_INVALIDOS |
| 401 | SESION_REQUERIDA / SESION_INVALIDA |
| 403 | SIN_PERMISO |
| 405 | METODO_NO_PERMITIDO |
| 502 | RESPUESTA_INVALIDA |
| 503 | AUDITORIA_NO_DISPONIBLE / MIGRACION_AUDITORIA_PENDIENTE / CONFIGURACION_SUPABASE |

## RNF14: evidencia y alcance

Medición local reproducible: 20.000 eventos sintéticos más semillas, PostgreSQL
embebido, servidores HTTP reales para Gateway y Organizations, adaptador de
PostgREST a PostgreSQL y roles SQL reales. Tras calentar cuatro escenarios,
100 solicitudes secuenciales (25 sin filtros, 25 con filtros combinados, 25
con cursor y 25 sin coincidencias). Se cronometra desde antes de fetch hasta
decodificar el JSON completo. Percentil 95 por rango más cercano.

Resultado: **p95 50,46 ms, máximo 55,99 ms, 100/100 ≤1.500 ms**. Es evidencia
local para este escenario; no certifica p95 de producción. El timeout de
transporte de 10 s controla fallos, no mide ni acredita RNF14. Las búsquedas
parciales de texto y los datos históricos sin país persistido pueden examinar
más filas. Los índices acotan el recorrido ordenado y favorecen filtros exactos.

Para medir RNF14 desplegado, ejecutar el mismo reparto de escenarios a través
del Gateway real, con JWT ADMIN, concurrencia representativa, volumen esperado,
red de usuario y PostgREST reales. Registrar población, concurrencia, caché
fría/caliente, p95, errores y proporción de respuestas exitosas ≤1.500 ms.
Revisar EXPLAIN (ANALYZE, BUFFERS) de filtros selectivos y de búsquedas sin
coincidencias si se supera el umbral. En bases grandes, planificar la creación
de índices en ventana de despliegue por su coste y bloqueo de escrituras.

## Archivos y verificación

- Dominio/contrato: backend/services/organizations/src/domain/audit.ts.
- Transporte/respuesta: backend/services/organizations/src/infrastructure/supabase-audit.repository.ts.
- Rutas y Application revisadas, sin cambiar la URL: http/audit-routes.ts y
  application/audit-service.ts en Organizations; backend/gateway/src/routes/routes.ts.
- Migración nueva: supabase/migrations/20261107022000_fge_consulta_auditoria_segura.sql.
- Pruebas: backend/services/organizations/tests/audit.test.ts y
  frontend/tests/validaciones/auditoria.consulta.persistencia.test.mjs.
- SQL de comprobación: supabase/checks/consulta-auditoria.sql, con ROLLBACK.
- El cliente existente fue verificado sin cambios de interfaz.

```powershell
node --experimental-strip-types --test backend/services/organizations/tests/audit.test.ts frontend/tests/validaciones/auditoria.consulta.persistencia.test.mjs frontend/tests/validaciones/auditoria.test.mjs
```

18 pruebas aprobadas en la comprobación focalizada, incluidos filtros
combinados, registro con país distinto a asignación, microsegundos iguales,
paginación sin pérdidas, sesión/rol, ausencia de resultados y minimización.
TypeScript estricto del dominio y repositorio sin errores. No se modifican
eventos existentes ni las reglas de inmutabilidad de SCRUM-157.


## Verificación en Supabase

La prueba transaccional en fge-dev devolvió CONSULTA_AUDITORIA_OK: cinco
eventos recorridos en páginas de 2, 2 y 1, sin repetir, sin exponer datos
internos, sin generar eventos de consulta y con rechazo para sesión sin rol.
Los fixtures se revirtieron. La migración 20261107022000 quedó aplicada y
registrada, con cuatro índices confirmados y EXECUTE de anon denegado.
La medición RNF14 fue local; la prueba remota fue funcional por SQL.
El proceso Node.js no se desplegó ni se reinició.
