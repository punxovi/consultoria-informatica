# ADR-001: separación progresiva de Frontend y Backend

## Estado

Aceptada para implementación incremental desde `sprint-4`.

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
6. Las Astro Actions permanecerán activas hasta que el servicio equivalente
   alcance paridad funcional y pase QA.

## Consecuencias

- El Gateway se convierte en la única entrada pública al Backend.
- Los servicios pueden probarse y desplegarse de manera independiente.
- Durante la transición existirán temporalmente dos transportes: Astro Actions
  y HTTP. Esto es deliberado y evita un cambio total sin posibilidad de
  reversión.
- No se permitirá que una página visual defina por sí sola un microservicio;
  las páginas relacionadas comparten el servicio de su dominio.

## Alcance de la base inicial

- Workspace npm en la raíz.
- API Gateway con salud, CORS, request ID, respuestas uniformes y proxy Auth.
- Contratos y utilidades compartidas sin dependencias externas.
- Servicio Auth con salud y capacidades. Sus operaciones funcionales responden
  `501 AUTH_PENDIENTE_MIGRACION` hasta el paso dedicado a autenticación.
- Ningún cambio en páginas, componentes, estilos o Astro Actions existentes.
