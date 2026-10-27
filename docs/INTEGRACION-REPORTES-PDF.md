# Integración de Reportes y exportación PDF

La pantalla **Reportes → Nuevo reporte** quedó conectada al flujo real
`Frontend → cliente HTTP → API Gateway → insights-service → Supabase`.

- La consulta envía el período, destino y filtros del formulario a
  `GET /api/v1/reports/consolidated` con la sesión actual.
- La vista previa se presenta solo cuando el período, destino y filtros que
  declara el Backend coinciden con la solicitud.
- La descarga utiliza exclusivamente la referencia preparada por esa vista
  previa (`download.url`). No vuelve a consultar el consolidado ni permite
  agregar filtros al pedir el PDF.
- La interfaz solicita confirmación antes de generar el documento e informa
  estados de preparación, descarga exitosa y errores. Una respuesta fallida o
  que no sea PDF nunca se muestra como descarga correcta.

## Trabajo manual requerido

No se agregó una migración nueva con esta integración. Antes de probar contra
una base de datos real, debe estar aplicada la migración ya existente
`20261019140000_fge_reportes_privacidad_auditoria.sql`; esta registra la
exportación aprobada y es necesaria para que el Backend entregue el PDF.

En el SQL Editor de Supabase, comprueba su presencia sin modificar datos:

```sql
SELECT to_regprocedure('public.registrar_exportacion_reporte(text,jsonb)')
  AS funcion_auditoria;
```

Si el resultado es `null`, aplica **solo** el contenido de
`supabase/migrations/20261019140000_fge_reportes_privacidad_auditoria.sql` en
el SQL Editor, o despliega las migraciones pendientes mediante el procedimiento
habitual del equipo. No uses `db reset` en una instancia remota.

Para ejecución local, inicia Docker y Supabase, y después la aplicación desde
la raíz del repositorio:

```powershell
npx.cmd --yes supabase@2.117.0 start
npx.cmd --yes supabase@2.117.0 migration up
npm.cmd install
npm.cmd run dev
```

`frontend/.env` debe apuntar al Gateway local con
`PUBLIC_API_BASE_URL=http://127.0.0.1:4000`; el archivo `backend/.env` necesita
`SUPABASE_URL` y `SUPABASE_ANON_KEY` del mismo entorno. No se requieren cambios
manuales adicionales en el Frontend ni en el Backend.

## Comprobación funcional

1. Inicia sesión como `ADMIN` o como `COORD` con alcance sobre los datos que
   quieres consultar.
2. Abre **Reportes → Nuevo reporte**, elige un período y, opcionalmente,
   país, organización, programa, indicadores, resultados y destino.
3. Selecciona **Solicitar vista previa**. Comprueba que los criterios y los
   valores mostrados corresponden a tu selección.
4. Selecciona **Descargar PDF** y luego **Generar y descargar PDF**. El nombre
   del archivo debe incluir el mismo período y destino de la vista previa.
5. Cambia un filtro: la vista anterior y su opción de exportar deben
   desaparecer hasta solicitar una nueva vista previa.
6. Como verificación opcional de auditoría, en SQL Editor consulta:

```sql
SELECT fecha_hora, id_usuario, permiso_ejercido, despues
FROM fge_private.historial_cambios
WHERE tabla_afectada = 'reportes'
  AND permiso_ejercido = 'reportes.exportar'
ORDER BY fecha_hora DESC
LIMIT 10;
```

La descarga correcta deja un registro. Si el usuario no cuenta con permisos,
la vista previa o la exportación debe mostrar el error y no entregar un PDF.

## Verificación automatizada ejecutada

```powershell
npm.cmd run test --workspace=@fge/insights-service
node --experimental-strip-types --test frontend/tests/validaciones/reportes-configuracion.test.mjs frontend/tests/validaciones/reportes-consulta.test.mjs frontend/tests/validaciones/reportes-vista-previa.test.mjs frontend/tests/clientes/reportes-pdf.test.mjs
npx.cmd playwright test --config playwright.reportes.config.mjs
npm.cmd run build:frontend
```

Las ejecuciones de esta entrega completaron 31 pruebas del servicio, 28 del
cliente/validaciones, 19 pruebas de navegador y la compilación del Frontend.
