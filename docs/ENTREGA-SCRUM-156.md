# SCRUM-156 — Coberturas temporales y contexto territorial

La administración de coberturas queda conectada en el recorrido completo:

`Frontend → cliente HTTP → API Gateway → organizations-service → Supabase`.

El selector territorial envía el país activo en `x-territory-id`. Ese valor es
solamente contexto de interfaz: el Gateway lo reenvía, pero la autorización se
decide con el JWT, la RPC y las políticas de Supabase.

## Rutas públicas del Gateway

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/v1/organizations/temporary-coverages` | Listar coberturas como Administrador |
| POST | `/api/v1/organizations/temporary-coverages` | Crear una cobertura |
| PATCH | `/api/v1/organizations/temporary-coverages/:id/extend` | Extender usando `version_esperada` |
| PATCH | `/api/v1/organizations/temporary-coverages/:id/revoke` | Revocar usando `version_esperada` y motivo |
| GET | `/api/v1/organizations/temporary-coverages/mine` | Obtener únicamente las coberturas vigentes de la sesión |

Las respuestas usan el sobre común `{ ok, code, message, data }`. Los errores
de sesión, permisos, concurrencia y conectividad se reflejan en la interfaz.

## Paso manual obligatorio: Supabase

Antes de usar la funcionalidad contra la base real, aplica
`supabase/migrations/20261031120000_fge_administrar_coberturas.sql` junto con
las migraciones anteriores del repositorio.

Con un proyecto Supabase enlazado, desde la raíz del repositorio:

```powershell
supabase db push
```

Como alternativa, ejecuta esa migración en el SQL Editor, respetando el orden
de las migraciones. La RPC `administrar_coberturas` no otorga privilegios
directos a tablas: identifica al usuario con `auth.uid()`, permite administrar
solamente a un `ADMIN` activo de alcance global y devuelve a cada Coordinador
solamente sus propias coberturas vigentes.

El Backend requiere `SUPABASE_URL` y `SUPABASE_ANON_KEY` (o sus equivalentes
`PUBLIC_*`) configurados en su entorno. No se requiere una clave de servicio.

## Comprobación manual sugerida

1. Como Administrador, abre `/administracion/coberturas`, crea una cobertura y
   confirma que aparece en el listado.
2. Extiende la fecha y después revócala; el listado debe actualizarse desde la
   respuesta del Backend.
3. Como el Coordinador beneficiario, recarga o vuelve a enfocar la aplicación:
   el selector muestra sólo el país principal y las coberturas vigentes.
4. Tras una revocación o vencimiento, el selector elimina el territorio
   adicional como máximo en el siguiente foco o ciclo visible de un minuto; el
   Backend lo rechaza de inmediato por sus propias reglas aunque el navegador
   conserve un valor antiguo.
