# Frontend - Fundación Gestionar Esperanzas

Frontend de la aplicación web de la Fundación Gestionar Esperanzas (FGE).

## Tecnologías

- Astro
- Astro Actions
- TypeScript
- Node.js
- npm
- Zod

## Estructura del proyecto

```text
frontend/
├── public/
├── src/
│   ├── assets/
│   ├── actions/
│   ├── components/
│   ├── layouts/
│   └── pages/
├── package.json
├── astro.config.mjs
└── tsconfig.json

Carpetas principales
src/pages/: páginas y rutas de la aplicación.
src/actions/: Actions del servidor, esquemas Zod y lógica asociada.
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

## Operaciones de organizaciones (KAN-159)

`src/lib/server/organizaciones.ts` contiene las operaciones reutilizables para:

- listar organizaciones activas, opcionalmente por país;
- consultar una organización por UUID;
- crear una organización;
- actualizar una organización, con control de versión opcional.

Todas devuelven también el país relacionado y reciben un `SupabaseClient` ya
configurado. Esto permite que las futuras Astro Actions inyecten el cliente de
la sesión sin duplicar consultas ni exponer secretos. La capa no reemplaza las
validaciones de entrada: PostgreSQL mantiene las restricciones definitivas y
los esquemas Zod se incorporarán en la tarea correspondiente.

Los errores se exponen como `ErrorOperacionOrganizacion`, con códigos estables
para registro inexistente, país inexistente, restricción, concurrencia, permiso
y fallo general. El cliente recibido sigue sujeto a los privilegios y políticas
RLS vigentes; esta tarea no abre accesos por sí sola.

Pruebas del backend
Desde la carpeta frontend/, ejecutar: npm test

Compilación y ejecución del servidor standalone
Desde la carpeta frontend/, ejecutar: npm run build y luego npm start

La arquitectura y el contrato de las Actions están documentados en
../backend/README.md.

## Integración de Programas (KAN-176)

Las rutas `/programas`, `/programas/[id]`, `/programas/nuevo` y
`/programas/[id]/editar` consumen Actions autenticadas. La creación y edición
requieren aplicar `20260925120000_fge_guardar_programa_completo.sql` en la
instancia Supabase configurada. La guía [PROBAR-KAN-176](../docs/PROBAR-KAN-176.md)
detalla lo implementado, la preparación y cómo comprobar cada criterio.

`npm test` incluye PostgreSQL embebido; `npm run test:e2e` ejecuta los flujos en
navegador con base temporal y Actions reales, sin modificar el Supabase remoto.

