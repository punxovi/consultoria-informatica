# Contrato implementado — SCRUM-118

La interfaz recupera el trabajo de SCRUM-112 y utiliza `frontend/src/lib/indicadores/cliente.ts` y el transporte HTTP común. El Gateway dirige estas rutas al servicio **Interventions**, que ejecuta RPC de Supabase con la clave pública y el Bearer token del usuario. Respuesta `{ ok, code, message, data }`. No utiliza credenciales privilegiadas ni datos de demostración.

| Método y ruta | Entrada | Contenido de `data` |
| --- | --- | --- |
| GET `/api/v1/indicators/catalog` | — | `{ catalogo: [...] }` |
| GET `/api/v1/actions/:id/indicators` | — | `{ indicadores: [...] }` |
| POST `/api/v1/actions/:id/indicators` | `{ indicadores: [{ id_indicador, meta }] }` | `{ indicadores: [...] }`, solo los creados |
| PATCH `/api/v1/indicators/:id` | `{ version_esperada, cambios: { meta } }` | `{ indicador: ... }` |
| POST `/api/v1/results` | `{ id_indicador, valor_medido, fecha_medicion, observaciones }` | `{ resultado: ... }` |
| PATCH `/api/v1/results/:id` | `{ version_esperada, cambios: { valor_medido, fecha_medicion, observaciones } }` | `{ resultado: ... }` |

## Identificadores y datos

- **Catálogo:** filas activas de `indicadores` con `id_accion IS NULL`. Devuelve `id_indicador`, `codigo` (UUID convertido a texto como identificador estable), `nombre`, `descripcion`, `unidad_medida`. Se admite cualquier definición institucional existente, sin limitarse a cinco códigos en el Frontend. Un catálogo vacío es un estado válido.
- **Indicador asociado:** `id_indicador` (UUID propio de la asociación), `id_accion`, `id_catalogo`, `nombre`, `descripcion`, `unidad_medida`, `meta`, `version`, `resultado` (objeto o `null`). En el POST de asociación, el `id_indicador` enviado identifica la entrada del catálogo; en las rutas de resultados identifica el indicador ya asociado. Las definiciones se copian del catálogo al asociar. Los registros históricos conservan `id_catalogo: null` y pueden tener `meta: null` (se muestra **Sin definir**).
- **Resultado:** `id_resultado`, `id_indicador` (asociación), `valor_medido`, `fecha_medicion` (`YYYY-MM-DD`), `observaciones` (texto o `null`), `version`.

Las escrituras requieren números finitos no negativos, hasta `Number.MAX_SAFE_INTEGER`; cero es válido. Las versiones son enteros positivos obligatorios en PATCH, independientes para meta y resultado. Las observaciones admiten hasta 1000 caracteres. Las fechas deben ser fechas civiles reales entre los años 0001 y 9999. Se pueden leer valores históricos sin cambiarlos automáticamente.

## Persistencia y permisos

- La migración `20261017120000_fge_indicadores_integracion.sql` añade la referencia al catálogo, un índice único para asociaciones activas y las operaciones RPC. No inserta definiciones institucionales ni modifica registros anteriores.
- `consultar_catalogo_indicadores`, `listar_indicadores_accion`, `asociar_indicadores_accion`, `actualizar_meta_indicador` y `guardar_resultado_indicador` ejecutan con **SECURITY INVOKER**. Solo se concede EXECUTE a `authenticated`, conservando RLS y `auth.uid()`.
- El catálogo se consulta con las políticas existentes. ADMIN puede mantenerlo; esta interfaz no modifica sus definiciones. COORD conserva lectura global y escritura territorial según asignaciones/coberturas; INVIT conserva su alcance de lectura y no puede escribir.
- La asociación de un lote es transaccional: todo o nada. Un índice único impide repetir el mismo catálogo en una Acción activa. Los triggers impiden trasladar indicadores o resultados a otros padres.
- Una versión antigua devuelve 409. El Frontend conserva entradas y exige recargar antes de reintentar tras conflictos o respuestas inciertas. Un registro inaccesible/inexistente devuelve 404; una escritura fuera del alcance devuelve 403.
- `resultado: null` significa sin medición. Si existen varias mediciones históricas, se muestra la última **registrada**, ordenada por `created_at DESC, id_resultado DESC`. Esta pantalla crea el primer resultado y actualiza el mostrado; no implementa historial. Un segundo POST con resultado activo devuelve 409.
- Actualizar una meta no debe cambiar su resultado, ni actualizar un resultado debe modificar la meta.
- No se calcula porcentaje de avance: la fórmula y agregación aún deben acordarse.

Las validaciones de entrada están en `backend/services/interventions/src/domain/indicators.ts`; la respuesta se valida en `frontend/src/lib/indicadores/modelo.ts` y el cliente comprueba la pertenencia a la Acción y al indicador solicitados.
