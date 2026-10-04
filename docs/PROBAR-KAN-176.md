# KAN-176 — Integración de Programas

Rama: `feature/KAN-176-integrar-modulo`. Base del futuro PR: **`sprint-3`**.

Actualización del 3 de octubre de 2026: integración completada y ampliación de
las pruebas de carga, errores, inexistencia, permisos y reintentos de imagen.

## Qué se implementó

- `/programas` consume `listarProgramas` y muestra el catálogo activo real.
- `/programas/[id]` consume `obtenerProgramaPorId`, con sus líneas y resultados.
- `/programas/nuevo` guarda mediante `crearPrograma`.
- `/programas/[id]/editar` precarga datos y guarda mediante `actualizarPrograma`, incluyendo la versión consultada.
- ADMIN crea y edita; COORD consulta. La interfaz oculta controles sin permiso y el backend conserva RLS.
- Estados de carga, guardado, errores por campo/backend, sesión expirada, reintentos, catálogo vacío y programa inexistente.
- Gestión de líneas: agregar, modificar y retirar. Los programas nuevos requieren entre 1 y 50 pares completos, sin nombres repetidos.
- Los programas antiguos sin líneas estructuradas mantienen sus componentes y resultados generales y permiten editar sus campos sin inventar asociaciones entre esos textos.
- El orden de las líneas se guarda en `programa_lineas_accion.orden` y se conserva al consultar, editar, agregar y retirar líneas.
- Si el programa se guarda y falla la imagen, el formulario conserva ID y versión. Un reintento sin cambios de texto solo procesa la imagen; si se cambian los textos, se actualiza el mismo programa.
- Los errores al consultar o descargar la imagen se muestran con un botón de reintento. Una consulta fallida del programa oculta el detalle anterior y sus controles.
- Al recargar datos después de un conflicto se descartan también la imagen local y el retiro pendiente, previa confirmación del usuario.

Se reutilizaron los contratos y el registro de Actions de la referencia local
`origin/feature/KAN-171-Actions-Programas`, y la estructura básica del formulario
de `origin/feature/KAN-166-formulario-programas-desde-cero`.

El guardado secuencial de KAN-171 se sustituyó por una transacción mediante
`supabase/migrations/20260925120000_fge_guardar_programa_completo.sql`.
La función `guardar_programa_completo` conserva RLS, verifica la versión,
sincroniza líneas y textos generales y devuelve el programa completo. Si una
línea falla, PostgreSQL revierte también los cambios del programa.

La migración permite al Administrador leer las líneas archivadas de programas
activos, lo necesario para que PostgreSQL permita el archivado con estas
políticas. Las consultas de la aplicación siguen excluyendo líneas archivadas.

## Pruebas automatizadas

La migración adicional `20261003200000_fge_programas_orden_lineas.sql` incorpora
la posición de cada línea y actualiza la RPC. Conserva identidades, textos,
archivo lógico y el orden visible de los datos existentes. Debe aplicarse antes
de usar esta versión del repositorio, porque las lecturas incluyen `orden`.

Desde la raíz:

```powershell
git branch --show-current
cd frontend
npm ci
npm test
npm run build
npm run test:e2e
npm run test:e2e:imagenes
```

`npm test` ejecuta validaciones, handlers, transporte y pruebas SQL con PGlite
(PostgreSQL embebido). `npm run test:e2e` inicia una base temporal y Astro en
`127.0.0.1:4326`, con un adaptador HTTP de pruebas en `127.0.0.1:54329`, y ejecuta
Edge sin ventana en Windows. Los puertos deben estar libres. En otros sistemas,
instala Chromium con `npx playwright install chromium`; también se puede elegir
un navegador instalado mediante `BROWSER_CHANNEL`.

Las pruebas de navegador llaman las **Actions y repositorios reales** y ejecutan
las migraciones del módulo en PostgreSQL embebido. Auth y el transporte HTTP de
Supabase son simulados; algunos errores y retardos se inyectan deliberadamente.
No leen ni modifican el Supabase remoto, ni cambian `frontend/.env`.

`npm run test:e2e:programas` ejecuta solo los 13 casos de integración de Programas.
`npm run test:e2e:imagenes` ejecuta los casos de imágenes y guardados parciales;
las conversiones utilizan el navegador real y Storage se simula. El servidor de
pruebas se inicia y cierra mediante IPC, incluido Windows.

## Preparación para comprobar manualmente con Supabase

1. Usa una instancia con las migraciones anteriores del repositorio, incluida
   `20260923151202_fge_programa_lineas_accion.sql`.
2. Aplica las migraciones pendientes en orden, hasta
   `20261003200000_fge_programas_orden_lineas.sql`, incluidas las reparaciones
   de permisos y sincronización de la RPC de septiembre.
   En Supabase local, inicia los servicios con `npx supabase start` desde la raíz
   y aplica las pendientes con `npx supabase migration up --local`.
3. Configura `frontend/.env` con `PUBLIC_SUPABASE_URL` y
   `PUBLIC_SUPABASE_ANON_KEY` de esa misma instancia.
4. Inicia sesión con un usuario cuyo perfil tenga una asignación vigente
   `ADMIN` en `asignaciones_roles`. Para probar lectura, usa también un `COORD`.
5. Desde `frontend`, ejecuta `npm run dev` y abre `http://localhost:4321/programas`.

La migración **no se aplicó a una base remota** durante esta tarea. Para verificar
si la instancia configurada está preparada, ejecuta en su editor SQL:

```sql
select
  to_regclass('public.programa_lineas_accion') as tabla_lineas,
  to_regprocedure('public.guardar_programa_completo(jsonb,uuid,bigint)') as guardado;
```

