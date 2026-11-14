# Persistencia de donaciones, certificados y respaldos

## Sentido y partes

`tipo_movimiento` se interpreta desde la organización identificada por
`id_organizacion`, no desde FGE ni desde el estado del aporte:

| Movimiento | Emisor | Receptor |
| --- | --- | --- |
| `recibida` | `contraparte_nombre` | Organización asociada |
| `entregada` | Organización asociada | `contraparte_nombre` |

El backend añade `emisor` y `receptor` a las respuestas reales del repositorio,
derivados del movimiento. Son campos de lectura: no se reciben como copias
editables en POST/PATCH. Ejemplo para una donación entregada:

```json
{
  "tipo_movimiento": "entregada",
  "emisor": {
    "tipo": "organizacion",
    "id_organizacion": "<uuid de la organización>",
    "id_pais": "<uuid del país>"
  },
  "receptor": { "tipo": "contraparte", "nombre": "Comunidad receptora" }
}
```

En SQL, `public.donaciones_partes` expone los mismos campos mediante una vista
`security_invoker`. Las relaciones y los datos editables siguen en las tablas
originales. El país mantiene su FK compuesta con la organización. No se inventan
identificadores fiscales, nombres de organizaciones ni entidades para las
contrapartes históricas. Si una respuesta histórica omite país, la proyección
TypeScript expresa `id_pais: null`; la base actual lo exige por integridad.

## Certificados: reutilización del flujo existente

No se crea una tabla de certificados ni un bucket nuevo. Cada documento es una
fila independiente de `public.archivos`, vinculada por `id_donacion`. Una
donación puede tener varios certificados y varios respaldos de otros tipos.

Se conservan los endpoints actuales:

1. `POST /api/v1/donations/{donacion}/files`: reserva metadatos.
2. `PUT /api/v1/donations/{donacion}/files/{archivo}?version_esperada={version}`:
   carga binaria con `Content-Type` coincidente.
3. `GET /api/v1/donations/{donacion}/files`: consulta los documentos asociados.
4. `GET /api/v1/donations/{donacion}/files/{archivo}/file`: descarga privada.

También se conservan las rutas anidadas bajo
`/api/v1/organizations/{organizacion}/donations/{donacion}/files`.
Estas verifican que la donación corresponda a la organización de la ruta.

Todos los endpoints requieren `Authorization: Bearer <token>` y conservan el
token del usuario ante Supabase. La reserva de un certificado usa:

```json
{
  "tipo_respaldo": "certificado",
  "nombre_original": "certificado.pdf",
  "mime_type": "application/pdf",
  "tamano_bytes": 12345,
  "descripcion": "Certificado del aporte"
}
```

`tamano_bytes` debe ser el tamaño real. Si se envía `id_donacion` en el cuerpo,
debe coincidir con la ruta. La reserva devuelve `id_archivo`, versión, estado,
tipo documental y referencia al objeto privado:

`fge-archivos / donaciones/{id_donacion}/{id_archivo}.{extension}`.

Se admiten PDF, JPEG, PNG y WebP hasta 50 MiB, conservando la validación de firma
binaria del mecanismo existente. Las respuestas JSON usan `success`/`failure`;
la descarga exitosa entrega bytes con las cabeceras existentes de adjunto.

## Integridad y auditoría

La migración `20261105010000_fge_donaciones_partes_certificados.sql`:

- Añade la vista de partes sin reescribir los registros históricos.
- Refuerza el trigger existente `validar_archivo_donacion`, incluso cuando se
  intenta quitar `id_donacion` para sacar el archivo del módulo.
- Conserva inmutables donación, UUID, bucket, ruta, nombre original, MIME,
  tamaño, categoría y tipo documental de un respaldo reservado.
- Exige reservas nuevas con UUID propio en la ruta, formato/tamaño admitidos,
  tipo documental explícito y estado `reservado`.
- Bloquea reservas sobre donaciones archivadas y serializa esa comprobación
  con el archivado mediante un bloqueo de fila.
