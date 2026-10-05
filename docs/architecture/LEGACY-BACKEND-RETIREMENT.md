# Retiro del backend heredado

El paso 7 elimina el backend duplicado que se ejecutaba dentro del servidor
Astro una vez comprobada la paridad de los microservicios.

## Código retirado

- Registro y endpoints `/_actions/*` de Astro Actions.
- Handlers y repositorios Supabase de Organizaciones, Programas, Planes y
  Acciones ubicados en el frontend.
- Action de prueba y transportes basados en respuestas `devalue`.
- Pruebas y scripts QA que ejercitaban esos endpoints retirados.

## Código conservado

- Los schemas Zod usados por los formularios se movieron a
  `frontend/src/lib/validaciones`.
- Los contratos de presentación se movieron a `frontend/src/lib/modelos`.
- Supabase JS permanece para administrar la sesión del navegador y para el
  módulo transversal de archivos de Programas.

## Entrada vigente

Todas las operaciones de negocio usan `PUBLIC_API_BASE_URL` y el API Gateway.
Las rutas visuales de Astro, sus componentes y estilos no cambiaron.
