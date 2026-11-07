# SCRUM-178: generación y descarga de PDF de compromisos

## Endpoint

`GET /api/v1/organizations/{id_organizacion}/commitments/pdf`

Filtro opcional: `?id_acta={uuid}`. No se admiten otros parámetros ni filtros
duplicados. La organización siempre se toma de la ruta. Ambos identificadores
deben ser UUID válidos.

Se requiere `Authorization: Bearer <access_token>` con una sesión que pueda
consultar la organización y sus compromisos. La ruta interna del servicio es
`/v1/organizations/{id_organizacion}/commitments/pdf`.

## Flujo y permisos

Gateway → Organizations HTTP → `downloadCommitmentsPdf` → servicio de aplicación
→ repositorio Supabase existente → renderizador PDFKit.

La aplicación consulta `getById` y `listCommitments` con el mismo token del
usuario. El repositorio conserva RLS y usa `consultar_compromisos` con
`p_id_organizacion` y, si se proporciona, `p_id_acta`. La RPC verifica el acceso
a la organización y excluye compromisos y actas archivados. La aplicación valida
el esquema de cada registro y comprueba nuevamente que los identificadores
coincidan con el contexto antes de renderizar. No se utiliza una service role.

La funcionalidad reutiliza la migración
`20261010140000_fge_compromisos_integracion.sql`; no necesita nuevas tablas,
funciones, buckets ni migraciones. La migración existente debe estar aplicada.

## Contenido

- Organización, identificador y acta seleccionada, si se filtró por acta.
- Total de compromisos y numeración de páginas.
- Por compromiso: descripción, responsable, fecha límite de cumplimiento,
  estado y acta de origen.
- Si están disponibles: contacto, observaciones y fecha/hora de cumplimiento
  registrado, expresada en UTC. La fecha límite es una fecha civil y no sufre
  conversiones de zona horaria.

Los registros se ordenan por fecha límite y UUID. Se usan fuentes Liberation
Sans incluidas en el propio servicio, con su licencia, para representar acentos
y eñes. Los textos extensos continúan en páginas nuevas.

Límites: 500 compromisos, 200 páginas y 8 MiB. Si se superan, el usuario debe
reducir el contexto mediante el filtro de acta. No se truncan registros.

## Respuesta de descarga

En éxito: `200` con los bytes PDF como cuerpo, sin envoltorio JSON.

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="compromisos-<uuid>.pdf"; filename*=UTF-8''compromisos-<uuid>.pdf
Content-Length: <cantidad de bytes>
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
X-Request-Id: <identificador de trazabilidad>
```

El nombre incorpora el UUID del acta cuando hay filtro. El Gateway conserva las
cabeceras de descarga y CORS expone `content-disposition`, `content-length` y
`x-request-id`. Para métodos diferentes de GET se devuelve `405` y `Allow: GET`.

Los errores usan el contrato `failure` existente, sin cabecera de adjunto:

```json
{
  "ok": false,
  "error": {
    "code": "COMPROMISOS_SIN_DATOS",
    "message": "No hay compromisos disponibles para el contexto seleccionado.",
    "requestId": "..."
  },
  "data": null
}
```

| HTTP | Código | Situación |
| --- | --- | --- |
| 400 | `DATOS_INVALIDOS` | UUID, filtro o parámetro repetido inválido. |
| 401 | `SESION_REQUERIDA` | Falta token. |
| 401/403 | `SIN_PERMISO` | Supabase rechaza la sesión o el permiso. |
| 404 | `NO_ENCONTRADA` / `NO_ENCONTRADO` | Organización inexistente o no disponible. |
| 404 | `COMPROMISOS_SIN_DATOS` | No existen compromisos visibles para ese contexto. |
| 405 | `METODO_NO_PERMITIDO` | Método distinto de GET. |
| 413 | `PDF_DEMASIADO_GRANDE` | Se supera algún límite de generación. |
| 500 | `PDF_PREPARACION_FALLIDA` | No se pueden cargar las fuentes. |
| 500 | `PDF_GENERACION_FALLIDA` | Falla el renderizador o produce un PDF inválido. |
| 502 | `RESPUESTA_INVALIDA` | Datos corruptos, archivados o de otro contexto. |
| 502 | `ERROR_BASE_DATOS` | Error no previsto de PostgREST. |
| 503 | `SUPABASE_NO_DISPONIBLE` | No se puede conectar con Supabase. |

## Consumo desde navegador

El cliente debe usar `fetch` autenticado y leer `blob()` en el caso exitoso;
el transporte JSON habitual no debe interpretar el binario. Ejemplo:

```ts
const response = await fetch(`/api/v1/organizations/${orgId}/commitments/pdf`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!response.ok) {
  const result = await response.json();
  throw new Error(result.error.message);
}
const objectUrl = URL.createObjectURL(await response.blob());
const link = document.createElement('a');
link.href = objectUrl;
link.download = `compromisos-${orgId}.pdf`;
document.body.append(link);
link.click();
link.remove();
setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
```

La descarga está disponible desde el detalle de Compromisos y el detalle del Acta.
El contexto de Organización y Acta se pagina cuando es extenso, conservando su
contenido y los márgenes del pie. El resumen pasa a una nueva página si no cabe.

## Verificación

```powershell
node --experimental-strip-types --test backend/services/organizations/tests/commitments-pdf.test.ts
npm.cmd run test --workspace=@fge/organizations-service
npm.cmd run test --workspace=@fge/api-gateway
```

Las pruebas usan un repositorio simulado, fetch simulado y servidores HTTP
locales. Verifican filtrado, permisos, respuesta inválida, límites, PDF real con
varias páginas y descarga completa a través del Gateway. No sustituyen una
prueba contra las políticas RLS de la base desplegada.
