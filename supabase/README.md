# Base de datos FGE/TDT

## Esquema y migraciones

Diecisiete archivos de migración, con 27 tablas de aplicación y una tabla privada
de auditoría. KAN-176 incorpora el guardado transaccional de Programas. La
instancia remota debe tener aplicadas las migraciones hasta la reparación de
acceso Data API; las verificaciones locales no sustituyen ese despliegue.

| Migración | Contenido |
|---|---|
| `20260908002323_fge_estructura.sql` | Tablas, relaciones y restricciones de organizaciones, programas, planes, acciones y registros asociados. |
| `20260908002327_fge_auditoria_indices.sql` | Registro de cambios, fechas, autores e índices. |
| `20260908002329_fge_paises_storage.sql` | Chile, Argentina, Uruguay y almacenamiento privado `fge-archivos`. |
| `20260909000848_fge_catalogo_cotizaciones.sql` | Productos, solicitudes de cotización, detalles e imágenes de productos. |
| `20260909152638_fge_ajustes_despliegue.sql` | Ajustes de permisos técnicos y dos índices adicionales. |
| `20260909192500_fge_trigger_perfiles.sql` | Creación automática del perfil al registrar un usuario en Auth. |
| `20260914000000_fge_get_organizaciones_mock.sql` | RPC de demostración para filtrar organizaciones desde el frontend. |
| `20260916143000_fge_obtener_roles_usuario.sql` | Consulta de roles para operaciones de organizaciones. |
| `20260916221136_organizaciones_datos_parciales_20260916.sql` | Permite guardar organizaciones con campos aún pendientes, manteniendo las validaciones cuando tienen valor. |
| `20260922111500_fge_programas_storage_rls.sql` | Permisos de Programas y sus imágenes en Storage. |
| `20260923014926_fge_relaciones_planes_programas.sql` | Programas institucionales independientes; cada plan relaciona organización y programa. |
| `20260923020339_fge_auditoria_escrituras_autorizadas.sql` | Audita escrituras autorizadas sin conceder inserción directa al historial privado. |
| `20260923151202_fge_programa_lineas_accion.sql` | Líneas propias por Programa, cada una con resultado esperado, auditoría y permisos. |
| `20260925120000_fge_guardar_programa_completo.sql` | Guardado atómico del Programa y sus líneas con RLS, control de versión y archivado. |
| `20260928220437_fge_reparar_acceso_api_programas.sql` | Restablece los privilegios Data API de Programas y líneas sin desactivar RLS. |
| `20260928222053_fge_sincronizar_guardado_programas.sql` | Actualiza la RPC ya desplegada para aceptar referencias ODS/ESG y el contrato vigente del formulario. |

La carpeta incluye configuración local, ocho archivos de pruebas pgTAP y
`verificar-archivos.mjs` para comprobaciones estáticas.

## Datos iniciales de desarrollo (KAN-158)

`supabase/seed.sql` está habilitado en `config.toml` y se ejecuta después de
las migraciones al iniciar o reconstruir la base local. Incluye:

- Los roles básicos Administrador, Coordinador e Invitado.
- Los seis Programas Institucionales oficiales entregados por FGE en el
  documento `PROGRAMAS FGE.docx` del 20 de agosto de 2026.

Los programas son un catálogo global de la fundación y no tienen
`id_organizacion`. Sus UUID permanecen estables para conservar imágenes y
futuras referencias. Cada Plan de Intervención requiere `id_organizacion` e
`id_programa`; las Acciones siguen vinculadas a un Plan. La organización
ficticia deja de crearse en instalaciones nuevas. En una base existente, la
nueva migración la elimina solo si su UUID y nombre coinciden y ninguna otra
referencia impide el borrado. Si existe un Plan bajo ella, la migración se
detiene para evitar una asignación inventada.

Las 23 organizaciones reales de `fge-dev` se cargaron por separado; el seed
no las reemplaza. Las pruebas automatizadas usan datos separados y revierten
sus cambios al terminar.

### Antes de desplegar la nueva migración en `fge-dev`

La consulta de solo lectura del 23-sep-2026 confirmó que las doce versiones
anteriores están en el historial remoto: hay seis Programas y cero Planes;
`programas` ya no contiene `id_organizacion` y `planes` sí lo contiene. Aún
no existe `programa_lineas_accion`. La nueva migración no modifica los textos
existentes de Programas ni carga líneas inventadas: la documentación de FGE
enumera componentes y resultados globales, pero no asigna un resultado a cada
componente. Hay que confirmar esos pares antes de cargar los seis programas.

Antes de aplicar la migración, revisar el historial y hacer respaldo. No usar
`db reset --linked` ni `--include-seed` sobre `fge-dev`; el seed es solo para
desarrollo local.

## Operaciones de organizaciones (KAN-159)

El repositorio `frontend/src/lib/server/organizaciones.ts` implementa consulta,
consulta por ID, registro y modificación mediante `supabase-js`. Cada lectura
incluye el país relacionado, y las actualizaciones admiten una versión esperada
para detectar escrituras concurrentes.

La prueba `tests/database/005_operaciones_organizaciones.test.sql` verifica el
CRUD directamente sobre PostgreSQL, la relación con `paises`, el incremento de
versión y las restricciones principales. Las operaciones reciben un cliente
Supabase creado por la capa de servidor y respetan sus permisos/RLS; no se
añadieron políticas ni funciones privilegiadas dentro de esta tarea.

## Operaciones de Programas Institucionales (KAN-172)

