# Base de datos FGE/TDT

## Estado al 9 de septiembre de 2026

Siete migraciones versionadas para el proyecto de desarrollo `fge-dev`, con 26 tablas
 de aplicación y una tabla privada de auditoría.

| Migración | Contenido |
|---|---|
| `20260908002323_fge_estructura.sql` | Tablas, relaciones y restricciones de organizaciones, programas, planes, acciones y registros asociados. |
| `20260908002327_fge_auditoria_indices.sql` | Registro de cambios, fechas, autores e índices. |
| `20260908002329_fge_paises_storage.sql` | Chile, Argentina, Uruguay y almacenamiento privado `fge-archivos`. |
| `20260909000848_fge_catalogo_cotizaciones.sql` | Productos, solicitudes de cotización, detalles e imágenes de productos. |
| `20260909152638_fge_ajustes_despliegue.sql` | Ajustes de permisos técnicos y dos índices adicionales. |
| `20260909192500_fge_trigger_perfiles.sql` | Creación automática del perfil al registrar un usuario en Auth. |
| `20260914000000_fge_get_organizaciones_mock.sql` | RPC de demostración para filtrar organizaciones desde el frontend. |

La carpeta incluye configuración local, cuatro archivos de pruebas pgTAP y
`verificar-archivos.mjs` para comprobaciones estáticas.

## Datos iniciales de desarrollo (KAN-158)

`supabase/seed.sql` está habilitado en `config.toml` y se ejecuta después de
las migraciones al iniciar o reconstruir la base local. Incluye:

- Los roles básicos Administrador, Coordinador e Invitado.
- Una organización denominada `Organización temporal FGE (FICTICIA)`, sin
  datos personales reales y con valores claramente identificados como
  temporales.
- Los seis Programas Institucionales oficiales entregados por FGE en el
  documento `PROGRAMAS FGE.docx` del 20 de agosto de 2026.

Los programas son datos reales de la fundación; solo su asociación con la
organización ficticia es transitoria. Sus UUID son estables para facilitar las
pruebas y su reasignación futura. Cuando FGE entregue el padrón oficial, se
deben crear las organizaciones reales, actualizar `programas.id_organizacion`
y eliminar la organización ficticia una vez que no tenga registros asociados.

No se deben crear planes, acciones ni otros datos definitivos dependientes de
la organización ficticia. Las pruebas automatizadas usan datos separados y
revierten sus cambios al terminar.

## Estado de seguridad

Todas las tablas tienen RLS activado. Los accesos de `anon` y `authenticated`
están cerrados y el almacenamiento de archivos es privado. La revisión remota
final solo informó RLS sin políticas de acceso.

Falta implementar y probar los permisos por rol, país y operación, el acceso
público al catálogo y la recepción de cotizaciones. La estructura actual no
habilita todavía el uso de la aplicación por sus usuarios.

## Preparación y prueba local

Requisitos: Node.js 20 o superior y Docker instalado y en ejecución.
Ejecutar desde la raíz del repositorio, donde está la carpeta `supabase`:

```powershell
npx.cmd --yes supabase@2.117.0 start
npx.cmd --yes supabase@2.117.0 test db --local
```

En una instalación nueva, el inicio aplica las siete migraciones y luego el
seed. Si ya existe una base local con migraciones anteriores, se puede
reconstruir con el siguiente comando, que **borra los datos locales**; usarlo
solo en una base de pruebas:

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

Se verificaron los comandos de la CLI con su ayuda. Se ejecutó PostgreSQL en
Docker y pgTAP: ambos archivos de pruebas terminaron en PASS, con 130 pruebas
sobre las cuatro migraciones originales. Las cinco migraciones se aplicaron en
la base remota de desarrollo, donde se verificaron estructura, accesos y
configuración mediante consultas. No se ejecutó pgTAP en remoto.
