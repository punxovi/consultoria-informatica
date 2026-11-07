# Generación y exportación PDF SCRUM-139

La rama `feature/SCRUM-139-generacion-exportacion-reportes-pdf` parte de
`origin/sprint-7` en `ed84903`. Implementa el PDF sobre el consolidado existente
de SCRUM-136; no vuelve a consultar módulos para generar o descargar un archivo.
Se revisaron HU22, RF59–RF61, RF89 y RNF17 del documento de requerimientos
aportado previamente por el usuario.

## Solicitud y respuesta de preparación

```http
GET /api/v1/reports/consolidated?fecha_inicio=2026-01-01&fecha_termino=2026-12-31&destino=interno
Authorization: Bearer <sesión>
```

Se conservan los filtros existentes: `fecha_inicio`, `fecha_termino`, `id_pais`,
`id_organizacion`, `id_programa`, `indicadores`, `resultados` y `destino`.
Las listas de indicadores/resultados contienen UUID separados por comas
(máximo 100 por lista). El rango es obligatorio y admite solo fechas calendario
reales; se rechazan fechas imposibles, año 0000, rangos invertidos, filtros
desconocidos, parámetros duplicados y UUID vacíos o inválidos.

El servicio valida la identidad en Supabase Auth y llama **una vez** a
`loadConsolidated` con los filtros validados. Comprueba que período y filtros
del consolidado coincidan con esa solicitud. La respuesta mantiene el envoltorio
`{ok,code,message,data:{report}}` y agrega:

```json
{
  "destination": "interno",
  "title": "Reporte Consolidado Institucional",
  "document": {
    "title": "Reporte consolidado de intervenciones",
    "destination": "interno",
    "generatedAt": "2026-10-21T18:30:00.000Z",
    "period": { "start": "2026-01-01", "end": "2026-12-31" },
    "filters": ["País: todos los visibles para la sesión"],
    "summary": [{ "label": "Beneficiarios", "value": "200" }],
    "sections": []
  },
  "download": {
    "id": "13900000-0000-4000-8000-000000000001",
    "url": "/api/v1/reports/13900000-0000-4000-8000-000000000001/pdf",
    "fileName": "reporte-fge-2026-01-01_2026-12-31-interno.pdf",
    "mimeType": "application/pdf",
    "expiresAt": "2026-10-21T18:35:00.000Z"
  }
}
```

Ejemplo abreviado con datos ficticios: el documento real contiene las ocho
secciones y todos los filtros relevantes. `document` permite construir la vista
previa a partir del mismo modelo que consume el generador PDF. Para destino
interno también se conserva `snapshot` por compatibilidad. Para `donante` o
`externo` se omite ese snapshot detallado y se devuelve
`privacyProfile: agregado_hu22`; vista previa y PDF contienen solo agregados.

## Descarga

```http
GET /api/v1/reports/<download.id>/pdf
Authorization: Bearer <sesión>
```

La URL debe ser la devuelta por preparación y no admite nuevos filtros ni un
consolidado enviado por el cliente. Se valida nuevamente la identidad en Auth,
se recupera su documento preparado y se genera el PDF en memoria. La renovación
del token del mismo usuario no cambia el documento; otro usuario no puede
descargarlo. **No se llama a `load`, `loadConsolidated` ni a módulos de datos
durante la descarga.** Las únicas operaciones remotas son validar la identidad
y registrar la exportación mediante la RPC de auditoría existente.

