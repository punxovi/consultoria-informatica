# SCRUM-115: integración de Gestión de Evidencias

La interfaz de la Acción usa el cliente HTTP, el Gateway y el servicio de Intervenciones para reservar metadatos, cargar bytes, consultar, descargar y cambiar consentimiento/publicación. Las operaciones de gestión conservan el JWT de la sesión y la clave pública de Supabase. RLS decide los permisos por Acción y país.

## Cambios de esta entrega

- «Ver evidencia» abre una ventana con el detalle, los mensajes de la operación y las acciones del archivo. El detalle no aparece automáticamente debajo del listado. Descargar y Cerrar permanecen visibles en pantallas pequeñas; Escape cierra la ventana y devuelve el foco al archivo elegido. «Completar carga» vuelve al formulario.
- Reintentos de carga sin duplicar reservas. Si Storage recibió el archivo pero falló la confirmación, se compara el contenido existente antes de confirmar. Otro archivo, aunque tenga el mismo tamaño, se rechaza.
- Se conserva la intención de publicar en el reintento inmediato. Después de recargar, una reserva pendiente se completa y puede publicarse explícitamente desde el detalle.
- Una respuesta de creación ilegible también exige consultar antes de volver a registrar.
- La interfaz muestra el enlace institucional únicamente cuando el archivo está disponible, publicado y con consentimiento afirmativo.
- Nueva ruta `GET /api/v1/public/evidences/:id/file`, encaminada a Intervenciones. Consulta `obtener_archivo_evidencia_publicada` antes y después de descargar. Solo entrega archivos activos, publicados, con consentimiento y con Acción, Plan y Organización activos. Devuelve 404 en los demás casos y 503 si falta configuración. No devuelve rutas internas, claves ni URLs firmadas; usa `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.

El enlace institucional es público: puede usarse en el sitio de la fundación. No implica haber construido ni desplegado ese sitio. Un retiro bloquea nuevas descargas; no puede borrar copias descargadas previamente.

## Preparación de Supabase (acción manual necesaria)

1. Abrir el proyecto de **desarrollo/pruebas** en Supabase. Deben estar aplicadas las migraciones de Evidencias, especialmente `20261013120000_fge_evidencias.sql`. No ejecutar un reset sobre el proyecto remoto.
2. En SQL Editor, ejecutar el contenido completo de `supabase/migrations/20261016120000_fge_publicacion_evidencias.sql` y después `supabase/migrations/20261016130000_fge_permisos_publicacion_evidencias.sql`. La primera crea la función y la segunda concede a `service_role` lectura de las columnas que necesita. Si la primera ya está aplicada, ejecutar solo la segunda. No cambian registros existentes ni hacen público el bucket. Si se usa CLI, revisar primero las migraciones pendientes antes de aplicar; no volver a ejecutar migraciones antiguas aplicadas manualmente.
3. Ejecutar `supabase/tests/database/017_publicacion_evidencias.test.sql`. Debe mostrar una sola tabla con `1..8` y ocho resultados `ok`, sin `not ok`. La octava comprobación valida los permisos sobre las columnas leídas por la función. La consulta reúne los resultados para que SQL Editor no muestre solamente la última comprobación. Todo se revierte al finalizar.
4. Registrar con el equipo la migración aplicada si se usa SQL Editor, para que el historial de CLI no intente repetirla después.

## Configuración del Backend

En **backend/.env**, conservar la URL y la clave pública existentes y añadir:

```dotenv
SUPABASE_PUBLICATION_KEY=CLAVE_PRIVADA_DEL_PROYECTO
```

Obtener una secret key (`sb_secret_...`) en Supabase → Settings → API Keys. También se admite la clave legacy `service_role`. Esta credencial solo la utiliza el repositorio de publicación, jamás las operaciones de gestión. No ponerla en `frontend/.env`, no usar el prefijo `PUBLIC_`, no enviarla por chat y no subirla a Git. Sin ella la descarga institucional permanece cerrada (503).

Referencia: [claves de Supabase y uso exclusivo en Backend](https://supabase.com/docs/guides/getting-started/api-keys).

El Frontend mantiene sus variables existentes `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` y `PUBLIC_API_BASE_URL=http://127.0.0.1:4000`. Reiniciar `npm.cmd run dev` después de cambiar variables. Si otro sitio consume la ruta con fetch desde el navegador, añadir su origen exacto a `FRONTEND_ORIGINS` del Backend.

