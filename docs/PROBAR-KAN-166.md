# Probar KAN-166 desde tu IDE

## 1. Abrir la rama nueva en tu repositorio habitual

Abre `C:\Proyecto CI\consultoria-informatica` en tu IDE. En la terminal PowerShell:

```powershell
cd "C:\Proyecto CI\consultoria-informatica"
git status
git fetch origin
git switch feature/KAN-166-formulario-programas-desde-cero
git pull --ff-only origin feature/KAN-166-formulario-programas-desde-cero
cd frontend
npm ci
npm run dev
```

Si `git status` muestra cambios pendientes, guárdalos antes de cambiar de rama. No borres tu rama anterior. Si Git impide cambiar de rama, conserva el mensaje para revisar el conflicto; no uses `reset --hard`.

La rama remota se publicó con el mismo nombre. `git switch` normalmente crea su seguimiento local automáticamente tras `git fetch` si aún no existe localmente.

Se requiere Node 22.12 o superior. Abre la dirección que muestre Astro, normalmente `http://localhost:4321`. Detén el servidor con Ctrl+C.

## 2. Verificar configuración y base de datos

Tu repositorio original ya tenía `frontend/.env`. Comprueba que define `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Si usas una copia nueva, crea `.env` a partir de `.env.example` y configura los valores del entorno de pruebas.

El frontend local se conecta al Supabase indicado en `.env`: los registros creados o archivados allí son reales para ese proyecto. Usa un programa de prueba identificable.

Antes de probar el guardado, el responsable de la base debe verificar las migraciones pendientes y aplicarlas en orden. Particularmente:

- `20260923151202_fge_programa_lineas_accion.sql`
- `20260924120000_fge_programas_referencias.sql`

También deben estar aplicadas las migraciones anteriores de relaciones, auditoría y permisos de Programas/Storage. No ejecutes de nuevo toda la estructura ni reinicies la base remota. Estas migraciones no se aplicaron desde esta tarea.

Consulta de solo lectura en el SQL Editor de Supabase para comprobar dos dependencias:

```sql
select to_regclass('public.programa_lineas_accion') as tabla_lineas;
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'programas'
  and column_name in ('referencias_ods', 'referencias_esg', 'archived_at');
```

La primera consulta debe devolver una tabla y la segunda, tres filas. Esto solo verifica estructura; no reemplaza la revisión del historial de migraciones ni de RLS.

## 3. Recorrido manual

1. Inicia sesión con ADMIN y entra a Programas Institucionales.
2. Crea `PRUEBA KAN-166`: intenta guardar vacío y comprueba los errores.
3. Completa los textos, agrega dos líneas con resultados distintos, referencias ODS/ESG y una imagen JPG/PNG/WebP. Guarda y revisa la confirmación.
4. Vuelve al catálogo, abre el detalle y comprueba los datos y la imagen. Recarga para confirmar que persisten.
5. Pulsa Editar programa, cambia un texto y un resultado, guarda y recarga.
6. En el detalle, pulsa Eliminar programa. Cancela primero y verifica que sigue activo. Después confirma: debe indicar que fue eliminado del catálogo. Vuelve al listado y comprueba que desapareció.
7. En Supabase, verifica que ese programa tiene `archived_at` informado y que sus líneas y archivos continúan existiendo. No se implementó un botón de restauración.
8. Con COORD, comprueba que no aparecen Crear, Editar ni Eliminar. La autorización efectiva depende de las políticas RLS del entorno.

## 4. Pruebas de código

Desde `frontend`:

```powershell
node --experimental-strip-types --test tests/actions/*.test.mjs
npm run build
```

Resultado verificado: 44 pruebas aprobadas y compilación correcta. El script de navegador `scripts/qa-programas.cjs` utiliza respuestas simuladas; la prueba manual anterior es la que confirma la integración real.

## Si falla

- No aparecen botones: comprueba el rol ADMIN de la cuenta.
- Error de base de datos al abrir o guardar: revisa las migraciones de líneas y referencias.
- El programa guarda pero la imagen falla: revisa el bucket privado `fge-archivos`, sus políticas y la tabla `archivos`; el formulario conserva el ID para reintentar sin volver a crear.
- Error de concurrencia al eliminar: recarga el detalle antes de repetir.
- Fallo intermedio al crear líneas: comprueba el catálogo antes de repetir; KAN-171 todavía guarda programa y líneas en operaciones separadas.
