# Backend FGE

El backend se ejecuta fuera del proceso de Astro y expone una única entrada
pública mediante el API Gateway.

## Servicios

| Componente | Puerto | Responsabilidad |
| --- | ---: | --- |
| `gateway` | 4000 | CORS, request ID y rutas públicas `/api/v1`. |
| `services/auth` | 4101 | Login, recuperación, sesión, cierre y administración de Coordinadores. |
| `services/organizations` | 4102 | Organizaciones, catálogo y administración de países. |
| `services/programs` | 4103 | Programas y líneas de acción. |
| `services/interventions` | 4104 | Planes de intervención y acciones. |
| `services/insights` | 4105 | Métricas de Dashboard y resumen de Reportes. |

Cada servicio separa dominio, aplicación, infraestructura y transporte HTTP.
Las consultas a Supabase se ejecutan en la infraestructura del servicio y
conservan el token Bearer para aplicar las políticas RLS.

El frontend ya no registra Astro Actions ni contiene repositorios de base de
datos. Conserva únicamente los clientes HTTP, modelos de presentación,
validaciones de formularios y el cliente Supabase necesario para mantener la
sesión del navegador.

## Ejecución

Se requiere Node.js 22.12 o posterior.

```powershell
Copy-Item backend/.env.example backend/.env
npm.cmd install
npm.cmd run dev
```

La web queda disponible en `http://127.0.0.1:4321` y el Gateway en
`http://127.0.0.1:4000`.

## Verificación

```powershell
npm.cmd run check:architecture
npm.cmd run test:architecture
npm.cmd run test --workspace=frontend
npm.cmd run build:frontend
```

La decisión de arquitectura se documenta en
`docs/architecture/ADR-001-separacion-frontend-backend.md` y cada dominio posee
su documento de migración en esa misma carpeta.

La administración `/api/v1/countries` exige ADMIN y la migración de SCRUM-149.
El catálogo básico de formularios mantiene `/api/v1/organizations/countries`.
Consultar [`CONTRATO-PAISES.md`](../docs/CONTRATO-PAISES.md) para los campos,
respuestas, migración y pruebas.

Las operaciones `/api/v1/coordinators` requieren la migración de SCRUM-145.
El alta requiere además `SUPABASE_SERVICE_ROLE_KEY`, exclusiva del Backend.
Parámetros, respuestas, ciclo de vida y pruebas en
[`CONTRATO-COORDINADORES.md`](../docs/CONTRATO-COORDINADORES.md).

### Auditoría RF62 (SCRUM-157)

Auth requiere `SUPABASE_SERVICE_ROLE_KEY` también para registrar operaciones
verificadas y rechazos de autenticación. La clave permanece en el proceso Auth;
los repositorios normales siguen usando clave pública y JWT del usuario.
Las migraciones `20261107020000_fge_scrum157_auditoria_rf62.sql` y
`20261107021000_fge_scrum157_auditoria_copias_storage.sql` deben aplicarse antes
de desplegar los procesos nuevos. Auth sincroniza idempotentemente los eventos
nativos al confirmar operaciones y cada 30 segundos; no modifica el esquema Auth.
Para proxies entre hosts, configurar `AUDIT_TRUSTED_PROXY_IPS` en la red privada.
Contrato, fuentes instrumentadas y pruebas en
[CONTRATO-AUDITORIA-SCRUM157.md](../docs/CONTRATO-AUDITORIA-SCRUM157.md).
