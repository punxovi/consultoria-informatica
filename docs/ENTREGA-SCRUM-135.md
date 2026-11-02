# SCRUM-135 — Integración y validación del flujo de Donaciones

La integración conecta la ficha de Organización con el cliente HTTP, API Gateway,
servicio de Organizaciones, RLS de Supabase y el bucket privado de respaldos.
No hay datos ficticios incorporados al flujo productivo.

## Cambios incluidos

- La ficha permite registrar, listar, abrir el detalle y **editar** los campos
  permitidos de una donación. País y Organización receptora permanecen de solo
  lectura; cada edición usa la versión actual para evitar sobreescrituras.
- El avance de estado continúa limitado a `Comprometida → Recibida → Entregada
  → Cerrada` por Backend y base de datos.
- Un respaldo que falle puede reintentarse sobre la misma reserva. El Backend
  restaura esa reserva a `reservado` antes de subir el binario, manteniendo la
  ruta privada y la auditoría.
- La migración `20261025120000_fge_donaciones_bucket_archivos.sql` eleva el
  límite de `fge-archivos` a 50 MiB y permite PDF, JPEG, PNG y WebP. Las
  políticas por prefijo y la restricción WebP/600 KiB de imágenes de Programas
  se mantienen.

## Paso manual obligatorio: Supabase

La migración nueva debe aplicarse en el proyecto de Supabase que usa la
aplicación **antes de probar respaldos PDF o mayores a 600 KiB**. No hay que
editar ni volver a ejecutar migraciones anteriores.

Con Supabase CLI y el proyecto ya vinculado, desde la raíz del repositorio:

```powershell
supabase db push --linked
```

Ese comando aplica todas las migraciones que estén pendientes, por lo que debe
usarse solo si el historial remoto corresponde a este repositorio. Como
alternativa, en SQL Editor ejecuta exclusivamente el contenido de
`supabase/migrations/20261025120000_fge_donaciones_bucket_archivos.sql`.

Verifica el resultado con esta consulta de solo lectura:

```sql
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'fge-archivos';
```

Debe devolver `public = false`, `file_size_limit = 52428800`, e incluir
`application/pdf`, `image/jpeg`, `image/png` e `image/webp`.

Para validar la base local completa (requiere Supabase CLI y Docker operativo):

```powershell
supabase start
supabase test db --local
```

Incluye `024_scrum135_donaciones_bucket.test.sql`, que comprueba el bucket sin
alterar datos al terminar.

## Backend y Frontend

No requieren configuración nueva. Si aún no existe configuración local, crea
`backend/.env` a partir de `backend/.env.example` y asegúrate de definir
`SUPABASE_URL` y `SUPABASE_ANON_KEY`; en `frontend/.env`, define
`PUBLIC_API_BASE_URL=http://127.0.0.1:4000` junto con las variables públicas
de Supabase ya usadas por el inicio de sesión.

Luego ejecuta:

```powershell
npm.cmd install
npm.cmd run dev
```

La interfaz queda en `http://127.0.0.1:4321` y el Gateway en
`http://127.0.0.1:4000`.

## Demostración manual sugerida

1. Inicia sesión con `ADMIN`, o con `COORD` que tenga alcance global, del país
   de la Organización o una cobertura temporal vigente.
2. Abre una Organización, pestaña **Seguimiento → Donaciones y recursos** y
   registra una donación. Selecciona opcionalmente un Programa; país y
   Organización se obtienen de la ficha y no se pueden cambiar.
3. Abre su detalle, pulsa **Editar datos**, cambia por ejemplo la descripción
   y guarda. Pulsa **Recargar** para comprobar la persistencia.
4. Usa **Avanzar a …** de forma secuencial. Un salto o retroceso debe mostrar
   el error de negocio y no guardar cambios.
5. Adjunta un PDF, JPG, PNG o WebP de hasta 50 MiB; comprueba que figure como
   disponible, descárgalo y vuelve a abrir el detalle. Si se interrumpe una
   carga, usa **Reintentar carga** con el mismo archivo.
6. Repite un intento con un usuario Invitado, sin rol o sin cobertura: el
   Backend y RLS deben responder sin permitir la operación.

## Verificaciones ejecutadas

- `npm.cmd run test --workspace=@fge/organizations-service` — 100 pruebas OK.
- Pruebas específicas de Donaciones del Frontend — 27 pruebas OK.
- `npx.cmd playwright test --config playwright.organizaciones-visual.config.mjs --grep donaciones` — 2 pruebas OK.
- `node supabase/verificar-archivos.mjs` — 51 migraciones y revisión estática OK.
- `npm.cmd run build:frontend` y comprobación de sintaxis del servicio de
  Organizaciones — OK.

`astro check` sigue reportando siete errores preexistentes en los módulos de
Compromisos y Expediente Legal; ninguno corresponde a Donaciones ni a archivos
modificados en esta entrega.
