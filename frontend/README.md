# Frontend - Fundación Gestionar Esperanzas

Frontend de la aplicación web de la Fundación Gestionar Esperanzas (FGE).

## Tecnologías

- Astro
- TypeScript
- Node.js
- npm

## Estructura del proyecto

```text
frontend/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── layouts/
│   └── pages/
├── package.json
├── astro.config.mjs
└── tsconfig.json

Carpetas principales
src/pages/: páginas y rutas de la aplicación.
src/components/: componentes reutilizables.
src/layouts/: layouts reutilizables para las páginas.
src/assets/: recursos utilizados por la aplicación.
public/: archivos públicos y recursos estáticos.

Instalación
Desde la carpeta frontend/, ejecutar: npm install

Ejecución local
Desde la carpeta frontend/, ejecutar: npm run dev

La aplicación estará disponible en: http://localhost:4321/

## Consulta de organizaciones

La página `/organizaciones` consume la RPC `get_organizaciones_mock` de
Supabase y permite filtrar por `activo`, `inactivo` o `todos`.

Antes de iniciarla, copia `.env.example` como `.env` y completa los valores
públicos del proyecto:

```powershell
Copy-Item .env.example .env
```

Solo se usan `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. No se debe
agregar ni exponer una clave `service_role` en el frontend. La RPC debe estar
autorizada por el backend para el rol que usará la aplicación.