- Conserva `reservado → disponible/fallido` y `fallido → reservado` para
  reintentos. Un documento disponible no vuelve a ser una reserva.
- Mantiene FKs, RLS, políticas de Storage, sellado de autores, versiones y
  auditoría. El archivado conserva las filas y sus referencias.

Para reemplazar un certificado se reserva un documento nuevo: no se sobrescribe
su identidad física. La descripción y el archivado mantienen su comportamiento
existente. No se añade emisión, firma ni generación de certificados.

El repositorio verifica bucket, prefijo privado y pertenencia a la donación antes
de descargar. Las actualizaciones de estado usan UUID de archivo, UUID de
donación, versión, estado reservado y exclusión de archivados, evitando que un
error de carga sobrescriba el estado de una versión posterior.

Errores específicos:

| HTTP | Código | Significado |
| --- | --- | --- |
| 400 | `DONACION_NO_COINCIDE` | El ID del cuerpo no coincide con la ruta. |
| 400 | `RESPALDO_INVALIDO` | La reserva incumple la integridad documental. |
| 409 | `RESPALDO_INMUTABLE` | Se intenta cambiar la asociación o identidad física. |
| 409 | `ESTADO_RESPALDO_INVALIDO` | Transición de carga no permitida. |
| 502 | `RESPUESTA_INVALIDA` | Supabase devuelve una referencia ajena o corrupta. |

Se conservan los códigos existentes para permisos, firma binaria, conflictos de
versión, conexión, errores de Storage y archivos no disponibles.

## Verificación realizada en fge-dev el 5 de noviembre de 2026

La sesión autenticada del SQL Editor permitió verificar la base directamente,
sin crear ni almacenar credenciales nuevas. La prueba SQL cambia temporalmente
al rol `authenticated` con el contexto de un ADMIN existente. Comprueba:

- Persistencia y consulta de una donación recibida y una entregada.
- Asociación de dos documentos con autores y referencias independientes.
- Bloqueos de reasociación, eliminación de asociación y cambios de metadatos.
- FK del país, aislamiento de la vista, transiciones, auditoría y archivado.

Resultado: `PASS`. Las escrituras de prueba y sus entradas de auditoría se
revirtieron con `ROLLBACK`. Después se aplicó la migración y se registró su
versión `20261105010000` en `supabase_migrations.schema_migrations`.
La comprobación posterior confirmó vista con `security_invoker=true`, bucket
privado y los conteos originales: una donación y cero respaldos.

Alcance: esta prueba remota valida PostgreSQL, permisos y referencias; no sube
bytes reales mediante la API de Storage ni representa un inicio de sesión HTTP.
El ciclo binario de reserva/carga/descarga se verifica con fetch simulado y
servidores HTTP locales en la suite del backend.

## Repetir las pruebas paso a paso

1. En otro entorno, aplicar la migración mediante el flujo habitual de Supabase.
   En `fge-dev` ya está aplicada; no ejecutarla nuevamente.
2. Ejecutar `supabase/checks/donaciones-certificados.sql` completo en SQL Editor
   con acceso administrativo. Debe devolver `resultado: PASS` y terminar en
   `ROLLBACK`. Requiere un ADMIN y una organización existentes.
3. Ejecutar la suite local:

```powershell
node --experimental-strip-types --test backend/services/organizations/tests/*.test.ts backend/gateway/tests/*.test.ts
node --experimental-strip-types --test frontend/tests/validaciones/donaciones.certificados.persistencia.test.mjs
```

4. Para una prueba manual del cliente, registrar una donación en cada sentido,
   reservar dos certificados para una de ellas y cargar cada archivo con su
   versión. Consultar la lista y descargar cada documento. Comprobar que los
   bytes coincidan y que consultar uno bajo otra donación no permita acceder.

La prueba PostgreSQL aislada carga la migración real y valida también la
compatibilidad histórica y el rechazo de lectura anónima. No sustituye la
validación remota descrita arriba.