Respuesta 200 binaria, sin envoltorio JSON:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="reporte-fge-2026-01-01_2026-12-31-interno.pdf"
Content-Length: <bytes>
Cache-Control: no-store, private
X-Content-Type-Options: nosniff
X-Request-Id: <identificador>
```

El Gateway conserva el binario y sus cabeceras y expone nombre y tamaño mediante
CORS. Los errores conservan `{ok:false,error:{code,message,requestId},data:null}`.
Se prepara y valida el archivo completo antes de enviar cabeceras de descarga;
un error de auditoría impide entregarlo. No se guardan PDFs temporales, URLs
públicas, claves privilegiadas ni tokens dentro del documento o del almacén.

El cliente `crearClienteReportesPdf` en `frontend/src/lib/reportes/pdf.ts`
implementa `preparar(filtros)` y `descargar(referencia)`. Este último devuelve
`{blob,fileName}` para gestionar una descarga con `URL.createObjectURL` y un
enlace con atributo `download`. Rechaza URLs ajenas al Gateway, referencias
alteradas, respuestas JSON en lugar de PDF, archivos incompletos y fallos de red.
La pantalla de Reportes usa este cliente para solicitar la vista previa y,
después de una confirmación explícita, descargar el PDF de la referencia ya
preparada. No vuelve a consultar el consolidado al exportar. La guía manual y
las pruebas del recorrido integrado están en
[INTEGRACION-REPORTES-PDF](INTEGRACION-REPORTES-PDF.md).

## Contenido y fidelidad

Incluye período, fecha de generación recibida del consolidado, destino, filtros,
resumen y secciones HU22: Organizaciones y beneficiarios; Planes; Acciones;
Acciones ejecutadas; Compromisos cumplidos; Donaciones y recursos; Indicadores;
Resultados obtenidos. Las acciones ejecutadas y compromisos cumplidos se
seleccionan por sus estados dentro de los arrays recibidos. No se agregan
consultas ni se inventan valores para secciones vacías.

Para uso interno se reproducen los campos explícitos del contrato; no se
exportan campos desconocidos de los objetos. Para destinos externos solo se
incluyen conteos y totales, sin nombres, identificadores, contactos, documentos
legales ni identidad de personas. Sus filtros indican las selecciones aplicadas
sin exponer UUID. No se suman resultados de indicadores con unidades diferentes.

El contrato actual de SCRUM-136 no entrega moneda ni unidad de los aportes, por
lo que el PDF lo advierte y no presume CLP ni una unidad. La consolidación HU22 ahora consulta indicadores y
resultados persistidos, con las reglas temporales del contrato HU22. El PDF usa
esa instantánea y no vuelve a consultar los módulos para completar datos.

Se utiliza el PNG oficial disponible, los colores de la aplicación y fuentes
Liberation Sans redistribuibles con su licencia. Los recursos se incluyen en
el servicio para evitar dependencias de frontend, CDN o fuentes del sistema.
Formato A4, numeración, encabezados de tabla repetidos, división de registros
largos sin truncarlos y mensajes explícitos cuando no hay resultados.

## Límites y errores

Las referencias duran cinco minutos y pertenecen al usuario que preparó el
reporte. El almacén es local al proceso: máximo cinco referencias activas por
usuario, 64 globales y 32 MiB. Un reinicio pierde las referencias, y múltiples
réplicas requieren afinidad de instancia o sustituir el almacén por uno
compartido con los mismos controles. No se persisten datos de sesión.

Se limita el consolidado a 20.000 filas y 4 MiB; el PDF, a 400 páginas y 12 MiB.
Se falla explícitamente si un carácter no puede representarse con la fuente,
en lugar de omitirlo o dibujar cuadrados. Estados/códigos relevantes:

| HTTP | Código |
|---|---|
| 400 | `DATOS_INVALIDOS` |
| 401/403 | `SESION_REQUERIDA`, `SIN_PERMISO` |
| 404 | `REPORTE_NO_DISPONIBLE` (caducó, no existe o pertenece a otro usuario) |
| 413 | `REPORTE_DEMASIADO_GRANDE` |
| 422 | `PDF_CARACTER_NO_SOPORTADO` |
| 429 | `REPORTES_EN_PREPARACION` |
| 500 | `PDF_PREPARACION_FALLIDA`, `PDF_GENERACION_FALLIDA` |
| 502/503 | consolidado inconsistente, fallos de persistencia/Auth/red |

La auditoría se registra después de generar y validar el archivo, con destino,
usuario y todos los filtros (período, país, Organización, Programa, Indicadores
y Resultados), usando `registrar_exportacion_reporte` de SCRUM-140. No se crea
una segunda auditoría ni una migración nueva. Un corte de red del cliente se
trata como descarga fallida, sin presentar un archivo parcial como válido; la
auditoría acredita la generación/entrega iniciada por el servidor, no que el
usuario haya terminado de guardar o abrir el archivo.

## Validación y RNF17

- 126 pruebas de arquitectura/backend aprobadas; 30 corresponden a Insights.
  Incluyen PDF, privacidad, fidelidad, aislamiento por usuario, caducidad,
  autenticación, auditoría, errores y descarga real a través de Gateway local.
  La fuente consolidada y Auth están simulados en esas pruebas de integración.
- Cuatro pruebas del cliente PDF aprobadas y compilación del frontend correcta.
- PDF abiertos con Poppler y pypdf; inspección visual de las siete páginas de
  los ejemplos interno/externo y de páginas intermedia/final del volumen de
  referencia. Comprobación automatizada con pdfplumber de los límites de texto
  en las 119 páginas de referencia y conservación de sus 3.000 apariciones de
  acciones (2.000 en el listado y 1.000 cumplidas). Texto largo conservado y
  secciones vacías correctamente indicadas.
- RNF17 define p95 inferior a tres segundos, con tres países, 50 Organizaciones,
  300 Planes, 2.000 Acciones y red estable de al menos 5 Mbps. Veinte generaciones
  locales con ese volumen dieron **p95 416,09 ms**, archivo de **331.171 bytes**.
  Generación más transferencia ideal a 5 Mbps se estima en **945,97 ms**.
  La transferencia es una estimación matemática: no se midió una red móvil real
  ni se incluyeron latencia de Auth/auditoría remotas o carga concurrente.
  No se afirma cumplimiento integral de RNF17 en producción sin medir ese flujo.
- Servicios reiniciados en esta rama: frontend `/login` 200, Gateway `/health`
  200, capacidades incluyen `pdf`. Renovación ficticia por Gateway:
  **401 SESION_INVALIDA**. La solicitud consolidada con token ficticio se
  rechazó con **403 SIN_PERMISO**, atravesando la validación real en Supabase.
- La RPC remota de auditoría existe y rechaza la ejecución sin sesión
  (**401 / 42501**). No se probó una exportación remota con sesión válida ni se
  afirma haber generado reportes con datos reales. No se requiere SQL nuevo.
- `AGENTS.md` y los cuatro archivos locales de QA se conservaron sin cambios.

Reproducción con datos ficticios:

```powershell
npm.cmd run test:architecture
node --experimental-strip-types --test frontend/tests/clientes/reportes-pdf.test.mjs
node --experimental-strip-types scripts/verificar-reportes-pdf.mjs <carpeta-de-QA>
python scripts/inspeccionar-reportes-pdf.py <carpeta-de-QA>
```

La inspección independiente requiere pypdf y pdfplumber; las imágenes se
obtienen con `pdftoppm`. Estas herramientas son solo de QA: la operación Node
de producción utiliza PDFKit y los recursos locales versionados.

## Consolidación HU22

La consulta de origen, sus filtros, permisos y reglas temporales están definidos
en [CONTRATO-REPORTE-CONSOLIDADO-HU22.md](CONTRATO-REPORTE-CONSOLIDADO-HU22.md).
Los indicadores sin medición se muestran como «No informado».
