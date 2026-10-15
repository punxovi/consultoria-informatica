# Contrato propuesto — SCRUM-112

Estas rutas están preparadas en `frontend/src/lib/indicadores/cliente.ts`; **todavía no están implementadas en el backend**. Se usa el transporte HTTP común con Bearer token y respuesta `{ ok, code, message, data }`.

| Método y ruta | Entrada | Contenido de `data` |
| --- | --- | --- |
| GET `/api/v1/indicators/catalog` | — | `{ catalogo: [...] }` |
| GET `/api/v1/actions/:id/indicators` | — | `{ indicadores: [...] }` |
| POST `/api/v1/actions/:id/indicators` | `{ indicadores: [{ id_indicador, meta }] }` | `{ indicadores: [...] }`, solo los creados |
| PATCH `/api/v1/indicators/:id` | `{ version_esperada, cambios: { meta } }` | `{ indicador: ... }` |
| POST `/api/v1/results` | `{ id_indicador, valor_medido, fecha_medicion, observaciones }` | `{ resultado: ... }` |
| PATCH `/api/v1/results/:id` | `{ version_esperada, cambios: { valor_medido, fecha_medicion, observaciones } }` | `{ resultado: ... }` |

## Identificadores y datos

- **Catálogo:** `id_indicador` (UUID del catálogo), `codigo`, `nombre`, `descripcion`, `unidad_medida`. Códigos previstos: `beneficiarios`, `participantes`, `capacitaciones`, `raciones`, `acciones_ejecutadas`. Los UUID de la demo no son datos para producción.
- **Indicador asociado:** `id_indicador` (UUID propio de la asociación), `id_accion`, `id_catalogo` (UUID del catálogo), `meta`, `version`, `resultado` (objeto o `null`). En el POST de asociación, el `id_indicador` enviado identifica la entrada del catálogo; en las rutas de resultados identifica el indicador ya asociado.
- **Resultado:** `id_resultado`, `id_indicador` (asociación), `valor_medido`, `fecha_medicion` (`YYYY-MM-DD`), `observaciones` (texto o `null`), `version`.

Metas y valores son números finitos no negativos; cero es válido. Las versiones son enteros positivos e independientes para meta y resultado. El frontend admite observaciones de hasta 1000 caracteres.

## Reglas para integrar

- Crear el catálogo persistente y su relación con cada indicador de una acción; no están resueltos por los schemas actuales.
- Asociar el lote en una transacción: todo o nada. Evitar repetir un indicador del catálogo en la misma acción.
- Validar sesión, permisos y pertenencia a la acción en el servidor. Ante una versión antigua, responder 409. El frontend exige recargar antes de reintentar tras conflictos o respuestas inciertas.
- Devolver `resultado: null` si no hay medición. Si existen varias mediciones históricas, acordar y aplicar una selección determinista para el resultado mostrado. Esta pantalla crea el primero y actualiza el mostrado; no implementa historial.
- Actualizar una meta no debe cambiar su resultado, ni actualizar un resultado debe modificar la meta.
- No se calcula porcentaje de avance: la fórmula y agregación aún deben acordarse.

Los tipos y validaciones exactos están en `frontend/src/lib/indicadores/modelo.ts`. Si el backend adopta rutas o respuestas distintas, adaptar el cliente HTTP y sus pruebas antes de conectar.
