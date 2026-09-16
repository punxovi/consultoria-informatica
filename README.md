# Fundación Gestionar Esperanzas

Repositorio de la plataforma de gestión de la Fundación Gestionar Esperanzas.

## Estructura

- `frontend/`: aplicación Astro, componentes y Astro Actions.
- `backend/`: documentación de la arquitectura backend y sus contratos.
- `supabase/`: configuración, migraciones, datos iniciales y pruebas de base de
  datos.

La lógica backend basada en Astro Actions vive en `frontend/src/actions`, que
es la ubicación requerida por Astro para descubrir y publicar las Actions.
Consulta `backend/README.md` para conocer la organización, validaciones y
formato de errores.
