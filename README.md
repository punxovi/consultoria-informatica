# Fundación Gestionar Esperanzas

Plataforma de gestión de la Fundación Gestionar Esperanzas para acompañar a
organizaciones comunitarias de Argentina, Chile y Uruguay: organizaciones,
programas, planes de intervención, acciones, indicadores, evidencias, actas,
compromisos, donaciones, catálogo público con solicitudes de cotización,
reportes en PDF y auditoría.

## Arquitectura

| Carpeta | Contenido |
| --- | --- |
| `frontend/` | Aplicación web en Astro, TypeScript y Tailwind CSS. |
| `backend/gateway` | API Gateway: única entrada pública `/api/v1` (puerto 4000). |
| `backend/services/` | Servicios `auth`, `organizations`, `programs`, `interventions` e `insights`. |
| `backend/shared/` | Contratos, errores, configuración y utilidades compartidas. |
| `supabase/` | Migraciones, datos iniciales (`seed.sql`) y pruebas de base de datos. |
| `docs/` | Contratos de API, diseño de base de datos y decisiones de arquitectura. |

El navegador solo se comunica con el API Gateway, que reenvía cada ruta al
servicio correspondiente. Los datos, la autenticación y los archivos están en
Supabase, y los permisos por rol se aplican con políticas RLS de PostgreSQL.
Más detalle en [`backend/README.md`](backend/README.md) y en
[`docs/architecture/ADR-001-separacion-frontend-backend.md`](docs/architecture/ADR-001-separacion-frontend-backend.md).

## Requisitos

- Node.js 22.12 o posterior.
- Supabase CLI y Docker, solo para usar la base de datos local.

## Instalación y ejecución

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm run dev
```

Completa en `backend/.env` los valores de Supabase (`SUPABASE_URL`,
`SUPABASE_ANON_KEY` y, para crear coordinadores, `SUPABASE_SERVICE_ROLE_KEY`).

| Servicio | Dirección |
| --- | --- |
| Aplicación web | http://127.0.0.1:4321 |
| API Gateway | http://127.0.0.1:4000 |

Si `SUPABASE_URL` apunta a `http://127.0.0.1:54321`, `npm run dev` inicia
Supabase local y aplica las migraciones pendientes.

## Cuentas de prueba (entorno local)

Se crean al cargar `supabase/seed.sql` en la base de datos local. No existen en
el proyecto de Supabase en línea.

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | admin@prueba.com | Admin2026! |
| Coordinador (Chile) | coordinadorch@prueba.com | Chile2026! |
| Coordinador (Argentina) | coordinadorar@prueba.com | Argentina2026! |
| Coordinador (Uruguay) | coordinadorur@prueba.com | Uruguay026! |

## Roles

- **Administrador:** gestión completa, incluyendo países, coordinadores,
  coberturas y auditoría.
- **Coordinador:** consulta todo; crea y edita solo en su país o en países con
  cobertura vigente.
- **Invitado:** solo lectura del contenido de negocio.

## Pruebas

```powershell
npm run test:architecture
npm run test --workspace=frontend
npm run build:frontend
```