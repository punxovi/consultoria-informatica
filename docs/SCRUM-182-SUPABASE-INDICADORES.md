# SCRUM-182: configuración de Indicadores y Resultados

Base: `origin/sprint-9`, commit `5517a92`. Rama: `feature/SCRUM-182-configuracion-supabase-indicadores-resultados`.

## Causas identificadas y corrección

El mensaje «Configura Supabase en el Backend» se originaba en el repositorio de
Indicadores cuando faltaban las variables privadas en el proceso. A diferencia
del repositorio de Acciones, no admitía `PUBLIC_SUPABASE_URL` ni
`PUBLIC_SUPABASE_ANON_KEY`. Esto permitía consultar una Acción y fallar al consultar
sus indicadores con el mismo entorno. Ambos repositorios utilizan ahora el mismo
lector, que prioriza las variables del Backend y normaliza espacios y valores vacíos.

Además, el punto de entrada de Intervenciones no cargaba `backend/.env` al iniciar
el workspace por separado. Dependía de que se ejecutara el lanzador general. Ahora
lo carga mediante una ruta relativa al módulo, independientemente del directorio
actual, y conserva las variables ya suministradas al proceso.

Se encontró otro fallo al preparar la integración: `supabase/seed.sql` utilizaba
`ON CONFLICT(nombre)` sin existir una restricción única sobre ese campo. Se
reemplazó por una actualización e inserción limitada al catálogo (`id_accion IS
NULL`). La carga repetida conserva los identificadores y no modifica indicadores
asociados a Acciones. La base histórica de pruebas carga únicamente los seeds
correspondientes a sus migraciones; los de Indicadores se verifican por separado.

## Configuración e inicio

En `backend/.env`, definir `SUPABASE_URL` y `SUPABASE_ANON_KEY` con la URL del
proyecto y su clave pública anon/publishable. Deben coincidir con el proyecto del
Frontend. Este módulo conserva el JWT del usuario en cada operación para aplicar
RLS; no necesita `service_role` ni una clave de publicación de archivos.

Desde la raíz:

```powershell
npm.cmd run dev
# Alternativamente, ejecutar Intervenciones por separado:
npm.cmd run dev:interventions
```

Reiniciar los procesos después de cambiar variables de entorno. Esta corrección no requiere una nueva
migración ni volver a ejecutar migraciones ya aplicadas. No ejecutar el seed global
en un proyecto compartido para probar esta corrección: incluye otros módulos.

## Operaciones y errores

Se conservan los contratos existentes a través del Gateway:

| Método y ruta `/api/v1` | Operación |
| --- | --- |
| `GET /indicators/catalog` | Catálogo estandarizado |
| `GET /actions/:id/indicators` | Indicadores y resultados de una Acción |
| `POST /actions/:id/indicators` | Asociar indicadores y sus metas |
| `PATCH /indicators/:id` | Actualizar meta con versión esperada |
| `POST /results` | Registrar resultado y fecha de medición |
| `PATCH /results/:id` | Actualizar resultado con versión esperada |

La configuración ausente o con URL inválida devuelve `SERVICIO_NO_CONFIGURADO`
(503), sin exponer valores. Una clave rechazada por Supabase devuelve
`CREDENCIALES_SUPABASE_INVALIDAS` (503); un JWT vencido devuelve
`SESION_REQUERIDA` (401). Se distinguen desconexión (503), migración pendiente
(503), falta de permisos (403), registro inexistente (404), datos inválidos (400)
y conflicto de versión/asociación (409). La ausencia de tablas también se reconoce
como migración pendiente. No se ocultan errores devolviendo datos de demostración.

## Evidencia local

- 49 pruebas de Intervenciones aprobadas, incluyendo carga de entorno desde otro
  directorio, prioridad de variables, propagación del JWT y errores controlados.
- 19 pruebas de clientes, integración y RLS aprobadas con PostgreSQL embebido:
  catálogo, asociaciones, metas, resultado cero, actualización, recarga,
  concurrencia, permisos, registros inexistentes e inicialización repetible sin
  alterar asociaciones existentes. Auth y PostgREST de esta suite son adaptadores
  de prueba; no equivalen a una sesión real en Supabase.
- Comprobación de arquitectura y compilación del Frontend aprobadas.
- Prueba de navegador con Gateway, Backend y PostgreSQL local: 1 aprobada.
  Se abre la pestaña de Indicadores, se asocia con meta 20, se registra resultado
  cero, se actualizan meta a 30 y resultado a 25 y se comprueban tras recargar.
  La interfaz configurada no muestra el mensaje de configuración.
- Frontend `/login`: HTTP 200. Gateway `/health`: HTTP 200.
- Renovación ficticia a través del Gateway: HTTP 401 `SESION_INVALIDA`, confirmando
  conexión real de Auth con Supabase.
- Arranque independiente de Intervenciones sin variables Supabase heredadas:
  carga `backend/.env` y el catálogo con JWT ficticio devuelve HTTP 401
  `SESION_REQUERIDA`, en vez de un error de configuración.
- Los archivos locales de Backend y Frontend apuntan al mismo proyecto y la misma
  clave pública; la comparación no registra sus valores.
- Las consultas anónimas sin filas a `indicadores` y `resultados` reciben HTTP 401,
  código PostgreSQL `42501`: el servidor remoto aplica los permisos de acceso.
  Esto no acredita lectura o escritura autenticada.

El usuario solicitó continuar sin prueba autenticada real. Queda pendiente ejecutar
el recorrido con una sesión ADMIN/COORD en Supabase: consultar catálogo e indicadores,
asociar un indicador en una Acción de prueba, registrar y editar meta/resultado,
recargar y archivar los datos de prueba. No se modificaron registros remotos.
