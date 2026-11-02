# Donaciones y Recursos SCRUM-131

Rama `feature/SCRUM-131-validaciones-zod-endpoints-donaciones`, creada desde `origin/sprint-7` actualizado a
`a148d0f`. Depende de la estructura SCRUM-130 y conserva archivos, evidencias,
auditoría y archivado existentes. Fuente funcional: HU20 y RF50–RF54 de
`REQUERIMIENTOS FINAL.docx`, revisados en SCRUM-130.

## Endpoints del Gateway

Todos requieren `Authorization: Bearer <sesión>`. La sesión del solicitante se
propaga a Supabase; no se utiliza una clave privilegiada para operar registros.

| Método y ruta | Resultado |
|---|---|
| GET `/api/v1/donations` | Lista registros activos visibles por RLS. |
| POST `/api/v1/donations` | Crea; exige `id_organizacion` en el cuerpo. |
| GET `/api/v1/organizations/:org/donations` | Lista los aportes del receptor. |
| POST `/api/v1/organizations/:org/donations` | Crea para el receptor de la ruta. |
| GET `/api/v1/donations/:id` | Consulta por identificador. |
| PATCH `/api/v1/donations/:id` | Modifica con versión esperada. |
| DELETE `/api/v1/donations/:id` | Archiva lógicamente mediante la RPC existente. |

GET, PATCH y DELETE por identificador también admiten la ruta
`/api/v1/organizations/:org/donations/:id`, comprobando el receptor. Las rutas
de respaldos se conservan; en las rutas anidadas también se comprueba que la
donación pertenezca al receptor antes de acceder a archivos.

## Creación

Ejemplo ficticio para la ruta anidada; sustituir país y Programa por UUID reales
visibles para la sesión. El Programa es opcional y global: no necesita un Plan
ni una relación inventada con país u Organización.

```json
{
  "fecha": "2026-10-21",
  "id_pais": "13100000-0000-4000-8000-000000000002",
  "id_programa": "13100000-0000-4000-8000-000000000003",
  "tipo_movimiento": "recibida",
  "contraparte_nombre": "Empresa de prueba",
  "tipo_donante": "empresa",
  "origen": "Campaña local",
  "tipo_aporte": "recurso",
  "categoria": "Servicio",
  "descripcion": "Horas profesionales",
  "cantidad": 2,
  "unidad": "horas",
  "valor_estimado": 100,
  "moneda_valorizacion": "CLP",
  "metodo_valorizacion": "Cotización",
  "estado": "Comprometida"
}
```

País, fecha, donante, tipo de donante, origen, descripción, tipo de aporte,
categoría y estado son obligatorios. La Organización está en la ruta o en el
cuerpo para la creación directa. Si aparece en ambos debe coincidir. El país
debe existir, estar activo y coincidir con el del receptor. Programa informado
también debe existir y estar activo. Se rechazan propiedades no admitidas.

- `fecha`: fecha calendario real AAAA-MM-DD, sin hora; no acepta 30 de febrero,
  meses imposibles ni año 0000.
- `tipo_donante`: `empresa`, `persona`, `organizacion`.
- `categoria`: `Dinero`, `Producto`, `Servicio`, `Insumos`, `Otro`.
- `Otro` exige `categoria_otro`; este texto no se admite en otras categorías.
- `tipo_aporte`: conserva `dinero`/`recurso`; Dinero corresponde a dinero y las
  otras cuatro categorías a recurso. Es independiente de `tipo_movimiento`
  (`recibida`/`entregada`) y de `estado`.
- Dinero exige `monto` finito positivo y `moneda` con tres letras mayúsculas;
  no admite cantidad/unidad de recursos.
- Recursos admiten cantidad/unidad cuando correspondan: ambos o ninguno.
  Cantidad debe ser finita y positiva. No usa monto/moneda efectivos.
- `valor_estimado`, `moneda_valorizacion` y `metodo_valorizacion` forman un
  grupo opcional completo, para dinero o recursos. Valor finito no negativo;
  moneda de tres mayúsculas y método no vacío. Se permite valor cero explícito.
