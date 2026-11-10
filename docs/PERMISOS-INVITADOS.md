# Permisos de consulta del rol Invitado

La migracion `20261110100000_fge_invitado_consulta_global_solo_lectura.sql`
amplia el rol `INVIT` a la consulta global de todo el contenido funcional
activo, sin restriccion por pais y sin operaciones de modificacion. Las tablas
de seguridad, administracion, auditoria y notificaciones siguen reservadas.

## Permitido

- Todo el contenido de negocio activo: paises, organizaciones y sus datos,
  programas, planes, acciones, actas, compromisos, diagnosticos, indicadores,
  donaciones, expedientes, evidencias, catalogo y solicitudes de cotizacion.
- Todos los paises, sin restriccion por alcance territorial.
- Archivos almacenados en los buckets funcionales.

## Denegado

- Cualquier `POST`, `PATCH`, `PUT` o `DELETE` sobre el contenido.
- Roles, permisos, perfiles, asignaciones, coberturas, auditoria,
  notificaciones y administracion de cuentas.

La revocacion de la asignacion `INVIT` y la expiracion de la sesion son
evaluadas por las funciones RLS en cada peticion; no se confia en el
ocultamiento de controles de la interfaz.