Para comprobar la configuración sin crear registros: `node --experimental-strip-types scripts/verificar-publicacion-remota.mjs`. Verifica permisos de lectura sin recuperar filas, bloqueo del resolver para visitantes, bucket privado y la ruta Gateway → Backend → Supabase con un UUID inexistente. Todos los resultados deben indicar `ok: true`; un 404 en la última comprobación es el resultado esperado.

## Pruebas automáticas locales, sin cuenta real

Desde la raíz:

```powershell
node --experimental-strip-types --test frontend/tests/clientes/evidencias.test.mjs frontend/tests/clientes/evidencias.integracion.test.mjs frontend/tests/validaciones/evidencias.persistencia.test.mjs
npm.cmd run test --workspace=@fge/interventions-service
npm.cmd run test --workspace=@fge/api-gateway
npm.cmd run test:e2e:evidencias --workspace=frontend
npm.cmd run test:e2e:evidencias:integracion --workspace=frontend
npm.cmd run build:frontend
```

La última suite de navegador no intercepta solicitudes: ejecuta Astro, Gateway, servicios y repositorios reales. Auth/PostgREST/Storage se sustituyen por un adaptador de pruebas con PostgreSQL embebido (PGlite), migraciones y RLS reales; los bytes se conservan en memoria. No acredita una carga en Supabase real.

## Prueba completa contra Supabase real

Necesita los pasos anteriores, un usuario ADMIN/COORD con permiso y una **Acción de pruebas**. No se crean organizaciones ni se alteran acciones existentes.

1. Ejecutar `npm.cmd run dev`, iniciar sesión y abrir la Acción de pruebas. El último UUID en `/planes/ID_PLAN/acciones/ID_ACCION` es el ID de Acción.
2. En las herramientas del navegador → Network, seleccionar una petición a `/api/v1/actions/...` y copiar **solo el valor del JWT** de `Authorization: Bearer ...` (sin `Bearer`). No compartirlo por chat ni capturas.
3. Crear **backend/.env.qa**, ignorado por Git:

```dotenv
QA_ACCESS_TOKEN=JWT_VIGENTE_DEL_USUARIO
QA_EVIDENCIAS_ACTION_ID=UUID_DE_LA_ACCION_DE_PRUEBAS
```

4. Ejecutar desde la raíz:

```powershell
node scripts/probar-evidencias-supabase.mjs
```

El test levanta Frontend y servicios locales separados, abre el navegador, registra un PNG sintético, verifica el registro directamente en Supabase, recarga la interfaz, compara la descarga, verifica bloqueo sin sesión, publica por la ruta institucional y revoca el consentimiento. Al finalizar retira/archiva su propia evidencia QA y conserva el archivo privado y el historial. Imprime el UUID de esa evidencia, nunca el token. La ejecución crea datos QA reales y debe hacerse sobre la Acción elegida para pruebas.

La sesión debe estar vigente. Si expira, renovar `QA_ACCESS_TOKEN`. El comando oculta las credenciales en la salida del proceso y no se guardan trazas de Playwright. Si falla, conservar el mensaje de error y el UUID QA; comprobar si terminó el archivado antes de repetir. Al finalizar la validación, vaciar `QA_ACCESS_TOKEN` en el archivo local.

## Prueba manual del Frontend

