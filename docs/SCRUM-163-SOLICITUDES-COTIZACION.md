# SCRUM-163: solicitudes de cotización

Base actualizada: `origin/sprint-9`, commit `d20abfc`.
Rama: `feature/SCRUM-163-backend-solicitudes-cotizacion`.
Se completan las tablas y rutas existentes de las tareas de catálogo, formulario
público y bandeja. No se crea un segundo módulo de solicitudes.

## Reglas confirmadas

- Un envío con productos de distintos países se divide en solicitudes por país.
  Se guardan todas en una transacción o ninguna. Cada solicitud admite varios
  productos y Organizaciones del mismo país.
- Se asigna el Coordinador principal activo del país. Si falta, la solicitud se
  conserva sin responsable al recibirla y se registra como informativa para los
  Coordinadores principales activos de los otros países. El Administrador puede
  gestionarla. Si tampoco existen otros Coordinadores, permanece en su bandeja.
- Los avisos son registros de bandeja dentro de la aplicación; no se implementan
  correos ni mensajes externos. Los destinatarios informados no pueden editar la
  solicitud por el solo hecho de haber recibido el aviso.

Si hay más de un Coordinador principal activo para el país, la solicitud llega a
todos ellos como responsables (`solicitud_cotizacion_destinatarios`, tipo
`responsable`) y cualquiera puede gestionarla. `id_coordinador` guarda solo un
responsable de referencia. Ver `20261105170000_fge_solicitudes_todos_coordinadores.sql`.
El país aplicado a la cuenta, no un cambio de país pendiente de inicio de sesión,
determina el principal. Para cuentas anteriores sin registro de administración,
solo se acepta una asignación territorial COORD activa no ambigua.

## Persistencia e historial

La migración `20261105120000_fge_scrum163_solicitudes_cotizacion.sql` agrega a la
cabecera nombre y apellido separados, `id_envio`, país, Coordinador al recibirla
y `sin_coordinador_al_recibir`. Conserva `nombre_solicitante` para los consumidores
existentes, fecha de recepción (`created_at`), estado, versión y auditoría.

Cada detalle conserva producto, cantidad estimada, unidad, nombre del producto,
Organización y país, con copias de sus nombres. Las consultas posteriores no
cambian esos datos si el catálogo se renombra o deja de publicarse. Los UUID son
FK con borrado restringido. No hay pagos, precios automáticos, stock, compras ni
despacho.

`solicitud_cotizacion_destinatarios` relaciona cada solicitud con sus destinatarios
y distingue responsable e informado. Las cuentas y roles se comprueban nuevamente
al consultar. Un perfil desactivado no puede acceder; cambiar el país principal
revoca la gestión del territorio anterior. El Coordinador principal actual puede
atender solicitudes de su país aunque haya cambiado la persona responsable desde
su recepción; la asignación histórica se conserva. Los avisos informativos se
mantienen para sus destinatarios mientras sigan siendo Coordinadores activos.

No se inventan nombres, apellidos ni responsables de solicitudes anteriores a esta
migración: conservan `id_envio` nulo y quedan disponibles al Administrador. Los
detalles anteriores reciben referencias y nombres territoriales del modelo al
migrar. No se afirma que esas referencias reconstruyan asignaciones históricas.

## Contrato público

`POST /api/v1/public/quote-requests`, sin sesión y con `Content-Type: application/json`:

```json
{
  "nombre": "Ana María",
  "apellido": "Pérez López",
  "correo": "ana@example.org",
  "telefono": "+56 912345678",
  "mensaje": "Antecedentes de la solicitud",
  "items": [{"id_producto": "UUID del producto", "cantidad": 2.5}]
}
```

Nombre y apellido: obligatorios, hasta 80 caracteres cada uno. Correo obligatorio,
válido y hasta 320 caracteres. Teléfono y mensaje son opcionales (60 y 2000
caracteres). Se admiten entre 1 y 100 productos distintos. Cada cantidad debe ser
un número finito, mayor que cero y no superar `Number.MAX_SAFE_INTEGER`. No se
convierten cadenas numéricas silenciosamente. Los productos deben estar
publicados, y producto, Organización y país deben estar vigentes. El servidor
obtiene todas las relaciones y responsables; no los acepta del visitante.

Se admite `nombre_solicitante` por compatibilidad únicamente si coincide con los
dos campos independientes. El formulario existente envía ambos, sin intentar
deducir apellidos desde un nombre completo arbitrario. Las solicitudes antiguas
que envíen solo `nombre_solicitante` deberán incorporar nombre y apellido.

Respuesta HTTP 201 dentro de `data.quote`:

```json
{
  "id_solicitud": "UUID de la primera solicitud",
  "id_envio": "UUID común de referencia",
  "estado": "solicitada",
  "solicitudes": [
    {"id_solicitud": "UUID de una solicitud por país", "estado": "solicitada"}
  ]
}
```