- UUID, textos vacíos, límites y números se validan con Zod; no hay coerción de
  cadenas numéricas. El Backend vuelve a validar antes de persistir.

La creación admite los cuatro estados aprobados para registrar la situación
inicial conocida; HU20 no establece un estado inicial obligatorio. Las
modificaciones posteriores están sujetas a la secuencia autorizada.

## Modificación y estado

```json
{
  "version_esperada": 1,
  "cambios": { "estado": "Recibida" }
}
```

La secuencia fue confirmada explícitamente por el usuario el 21-oct-2026:
**Comprometida → Recibida → Entregada → Cerrada**. No se permiten saltos ni
retrocesos. Mantener el mismo estado al editar otros datos está permitido.
Un registro histórico sin estado solo puede inicializarse en Comprometida.
No se agregan reglas de cierre o inmutabilidad que no hayan sido acordadas.

`version_esperada` es un entero positivo seguro. `cambios` debe contener al
menos un campo editable. El esquema no admite modificar identificador, receptor,
país, auditoría, versión ni archivo desde PATCH. Se validan los campos enviados
y después el registro resultante completo. La escritura incluye la versión
esperada como condición: si otra sesión lo cambia entre lectura y escritura,
devuelve 409 y no sobrescribe sus cambios.

Programa, descripción de Otro, cantidad/unidad, monto/moneda y valorización
admiten `null` en PATCH para retirarlos cuando corresponda. Los campos
relacionados se deben limpiar o completar juntos; por ejemplo, para cambiar
recurso a dinero se envían `cantidad: null`, `unidad: null`, categoría Dinero,
tipo dinero, monto y moneda. Omitir un campo conserva su valor anterior.

Los registros históricos de SCRUM-130 pueden carecer de metadatos: para
editarlos se deben completar los obligatorios mediante `cambios`. No se
inventan tipo de donante, origen ni clasificación.

## Archivado y permisos

DELETE recibe `{"version_esperada": 1}`. Comprueba la sesión y la gestión del
receptor y llama a `archivar_donacion_segura`: bloquea la fila, comprueba versión,
archiva sus respaldos y la donación en una operación atómica. No borra filas ni
objetos físicos. Los registros archivados dejan de aparecer en las consultas
activas; su contenido y auditoría permanecen.

La preautorización usa la nueva RPC `puede_gestionar_donaciones`, que delega en
la misma función privada usada por RLS: Administrador, Coordinador con alcance
global/país o cobertura temporal vigente. Invitado, usuarios sin rol y
anónimos no pueden gestionar. RLS sigue comprobando la escritura final.
La RPC solo devuelve un booleano y no concede privilegios adicionales.

## Respuestas y errores

Se mantiene `{ok,code,message,data}` para éxitos. Creación responde 201; lectura,
modificación y archivo responden 200. Listados devuelven `data.donations`,
detalle/creación/modificación `data.donation`, y archivo `data.id_donacion`.
Las filas incluyen identificadores, metadatos HU20, estado y versión, además
de la auditoría existente. Los campos de datos históricos pueden ser null.

Errores: `{ok:false,error:{code,message,requestId,fields?},data:null}`.
`fields` contiene mensajes por campo para errores Zod, sin exponer valores,
credenciales ni respuestas internas de Supabase.

| HTTP | Códigos principales |
|---|---|
| 400 | `DATOS_INVALIDOS`, `JSON_INVALIDO` |
| 401 | `SESION_REQUERIDA`, sesión rechazada por Supabase |
| 403 | `SIN_PERMISO` |
| 404 | `NO_ENCONTRADA`, `PAIS_NO_EXISTE`, `PROGRAMA_NO_EXISTE` |
| 409 | `RELACION_INVALIDA`, `TRANSICION_NO_PERMITIDA`, `CONFLICTO_CONCURRENCIA` |
| 502 | `RESPUESTA_INVALIDA`, `ERROR_BASE_DATOS` |
| 503 | `SUPABASE_NO_DISPONIBLE`, `MIGRACION_PENDIENTE` |