En una Acción: adjuntar un archivo con origen y descripción; comprobar mensajes de carga y confirmación; recargar y pulsar «Ver evidencia». Debe abrirse una ventana con el detalle y el botón «Descargar archivo», sin desplazar manualmente la página para encontrarlo. Descargar, cerrar con «Cerrar» o Escape y comprobar que el foco vuelve al archivo elegido. Sin publicar, la descarga institucional debe responder 404 y la privada sin sesión 401. Publicar con consentimiento, abrir el enlace institucional sin sesión y comprobar el archivo. Retirar o revocar y verificar que ese mismo enlace vuelva a 404. Comprobar además rechazo de formato/tamaño, error de red y usuario sin gestión territorial.

## Estado de validación

Validado localmente el 16 de octubre de 2026:

- `npm.cmd run test:architecture`: aprobado.
- Clientes y validaciones del Frontend: 92 pruebas aprobadas.
- Interfaz de Evidencias: 12 pruebas de navegador aprobadas tras corregir la apertura del detalle, incluyendo selección entre dos archivos, cierre con teclado, errores en la ventana y visibilidad de los controles en escritorio y móvil.
- Flujo de navegador con Gateway, Backend y adaptador SQL/RLS: 1 prueba aprobada.
- Revisión final de publicación y reintentos: 9 pruebas aprobadas.
- Checks de Gateway e Intervenciones y `npm.cmd run build:frontend`: aprobados.

Supabase remoto: el usuario ejecutó `017_publicacion_evidencias.test.sql` en SQL Editor de `fge-dev` el 16 de octubre de 2026. La captura recibida muestra `1..7` y los siete resultados `ok`: función presente, permisos de ejecución correctos, bucket privado, registro inexistente sin archivo y RLS activo.

La comprobación posterior con la clave del Backend detectó `42501: permission denied for table evidencias`, además de falta de lectura en Acciones, Planes y Organizaciones. Se añadió la migración `20261016130000` con permisos por columna y una octava comprobación SQL. El adaptador local ya no concede lectura general sobre las tablas de `public`; la suite de integración verifica los permisos de las migraciones y el rechazo de columnas ajenas al resolver. Sus seis pruebas y el flujo de navegador volvieron a pasar.

El usuario aplicó la corrección remota. El 16 de octubre de 2026 se ejecutó `scripts/verificar-publicacion-remota.mjs` contra Supabase real: ocho comprobaciones aprobadas. El resolver respondió 200 al Backend y rechazó a `anon`; las cuatro consultas de permisos respondieron 200 sin recuperar registros; el bucket permaneció privado y Gateway → Backend → Supabase devolvió el 404 esperado para una evidencia inexistente. La octava aserción del archivo pgTAP aún no se ha ejecutado en SQL Editor; los permisos que comprueba sí se verificaron mediante estas llamadas reales.

**Flujo completo contra Supabase real aprobado el 16 de octubre de 2026.** Se ejecutó `node scripts/probar-evidencias-supabase.mjs` con la sesión y la Acción seleccionadas por el usuario. Playwright informó `1 passed (15.3s)`; el escenario de navegador duró 7.8 s. Se comprobó:

- Registro y carga desde el Frontend mediante el cliente HTTP, Gateway y Backend.
- Persistencia consultada directamente en Supabase, con Acción y autor correctos.
- Recarga de pantalla y descarga privada con el contenido original.
- Rechazo sin sesión y rechazo del acceso directo al bucket privado.
- Publicación institucional con consentimiento, descarga pública y `Cache-Control: no-store`.
- Revocación desde la interfaz y rechazo posterior de la misma URL pública.
- Una sola reserva y todas las solicitudes de Evidencias del navegador dirigidas al Gateway.

Acción QA: `bd853779-ff84-4a8a-b2e1-7025bb3b725b`. Evidencia QA archivada al finalizar: `a9569073-4b16-4d41-8927-f85e4b7d7124`. Se conservan su archivo privado y la auditoría; la evidencia no queda publicada ni en el listado activo. El token temporal se retira de `backend/.env.qa` al cerrar la validación.

El verificador histórico `supabase/verificar-archivos.mjs` sigue desactualizado (espera 32 migraciones); no es el verificador de esta entrega.