La integración KAN-176 está descrita en
[PROBAR-KAN-176](../docs/PROBAR-KAN-176.md). Las Actions de lectura usan estos
repositorios; creación y edición usan `programas-completos.ts` y la RPC
`guardar_programa_completo`, que coordina líneas y textos generales en una sola
transacción. Sustituye la coordinación pendiente mencionada en los antecedentes
de KAN-172/KAN-173 que siguen a continuación.

`frontend/src/lib/server/programas.ts` implementa listado, consulta por ID,
registro y modificación de Programas globales, sin `id_organizacion` ni filtro
territorial. Excluye registros archivados y admite una versión esperada para
evitar sobreescrituras concurrentes. Usa el cliente Supabase de la sesión:
lectura según roles existentes y escritura limitada al Administrador por RLS.

La tabla todavía exige `componentes_linea_accion` y `resultados_esperados`
como textos legados. El repositorio los recibe sin alterar su significado;
KAN-171 deberá coordinar el contrato Zod de líneas individuales con esos
campos y con la tabla de KAN-173 antes de exponer el formulario de creación.
No se modifica el esquema ni se duplican datos en esta tarea. La prueba
`008_operaciones_programas.test.sql` comprueba las cuatro operaciones, las
restricciones, la relación con Planes, RLS y auditoría en Supabase local.

## Líneas de acción de Programas (KAN-173)

La tabla `programa_lineas_accion` contiene una fila por línea y su resultado
esperado, con FK a `programas`, unicidad del nombre activo dentro de cada
Programa, límites de 500/2000 caracteres, auditoría y versión para concurrencia.
Un Administrador puede consultar, crear y modificar; Coordinador e Invitado
pueden consultar. Usuarios sin rol y sesiones anónimas no tienen acceso.

`frontend/src/lib/server/programa-lineas-accion.ts` expone
`listarLineasAccionPrograma`, `crearLineaAccionPrograma` y
`actualizarLineaAccionPrograma` para las futuras Actions de KAN-171. Recibe
un cliente Supabase de la sesión, sin clave privilegiada. La prueba
`007_programa_lineas_accion.test.sql` verifica relaciones, restricciones,
lectura/escritura por rol y auditoría. Los campos legados
`componentes_linea_accion` y `resultados_esperados` permanecen por
compatibilidad; las Actions de Programas deben coordinar ambas representaciones
hasta que el equipo confirme la migración de sus contenidos. Los programas
preexistentes pueden tener cero filas estructuradas temporalmente; el schema
Zod de creación exige al menos una línea nueva. Jira KAN-173 cita RF72, pero
el requisito vigente para el resultado por línea es RF70; RF72 se refiere a
mostrar Organización y Programa en las vistas de Planes.

## Estado de seguridad

Todas las tablas tienen RLS activado y el almacenamiento es privado. La
migración de Programas define políticas para consultar y administrar ese
catálogo y sus imágenes. KAN-173 agrega permisos equivalentes para las líneas
de acción. El trigger privado audita las escrituras autorizadas
sin conceder INSERT directo al historial. Planes continúa sin acceso directo para clientes:
esta corrección de relaciones no habilita por sí sola su CRUD.

Falta implementar y probar los permisos por rol, país y operación, el acceso
público al catálogo y la recepción de cotizaciones. La estructura actual no
habilita todavía el uso de la aplicación por sus usuarios.

## Preparación y prueba local

Requisitos: Node.js 22.12 o superior y Docker instalado y en ejecución.
Ejecutar desde la raíz del repositorio, donde está la carpeta `supabase`:

```powershell
npx.cmd --yes supabase@2.117.0 start
npx.cmd --yes supabase@2.117.0 test db --local
```

En una instalación nueva, el inicio aplica las diecisiete migraciones y luego el
seed. Si ya existe una base local con migraciones anteriores, se puede
reconstruir con el siguiente comando, que **borra los datos locales**; usarlo
solo en una base de pruebas desechable, nunca en `fge-dev`:

```powershell
npx.cmd --yes supabase@2.117.0 db reset --local --no-seed
npx.cmd --yes supabase@2.117.0 test db --local
```

Studio local: http://127.0.0.1:54323.
Las pruebas usan datos ficticios y revierten sus cambios al terminar.
`config.toml` ya está incluido; no es necesario ejecutar `init`.
Analytics está desactivado en la configuración local.

Comprobación estática, sin iniciar la base:

```powershell
node supabase/verificar-archivos.mjs
```

Para detener los servicios locales conservando los datos:

```powershell
npx.cmd --yes supabase@2.117.0 stop
```

## Configuración pendiente

- Definir e implementar roles, permisos por país y coberturas temporales.
- Configurar Auth, perfiles, primer administrador y URLs de retorno.
- Implementar las operaciones autorizadas de escritura con auditoría.
- Habilitar el catálogo público y la recepción segura de cotizaciones.
- Configurar permisos, límites y validación de archivos en Storage.
- Configurar el envío de correos y las variables de entorno de la aplicación.
- Verificar estos flujos con usuarios de distintos roles antes de habilitarlos.
- Definir respaldos, recuperación y responsables de mantenimiento.

## Fuentes y verificación

Documentación técnica consultada:

- [https://supabase.com/docs/guides/local-development/database-migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [https://supabase.com/docs/guides/storage/schema/design](https://supabase.com/docs/guides/storage/schema/design)
- [https://supabase.com/changelog](https://supabase.com/changelog)

La revisión estática no sustituye las pruebas pgTAP ni una comprobación de
datos antes y después de aplicar la migración. Para ejecutar los ocho archivos
pgTAP completos en local se necesita Docker.