`id_solicitud` mantiene compatibilidad con el cliente previo. `id_envio` es la
referencia conjunta que muestra el formulario; este informa cuántas solicitudes
se generaron por país. La respuesta pública no devuelve contacto, destinatarios,
representantes, correos de Organizaciones ni metadatos internos. No existe una
consulta pública de solicitudes por su identificador.

## Operaciones privadas

Requieren una sesión ADMIN o COORD activa, verificada por Supabase. Las consultas
se limitan al país principal y a los avisos informativos explícitos de la cuenta.
ADMIN puede consultar y gestionar todas. Un usuario INVIT no accede a solicitudes.

| Método y ruta `/api/v1` | Operación |
| --- | --- |
| `GET /quote-requests` | Bandeja paginada |
| `GET /quote-requests/:id` | Detalle autorizado |
| `PATCH /quote-requests/:id` | Cambiar estado |
| `PATCH /quote-requests/:id/status` | Alias conservado para la bandeja previa |

Filtros combinables: `id_pais` (UUID) y `estado`. `limit`: entero 1–100, por defecto
50; `offset`: entero 0–100000, por defecto 0. Parámetros vacíos, desconocidos o
duplicados se rechazan. Una consulta válida sin resultados devuelve `requests: []`.
La página también devuelve `limit`, `offset` y `hasMore`; ordena por recepción
descendente y UUID. La paginación por offset no es una instantánea entre peticiones.

Cada solicitud incluye contacto, fecha de recepción, estado, versión, referencias
territoriales, productos y `estados_permitidos`. Los detalles incluyen tanto
`nombre` como `nombre_producto` para los dos consumidores existentes. Los avisos
solo informativos devuelven `solo_informativa: true` y `estados_permitidos: []`;
la bandeja no ofrece controles de edición en ese caso.

Edición de estado:

```json
{"version_esperada": 1, "estado": "en_gestion"}
```

Estados vigentes: `solicitada`, `en_gestion`, `cotizada`, `cerrada`, `rechazada`.
Se conservan los cambios entre estos estados admitidos por el modelo previo;
no se introduce una secuencia nueva no acordada. `estados_permitidos` excluye el
estado actual. La escritura bloquea la cabecera y exige la versión esperada,
sin modificar datos de recepción ni detalles históricos.

Los errores mantienen `ok: false`, código, mensaje y `requestId`: validación 400,
sesión 401, permisos 403, solicitud inexistente o fuera del ámbito 404, versión
desactualizada 409, producto retirado 409 y migración o
conexión no disponible 503. No se devuelven errores internos de Supabase.

## Despliegue y evidencia

Aplicar la migración sobre sprint 9 actualizado y ejecutar
`supabase/tests/database/042_scrum163_verificacion_remota.sql`. El usuario confirmó
ambas ejecuciones y aportó una captura con `resultado: OK`. La prueba crea
Organizaciones, productos, solicitudes y avisos sintéticos y termina en
`ROLLBACK`; no modifica permanentemente datos del usuario ni envía notificaciones
externas. Usa contexto SQL de un ADMIN existente, no una sesión HTTP real.

Verificación local reproducible:

```powershell
node scripts/verificar-productos-db.mjs --scrum163
npm.cmd run test --workspace=@fge/organizations-service
node --experimental-strip-types --test frontend/tests/validaciones/cotizacion.test.mjs frontend/tests/validaciones/solicitudes-cotizacion.test.mjs
npm.cmd run check:architecture
npm.cmd run build:frontend
npm.cmd run test:e2e --workspace=frontend -- --config playwright.cotizacion.config.mjs cotizacion.spec.mjs
npm.cmd run test:e2e --workspace=frontend -- --config playwright.solicitudes.config.mjs
```

Resultados: 56 comprobaciones de productos y 73 de cotizaciones en PostgreSQL/PGlite,
142 pruebas de Organizaciones y 6 pruebas de clientes/validación aprobadas.
Compilación del Frontend y comprobación de arquitectura aprobadas. Las pruebas
de navegador específicas también pasaron: 8 del formulario y 9 de la bandeja
privada, con transporte y autenticación de prueba; no ejecutan escrituras remotas.
Las pruebas
SQL usan las migraciones y autorización reales con soporte mínimo de Auth/Storage;
las pruebas HTTP ejercitan Gateway y servicio con transporte Supabase simulado.

Tras iniciar la versión nueva, la comprobación contra Supabase real confirmó
Frontend HTTP 200, Gateway HTTP 200, Auth mediante renovación ficticia HTTP 401
`SESION_INVALIDA`, bandeja sin sesión HTTP 401, payload público vacío HTTP 400 y
producto inexistente HTTP 409 `PRODUCTO_NO_DISPONIBLE`, sin crear una solicitud.
La escritura válida remota se comprobó mediante la prueba SQL transaccional del
usuario; no se atribuye una ejecución HTTP válida con una sesión real de Coordinador.
