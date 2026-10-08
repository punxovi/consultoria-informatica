# Validaciones Zod y endpoints de Expediente Legal

El expediente legal pertenece al servicio de Organizaciones y se publica a través del gateway en `http://127.0.0.1:4000/api/v1`.

## Endpoints

| Método | Ruta | Operación | Respuesta exitosa |
| --- | --- | --- | --- |
| `GET` | `/organizations/:id/legal-record` | Consultar antecedentes | `200 EXPEDIENTE_LEGAL_OBTENIDO` |
| `POST` | `/organizations/:id/legal-record` | Registrar antecedentes | `201 EXPEDIENTE_LEGAL_CREADO` |
| `PATCH` | `/organizations/:id/legal-record` | Actualizar antecedentes | `200 EXPEDIENTE_LEGAL_ACTUALIZADO` |

Las tres operaciones requieren `Authorization: Bearer <access_token>`. El identificador de la organización debe ser un UUID válido.

## Formato de registro y actualización

`POST` y `PATCH` reciben `multipart/form-data`. La parte `datos` contiene JSON y los PDF opcionales utilizan como nombre de campo uno de estos valores:

- `identidad_representante`
- `identificacion_legal`
- `estatutos`

El schema de registro valida estrictamente los campos:

```json
{
  "estado_personalidad_juridica": "si",
  "tipo_personalidad_juridica": "ONG",
  "numero_registro": "REG-2026",
  "fecha_constitucion": "2020-01-10",
  "vigencia_directiva": "Vigente hasta 2028",
  "documentos": [
    { "tipo": "identidad_representante", "estado": "pendiente" },
    { "tipo": "identificacion_legal", "estado": "no_aplica" },
    { "tipo": "estatutos", "estado": "pendiente" }
  ]
}
```

El schema de actualización exige además `version_esperada`, un entero positivo utilizado para impedir que una sesión sobrescriba cambios más recientes.

Los schemas rechazan propiedades desconocidas, tipos incorrectos, textos sobre el máximo permitido, fechas inexistentes o futuras y listas incompletas o duplicadas de documentos. Los PDF se validan por extensión, MIME, tamaño máximo de 10 MB y firma `%PDF-`.

## Estructura de respuestas

Respuesta exitosa:

```json
{
  "ok": true,
  "code": "EXPEDIENTE_LEGAL_CREADO",
  "message": "El expediente legal fue creado correctamente.",
  "data": { "expediente": {} }
}
```

Respuesta con error:

```json
{
  "ok": false,
  "error": {
    "code": "DATOS_INVALIDOS",
    "message": "Descripción del problema.",
    "requestId": "identificador de la solicitud"
  },
  "data": null
}
```

Los errores principales son `DATOS_INVALIDOS` (400), `SESION_REQUERIDA` (401), `SIN_PERMISO` (403), `NO_ENCONTRADO` (404), `EXPEDIENTE_EXISTENTE` o `CONFLICTO_CONCURRENCIA` (409), `ERROR_BASE_DATOS` (502) y `SUPABASE_NO_DISPONIBLE` (503).

## Pruebas locales

Desde la raíz del repositorio:

```powershell
npm.cmd test --workspace=@fge/organizations-service
npm.cmd run check --workspace=@fge/organizations-service
npm.cmd run dev
```

Las pruebas cubren los schemas de registro y actualización, rechazo antes de procesar, endpoints, respuestas estructuradas, permisos, errores de base de datos, repositorio Supabase, PDF y control de concurrencia.
