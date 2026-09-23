# Base de datos FGE/TDT

## Estado de la rama `fix/relaciones-organizacion-programa-plan`

Doce archivos de migración para `fge-dev`, con 26 tablas de aplicación y una
tabla privada de auditoría. Las migraciones del nuevo modelo y de auditoría
están en esta rama, pero todavía no se aplicaron en `fge-dev`.

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

La carpeta incluye configuración local, seis archivos de pruebas pgTAP y
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

### Antes de desplegar en `fge-dev`

La consulta de solo lectura del 23-sep-2026 encontró 24 organizaciones (23
reales y la ficticia), seis programas, cero planes y cero acciones. Los seis
programas siguen ligados a la organización ficticia. El historial remoto tiene
siete versiones: las cinco migraciones iniciales, `20260916143000_fge_obtener_roles_usuario`
y `20260916221136_organizaciones_datos_parciales_20260916`. Esta última se
recuperó del stash local y el archivo se incorporó a esta rama. El repositorio
tiene doce archivos de migración; cinco versiones no aparecen en el historial
remoto: `20260909192500_fge_trigger_perfiles`,
`20260914000000_fge_get_organizaciones_mock`,
`20260922111500_fge_programas_storage_rls`,
`20260923014926_fge_relaciones_planes_programas` y
`20260923020339_fge_auditoria_escrituras_autorizadas`.

La ausencia en el historial no implica que todos esos cambios estén totalmente
ausentes del esquema. La función `get_organizaciones_mock(text)` existe, pero
en remoto permite ejecutar también a `authenticated`, mientras que el archivo
local restringe la ejecución a `anon`. En cambio, no se encontró el trigger de
Auth para crear perfiles ni las políticas de Programas/Storage de sus
migraciones. La relación nueva tampoco está aplicada: `programas` aún tiene
FK obligatoria a `organizaciones` y `planes` no tiene `id_organizacion`. La
función de auditoría remota sigue como `SECURITY INVOKER`, no con la corrección
incluida en la migración local. Por eso **no ejecutar `db push` a ciegas**:
primero comparar cada migración pendiente con el esquema, resolver las
diferencias de historial y permisos, respaldar los datos, repetir los conteos
y revisar el plan de aplicación. No usar `db reset --linked` ni
`--include-seed` sobre esa base; el seed es solo para desarrollo local.

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

## Estado de seguridad

Todas las tablas tienen RLS activado y el almacenamiento es privado. La
migración de Programas define políticas para consultar y administrar ese
catálogo y sus imágenes. El trigger privado audita las escrituras autorizadas
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

En una instalación nueva, el inicio aplica las doce migraciones y luego el
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
datos antes y después de aplicar la migración. Para ejecutar los seis archivos
pgTAP completos en local se necesita Docker.
