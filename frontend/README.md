# Frontend - Fundación Gestionar Esperanzas

Aplicación web Astro de la Fundación Gestionar Esperanzas. El frontend conserva
las rutas y el diseño del producto y consume el backend mediante el API Gateway
`/api/v1`.

## Tecnologías

- Astro y TypeScript.
- Tailwind CSS.
- Zod para validación inmediata de formularios.
- Supabase JS para conservar la sesión del navegador y el módulo de archivos.

## Estructura

```text
src/
├── components/       Componentes visuales reutilizables
├── layouts/          Estructuras de página y protección de sesión
├── lib/
│   ├── api/          Transporte HTTP común hacia el Gateway
│   ├── modelos/      Contratos consumidos por las vistas
│   ├── validaciones/ Schemas Zod de los formularios
│   └── <dominio>/    Clientes de Auth, Organizaciones, Programas, Planes, etc.
├── pages/            Rutas visuales Astro
└── styles/           Estilos globales
```

No existe un registro `src/actions`: las operaciones de negocio y los
repositorios Supabase están en los microservicios de `backend/`.

## Configuración y ejecución

`frontend/.env` debe contener la URL pública de Supabase, su clave `anon` y:

```env
PUBLIC_API_BASE_URL=http://127.0.0.1:4000
```

Desde la raíz del repositorio:

```powershell
npm.cmd run dev
```

La aplicación estará disponible en `http://127.0.0.1:4321`.

## Pruebas

```powershell
npm.cmd run test --workspace=frontend
npm.cmd run build:frontend
npm.cmd exec --workspace=frontend astro check
```

Las pruebas del frontend cubren sus validaciones y clientes. Los casos de uso,
permisos, repositorios y respuestas HTTP se prueban en el servicio responsable.
