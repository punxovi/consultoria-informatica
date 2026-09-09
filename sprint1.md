# Sprint 1 - Documentación

## Feature: Estructura Inicial del Frontend (`feature/frontend-structure`)

En esta rama se implementó la estructura base para el frontend del proyecto utilizando el framework Astro. 

### Cambios principales:
- **Inicialización del proyecto:** Se configuró un nuevo proyecto de Astro con sus dependencias básicas (`package.json`, `package-lock.json`).
- **Configuración del framework:** Se añadieron los archivos de configuración para Astro y TypeScript (`astro.config.mjs`, `tsconfig.json`).
- **Estructura de directorios base:**
  - `src/pages/`: Contiene la página principal inicial (`index.astro`).
  - `src/layouts/`: Contiene el layout principal de la aplicación (`Layout.astro`).
  - `src/components/` y `src/assets/`: Directorios preparados para componentes de UI y recursos estáticos respectivamente.
  - `public/`: Se incluyeron los favicons base (`favicon.ico`, `favicon.svg`).
- **Configuración del editor:** Se agregaron configuraciones recomendadas para Visual Studio Code (`.vscode/extensions.json`, `.vscode/launch.json`) para facilitar el desarrollo en el equipo.
- **Gitignore frontend:** Se incluyó un archivo `.gitignore` específico para el frontend para ignorar la carpeta de `node_modules` y directorios de construcción.

## Feature: Esquema de Base de Datos (`feature/esquema-base-datos`)

En esta rama se implementó el modelo de datos inicial del proyecto utilizando Supabase, sentando las bases de seguridad, auditoría y estructura de tablas.

### Cambios principales:
- **Modelo de datos y migraciones (`supabase/migrations/`):** 
  - Se crearon cinco migraciones SQL correlativas (`fge_estructura`, `fge_auditoria_indices`, `fge_paises_storage`, `fge_catalogo_cotizaciones`, `fge_ajustes_despliegue`).
  - Creación de **26 tablas** en el esquema `public`, abarcando la estructura base, catálogo de productos, y cotizaciones (`solicitudes_cotizacion`, `solicitud_cotizacion_detalles`, etc.).
  - **Seguridad por defecto:** Todas las tablas tienen *Row Level Security (RLS)* habilitada y el acceso público revocado por defecto para los roles `anon` y `authenticated`.
- **Auditoría e Integridad:**
  - Se implementó un esquema de auditoría mediante triggers que registran todas las operaciones (`INSERT`, `UPDATE`, `DELETE`) en una tabla interna de historial de cambios.
  - Se utiliza el tipo de dato UUID para las llaves primarias y foráneas, asegurando compatibilidad estricta.
- **Almacenamiento (Storage):** 
  - Configuración del bucket `fge-archivos` (marcado como no público) para el manejo de archivos adjuntos y documentos.
- **Validaciones y Pruebas (`supabase/tests/database/`):** 
  - Se añadieron pruebas unitarias de base de datos utilizando **pgTAP** (`001_fge_base.test.sql`, `002_fge_cotizaciones.test.sql`), las cuales validan el acceso para distintos roles y prueban el comportamiento ante datos inválidos o acciones no permitidas.
- **Scripts de validación estática:** 
  - Se introdujo `supabase/verificar-archivos.mjs` para verificar mediante expresiones regulares la correcta definición de los esquemas, balance de paréntesis, restricciones RLS y configuración general de PostgreSQL antes de aplicar las migraciones.
- **Configuración del entorno local:** 
  - Documentación detallada en `supabase/README.md` y configuración local del proyecto de Supabase mediante `supabase/config.toml`.

## Feature: Componentes de UI Base (`feature/UI-componentes-base`)

En esta rama se establecieron los componentes visuales básicos y el prototipo inicial del frontend usando Astro y Tailwind CSS. Tras su verificación se puede concluir que la implementación es sólida, usa los lineamientos correctos y **se encuentra lista para aprobarse manualmente**.

### Detalles Técnicos:
- **Diseño y Estilos (`src/styles/global.css`):** 
  - Se integró Tailwind CSS v4 para el manejo centralizado de los estilos. 
  - Las variables de diseño (colores y estados) se integran nativamente con `@theme`. Los colores actuales son un *placeholder* configurado para fácil reemplazo tan pronto se entregue el manual de marca oficial (RNF12).
- **Componentes Básicos (`src/components/ui/`):** 
  - Se implementaron los componentes encapsulados `Badge.astro`, `Button.astro`, `Card.astro`, `Input.astro` y `Select.astro`.
  - **Accesibilidad:** Los componentes interactivos, como botones (`Button.astro`) e inputs, establecen explícitamente una altura mínima de 48px (`min-h-[48px]`), respetando el área táctil mínima (RNF11).
  - **Estados e Indicadores Visuales:** El componente `Badge.astro` integra de manera nativa los estados definidos por el requisito Semáforo (RNF13) para los casos de éxito, advertencia, peligro, etc.
- **Estructura y Layout (`Layout.astro`, `Header.astro`, `Sidebar.astro`):** 
  - Se construyó el andamiaje del layout principal adaptado a dispositivos móviles y escritorio. 
  - El menú de navegación lateral (`Sidebar.astro`) está optimizado en móviles escondiéndose por defecto (`-translate-x-full`) pero manteniéndose persistente y anclado (`md:static md:translate-x-0`) en resoluciones de escritorio (RNF9/RNF10).
- **Prototipado Visual (`index.astro`):** 
  - Se transformó la página inicial en un catálogo/prueba interactiva de todos estos componentes para comprobar que coexistan armoniosamente dentro del contenedor general.