## Despliegue y frontend

Aplicar **solo la nueva migración**
`supabase/migrations/20261021120000_fge_scrum131_autorizacion_donaciones.sql`
después de SCRUM-130, con el mecanismo habitual y registro en el historial.
No reconstruir la base compartida ni reejecutar SCRUM-130. La migración no
modifica datos ni políticas; publica una comprobación de permiso existente.
Sin ella, una escritura válida devuelve `MIGRACION_PENDIENTE` de forma controlada.

El formulario actual recibió los campos mínimos del contrato de creación;
el país procede de la Organización mostrada, y el Backend vuelve a comprobarlo.
Los mensajes por campo se conservan en el transporte y se muestran junto al
control correspondiente. El Frontend no implementa la secuencia de estados ni
la autorización: permanecen en el Backend/RLS. No se implementó una interfaz
nueva de edición ni archivado en esta tarea de endpoints.

## Verificación local y límites

- 181 pruebas de arquitectura/backend aprobadas, incluidas 99 de Organizaciones.
  Incluyen calendario, obligatoriedad, catálogos, valores, relaciones inexistentes,
  secuencia de estados, GET/POST/PATCH/DELETE, sesión, permisos, concurrencia,
  errores por campo y fallos de persistencia. Los tests HTTP simulan la Data API.
- PostgreSQL embebido PGlite ejecuta migraciones reales con soporte mínimo de
  Auth/Storage. Comprueba la nueva RPC para Administrador, Coordinador territorial,
  coberturas vigentes/vencidas, Invitado, sin rol y anon; comprueba RLS y archivado
  real con versión y respaldos. No equivale a una sesión remota de Supabase.
- Las 20 pruebas específicas de Donaciones del frontend (cliente, validación y
  persistencia/RLS) están aprobadas; incluyen preservación de metadatos y mensajes
  por campo del Backend.
- Compilación de producción del frontend y comprobación de sintaxis de servicios
  correctas. Verificador estático: 49 migraciones. La prueba pgTAP 023 queda
  preparada; no se ejecutó con Supabase CLI en esta sesión.
- Servicios reiniciados con acceso de red: `/login` 200, Gateway `/health` 200,
  renovación ficticia por Gateway **401 SESION_INVALIDA**, confirmando conexión
  real del backend de autenticación con Supabase.
- La ejecución de la suite general de frontend detectó dos fallos en
  Indicadores al inicializar su base por `42P10` (`ON CONFLICT(nombre)`
  sin restricción única compatible). Las migraciones, pruebas y helper que
  producen esa inicialización coinciden con `origin/sprint-7`; no se modificaron
  para SCRUM-131. El fallo ocurre antes de operar Donaciones.
- El usuario informó haber aplicado la nueva migración en Supabase. La
  comprobación remota posterior de `rpc/puede_gestionar_donaciones`, usando la
  clave pública sin sesión y un UUID inexistente, respondió **401 / 42501**:
  la función está disponible y su ejecución anónima está denegada. La primera
  consulta dio EACCES en sandbox y se repitió con aprobación de red, sin mostrar
  credenciales. Esta comprobación no acredita una ejecución autenticada de la
  RPC ni una prueba CRUD remota con permisos de usuario; esas operaciones no se
  realizaron en esta verificación.
- Verificación final posterior al despliegue informado: **99/99** pruebas de
  Organizaciones y **20/20** de Donaciones del frontend aprobadas. `/login` y
  Gateway `/health` respondieron 200, renovación ficticia por Gateway devolvió
  **401 SESION_INVALIDA**, y GET de Donaciones sin sesión devolvió
  **401 SESION_REQUERIDA**. `git diff --check` sin errores.
- Se conservaron `AGENTS.md` y los cuatro archivos locales de QA preexistentes.
