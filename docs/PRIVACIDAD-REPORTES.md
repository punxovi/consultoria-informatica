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
