# SCRUM-159 · Consulta de auditoría

Ruta `/administracion/auditoria`, visible solo para ADMIN. Historial de solo
lectura con usuario, rol, fecha/hora UTC, país, IP, operación, entidad y referencia.
Tabla en escritorio amplio y tarjetas en pantallas pequeñas. Valores ausentes:
«No disponible». Reutiliza layout, encabezado, tarjetas y botones actuales.

Filtros opcionales por usuario, país, fechas, operación y entidad, combinables.
Permite aplicar y limpiar; distingue filtros aplicados de cambios pendientes.
Incluye validación, carga, error con reintento, vacío y páginas de 50 eventos.

## Dependencia pendiente y contrato propuesto

**Todavía no existe una API de consulta de auditoría en sprint-8.** Esta entrega
prepara la interfaz y el cliente HTTP, sin simular datos en producción.

`GET /api/v1/audit/events`, con Bearer de la sesión y autorización ADMIN en el
backend. Parámetros opcionales: `usuario`, `pais`, `desde`, `hasta`, `operacion`,
`entidad`, `cursor`; `limit=50`.

- Usuario busca nombre/correo/identificador; país busca nombre o código;
  operación y entidad buscan su nombre técnico. Texto sin distinguir mayúsculas
  ni acentos. Todos los criterios se combinan con AND.
- Fechas ISO YYYY-MM-DD: días completos UTC, ambos extremos incluidos. Se admite
  un solo extremo. Orden descendente estable por fecha/hora e ID; cursor estable
  asociado a los filtros de la consulta.
- Respuesta: `{ok:true,code:"OK",message:"OK",data:{events:[],nextCursor:null}}`.
- Cada evento contiene `id` (string, incluso bigint serializado), `usuario`,
  `rol`, `fecha_hora` (ISO8601 con zona), `pais`, `ip`, `operacion`, `entidad`,
  `referencia`. Usuario, rol, país, IP y referencia admiten null. La referencia
  es texto legible de la clave del registro, incluidas claves compuestas.
- No inferir datos históricos faltantes del estado actual del usuario ni enviar
  snapshots antes/después. La interfaz no recalcula ni completa esos datos.
- Errores: `{ok:false,error:{code,message,fields?},data:null}`. `fields` asocia
  nombres de filtro con listas de mensajes que se muestran junto al control.

El backend debe consultar el historial privado existente mediante su capa de
servicio y verificar ADMIN independientemente de la interfaz. No se modifican
políticas RLS ni se consulta directamente el historial desde el navegador.
El cliente solo ofrece GET; no hay edición ni eliminación.

## Cómo probar

Con `npm run dev`, ingresar como ADMIN y abrir Auditoría en el menú. Sin endpoint
se muestra «El servicio de consulta de auditoría todavía no está disponible».
Las pruebas simulan HTTP y verifican la interfaz, no la persistencia ni los
permisos reales del backend:

```sh
cd frontend
node --experimental-strip-types --test tests/validaciones/auditoria.test.mjs
npx playwright test --config playwright.auditoria.config.mjs
```
