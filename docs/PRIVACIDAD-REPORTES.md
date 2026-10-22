# Privacidad y auditoría de reportes (SCRUM-140)

## Destinos

El endpoint autenticado `GET /api/v1/reports/overview` acepta `destino`:

- `interno` (predeterminado): conserva el snapshot visible para la sesión. Las consultas de origen usan el JWT del solicitante y, por tanto, las políticas RLS y el alcance territorial vigente.
- `donante`: aplica el perfil agregado HU22.
- `externo`: aplica el perfil agregado HU22.

Los destinos externos solo exponen métricas agregadas, progreso y la serie mensual. No incluyen nombres de países, identificadores de organizaciones, planes o acciones, contactos, documentos legales, respaldos ni otros datos que permitan identificar personas.

Ejemplo:

```text
GET /api/v1/reports/overview?destino=externo&id_pais=<uuid>
Authorization: Bearer <jwt>
```

El filtro territorial se aplica antes de construir las métricas. Un usuario sin sesión no puede solicitar el reporte; un usuario sin alcance solo recibe los datos que Supabase devuelve mediante RLS.

## Auditoría

Cada exportación exitosa llama a `public.registrar_exportacion_reporte`, que escribe en `fge_private.historial_cambios` con el usuario autenticado, fecha/hora, destino y filtros. La operación usa `permiso_ejercido = 'reportes.exportar'` y no introduce una tabla de auditoría paralela.

La auditoría se registra después de preparar correctamente la salida. Si falla el registro, la exportación falla y el reporte no se entrega.

## PDF de reportes consolidados (SCRUM-139)

`GET /api/v1/reports/consolidated` prepara una referencia temporal a los datos
filtrados y devuelve `document` para la vista previa y `download` para el PDF.
Para destinos externos no entrega el snapshot detallado: documento y PDF usan
exclusivamente agregados y no contienen identidades ni UUID de los filtros.

`GET /api/v1/reports/:id/pdf` valida nuevamente la identidad, genera desde esa
referencia sin consultar otra vez los módulos y registra la exportación mediante
la RPC existente con todos los filtros. La vista previa no registra una
exportación PDF. Si falla la generación o la auditoría, el archivo no se entrega.
El contrato, sus límites y las verificaciones están en [REPORTES-PDF](REPORTES-PDF.md).
