# Permisos de consulta del rol Invitado

La migración `20261104110000_fge_scrum171_permisos_invitados.sql` aplica la matriz HU23 en RLS y entrega una proyección segura para las consultas de Organizaciones.

## Permitido

- Descripción institucional y Programas.
- Organizaciones: nombre, tipo, país, región, comuna, descripción general, público objetivo y beneficiarios.
- Planes: nombre, objetivo, estado y avance.
- Acciones: nombre, fechas y estado.
- Contenido multimedia que cuente con una ruta pública específica.
- Lectura del sitio público.

## Denegado

- Cualquier `POST`, `PATCH`, `PUT` o `DELETE`.
- Evidencias internas y archivos no publicables.
- Teléfono, correo, dirección y otros datos de contacto.
- Expedientes legales y documentos de identidad.
- Actas, asistentes, compromisos y responsables.
- Diagnósticos, donaciones, identidad de donantes y solicitudes de cotización.
- Auditoría, administración de usuarios y coberturas.

La revocación de la asignación `INVIT` y la expiración de la sesión son evaluadas por las funciones RLS en cada petición; no se confía en el ocultamiento de controles de la interfaz.