Ambos valores deben ser distintos de `NULL`.

También debe existir `public.programa_lineas_accion.orden`:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'programa_lineas_accion'
  and column_name = 'orden';
```

## Comprobar los criterios de aceptación

| Criterio | Qué hacer | Qué debe ocurrir |
| --- | --- | --- |
| Listado desde backend | Abre `/programas`, revisa Network filtrando por `listarProgramas` y compara con la tabla `programas`. | Catálogo activo real y enlaces con UUID, sin IDs temporales `1` a `6`. |
| Detalle desde backend | Abre **Ver detalle**, recarga y revisa `obtenerProgramaPorId`. | Nombre, descripción, objetivos y líneas corresponden al UUID de la URL. |
| Crear mediante Action | Con ADMIN, pulsa **Crear programa**, completa los cuatro campos y dos pares de línea/resultado y guarda. | Una llamada `crearPrograma`, detalle con confirmación y programa presente en el catálogo al volver. |
| Editar mediante Action | Abre **Editar programa**, cambia nombre, objetivo o descripción y guarda. | `actualizarPrograma` recibe ID, versión y cambios; al recargar se mantienen los cambios. |
| Líneas correctas | Crea dos líneas; después quita la primera, cambia el resultado de la segunda y agrega otra. Guarda y recarga. | Pares correctos, sin duplicados ni líneas retiradas. La retirada queda archivada en la base. |
| Estados de carga | En DevTools, Network, activa **Slow 3G**. Recarga listado, detalle y edición; guarda un formulario completo. | Mensajes de carga/guardado. Campos y botones deshabilitados al guardar, sin dobles envíos. |
| Errores del backend | Bloquea `*/_actions/*` con Network request blocking; recarga, desbloquea y reintenta. Repite durante un guardado. Prueba también líneas vacías o duplicadas. | Error distinto del estado vacío. El formulario conserva lo escrito y muestra errores comprensibles y por campo cuando corresponde. |
| Programa inexistente | Abre `/programas/00000000-0000-4000-8000-000000000000`, `/programas/id-invalido` y la edición del UUID inexistente. | **Programa no encontrado**, enlace al catálogo y formulario deshabilitado en edición. El ID malformado responde HTTP 404. |
| Entorno local | Ejecuta las pruebas y completa crear → detalle → editar → recargar con la instancia configurada. | Pruebas y build correctos; cambios persistentes y sin errores de ejecución del navegador. |

Un UUID válido pero inexistente se determina mediante la Action desde el
navegador: la página inicial responde HTTP 200 y luego muestra el estado de
inexistencia. Una falla de conexión muestra un error de consulta diferente.

## Comprobaciones adicionales

- **Conflicto:** abre la edición en dos pestañas, guarda en la primera y luego
  en la segunda. La segunda avisa de otra sesión y conserva el borrador.
  **Volver a cargar datos** pide descartar cambios antes de cargar la versión actual.
- **Permisos:** con COORD, se ven catálogo y detalle, pero no crear/editar.
  La ruta directa `/programas/nuevo` muestra acceso no autorizado y las Actions
  rechazan también las escrituras forzadas con ese rol.
- **Programa antiguo:** edita solo su descripción. Sus componentes y resultados
  generales deben permanecer intactos.
- **Atomicidad:** `programas.transaccion.test.mjs` provoca un fallo de línea
  durante la escritura y comprueba que no quedan cambios parciales. También
  verifica permisos, auditoría, versión, archivado y validaciones SQL.

## Alcance de la verificación

Resultado del 3 de octubre de 2026: **102/102 pruebas unitarias y SQL,
23/23 pruebas de navegador de la suite principal (13 de Programas),
16/16 pruebas de imágenes y guardados parciales, build correcto y revisión
estática de migraciones correcta**.

La prueba SQL adicional verifica el orden después de crear, modificar, agregar
y retirar líneas. Otra aplica la migración sobre datos existentes, incluidos
registros archivados, y comprueba que conserva sus identidades y contenidos.

Pruebas: `npm test`, `npm run test:e2e`, `npm run test:e2e:imagenes` y
`npm run build`. La comprobación
estática de migraciones se ejecuta desde la raíz con
`node supabase/verificar-archivos.mjs`.

El chequeo global `npm run astro -- check --minimumSeverity error` detecta
**49 errores fuera de Programas**, presentes antes de estos cambios: Auth,
Organizaciones, Prueba, `Input.astro` y páginas de sesión/contraseña. La revisión
inicial detectaba 57. Se corrigieron los 8 del módulo de Programas; la comprobación
global de tipos todavía no está aprobada. El build sí compila.

No se ejecutó Supabase completo con Docker ni un inicio de sesión real contra
una instancia remota. La prueba manual anterior cubre esa última comprobación
una vez aplicada la migración.

## Tu pull request

Selecciona **base: `sprint-3`** y
**compare: `feature/KAN-176-integrar-modulo`**.

Título sugerido: `feat(KAN-176): integrar Programas con backend`.

Descripción sugerida:

> Integra listado, detalle, creación y edición de Programas con Astro Actions
> autenticadas. Guarda el programa y sus líneas en una transacción, conserva los
> textos anteriores y añade estados de carga, errores, inexistencia y conflictos
> de edición. Conserva el orden de las líneas y recupera guardados parciales de
> imagen sin duplicar programas. Requiere las migraciones hasta
> `20261003200000_fge_programas_orden_lineas.sql`.
>
> Validación: pruebas unitarias/SQL, navegador y build. El chequeo global de tipos
> mantiene errores previos fuera de Programas. Ver `docs/PROBAR-KAN-176.md`.
