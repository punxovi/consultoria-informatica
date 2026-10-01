# Migración del dominio Programas

El paso 4 separa el catálogo de Programas Institucionales del servidor Astro. El navegador consume `/api/v1/programs` en el API Gateway y este deriva las solicitudes al servicio `programs-service` del puerto `4103`.

## Responsabilidades migradas

- Listado de programas activos con sus líneas de acción.
- Consulta de detalle por identificador.
- Creación transaccional del programa y sus líneas mediante `guardar_programa_completo`.
- Actualización con control de versión para evitar sobrescrituras.
- Archivo lógico que conserva relaciones e historial.
- Validación de campos, tipos, límites, líneas duplicadas y cuerpos no permitidos.
- Propagación del token de Supabase para que las políticas RLS sigan decidiendo el acceso.

Las páginas, componentes y estilos de Astro se mantienen. El módulo de imágenes continúa temporalmente en el frontend porque pertenece al dominio transversal de archivos y almacenamiento, previsto para una etapa posterior. Las Astro Actions antiguas se conservan durante la transición como respaldo, pero las pantallas de Programas ya no las invocan.

## Rutas

| Método | Ruta pública | Operación |
| --- | --- | --- |
| `GET` | `/api/v1/programs` | Listar programas |
| `GET` | `/api/v1/programs/:id` | Consultar detalle |
| `POST` | `/api/v1/programs` | Crear programa y líneas |
| `PATCH` | `/api/v1/programs/:id` | Actualizar con versión opcional |
| `DELETE` | `/api/v1/programs/:id` | Archivar con versión obligatoria |

## Ejecución local

`npm run dev` inicia Frontend, Gateway, Auth, Organizaciones y Programas. El servicio también puede iniciarse por separado con `npm run dev:programs`.
