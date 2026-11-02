# ADR-001: separación progresiva de Frontend y Backend

## Estado

Implementada. La migración incremental finalizó con el retiro del backend
heredado de Astro.

## Contexto

La interfaz Astro, las Astro Actions y los repositorios Supabase se construyen
actualmente como un único artefacto. Aunque el código fuente está separado por
archivos y dominios, Frontend y Backend comparten proceso y despliegue.

La migración debe conservar rutas, diseño, sesión, respuestas y políticas RLS
mientras los dominios se extraen de forma gradual.

## Decisión

1. Astro seguirá siendo el Frontend y no cambiará visualmente.
2. El navegador consumirá una única superficie `/api/v1` mediante un API
   Gateway.
3. El Backend se dividirá por capacidades: Auth, Dashboard, Organizaciones,
   Programas, Planes, Acciones y Reportes.
4. Los contratos HTTP, códigos de error, configuración y contexto de sesión
   serán compartidos explícitamente.
5. Supabase continuará como plataforma de datos. Cada servicio será dueño de
   sus consultas, migraciones y permisos, sin acceder a repositorios de otro
   dominio.
6. Las Astro Actions se retirarían cuando el servicio equivalente alcanzara
   paridad funcional y pasara QA. Esta condición ya se cumplió.

## Consecuencias

- El Gateway se convierte en la única entrada pública al Backend.
- Los servicios pueden probarse y desplegarse de manera independiente.
- El transporte HTTP del Gateway es la única entrada de operaciones de negocio.
- No se permitirá que una página visual defina por sí sola un microservicio;
  las páginas relacionadas comparten el servicio de su dominio.

## Resultado final

- Workspace npm en la raíz.
- API Gateway con salud, CORS, request ID, respuestas uniformes y proxy Auth.
- Contratos y utilidades compartidas sin dependencias externas.
- Servicios independientes de Auth, Organizaciones, Programas, Intervenciones
  e Insights.
- Frontend sin Astro Actions ni repositorios de base de datos duplicados.
- Rutas, componentes y estilos visuales preservados.
