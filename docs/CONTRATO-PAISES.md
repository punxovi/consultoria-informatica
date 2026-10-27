# Administración de países — SCRUM-149

Rama `feature/SCRUM-149-operaciones-persistencia-paises`, basada en
`origin/sprint-8` (`ce52112`). Implementa HU02/RF04 sobre la tabla raíz existente
`public.paises`. No crea una segunda entidad territorial ni modifica las claves
foráneas de Organizaciones, asignaciones u otros registros.

## Acceso y rutas

Todas las operaciones de administración exigen `Authorization: Bearer <sesión>`
y Administrador activo con rol ADMIN vigente de alcance global. La autorización
se comprueba antes de validar el cuerpo en HTTP y nuevamente dentro de la RPC,
también si alguien intenta llamarla directamente desde Supabase.

| Método y ruta del Gateway | Solicitud | Respuesta `data` |
|---|---|---|
| GET `/api/v1/countries` | Sin cuerpo ni parámetros | `{ countries: Country[] }` |
| GET `/api/v1/countries/:id` | UUID de país | `{ country: Country }` |
| POST `/api/v1/countries` | Campos de alta | `{ country: Country }` (201) |
| PATCH `/api/v1/countries/:id` | `{ version_esperada, cambios }` | `{ country: Country }` |

Las consultas y modificaciones correctas responden 200; el alta, 201. No se
exponen operaciones de eliminación ni archivo. No se admiten query params ni
campos adicionales. El Gateway deriva estas rutas al servicio Organizations.

Por confirmación del usuario, `/api/v1/organizations/countries` conserva su
catálogo básico autenticado para formularios y filtros de los demás módulos:
solo `id_pais`, `nombre` y `codigo_iso`. No es un endpoint de administración.
La migración limita los permisos directos de lectura a esas columnas y
`archived_at`, necesario para filtrar el catálogo con las políticas existentes.
Los demás campos se consultan exclusivamente a través de la RPC ADMIN.

## Solicitud

```json
{
  "nombre": "Chile",
  "codigo_iso": "CL",
  "codigo_area_telefonica": "+56",
  "zona_horaria": "America/Santiago"
}
```

| Campo | Tipo y validación |
|---|---|
| `nombre` | Texto obligatorio, 1–120 caracteres, sin caracteres de control; se recortan espacios |
| `codigo_iso` | Texto obligatorio, dos letras A–Z; se normaliza a mayúsculas; clave natural existente del modelo |
| `codigo_area_telefonica` | Texto obligatorio: `+` y entre una y tres cifras, primera cifra no cero (`+56`, `+54`, `+598`) |
| `zona_horaria` | Texto obligatorio, máximo 100 caracteres, identificador IANA disponible en Node y PostgreSQL, o `UTC`; no abreviaturas como `CST` ni offsets como `-03:00` |

El prefijo se interpreta como código internacional del país, sin prefijo de
ciudad ni número completo. Su validación es de formato; no utiliza un servicio
externo para comprobar asignación telefónica. No es único, pues países distintos
pueden compartir un código internacional. El código ISO se mantiene para
compatibilidad con el modelo existente; no se deriva del nombre ni de la zona.

Ejemplo de modificación parcial:

```json
{
  "version_esperada": 3,
  "cambios": {
    "nombre": "Nombre actualizado",
    "zona_horaria": "America/Santiago"
  }
}
```

`version_esperada` debe ser un entero positivo seguro. `cambios` incluye al menos
uno de los cuatro campos de alta. No se acepta `null` ni se permite cambiar
`id_pais`, fechas, autoría, versión directamente, estado de archivo o un supuesto
país padre. Un país es el primer nivel y no tiene otro país como padre.

La zona IANA puede normalizarse a un alias equivalente mediante ICU en Node;
por ejemplo `America/Argentina/Buenos_Aires` y `America/Buenos_Aires` representan
la misma zona. PostgreSQL valida que el identificador almacenado esté disponible
en su catálogo. Se consideran zonas, no offsets fijos, para respetar horario de
verano donde corresponda. La fecha/hora de auditoría sigue siendo `timestamptz`.

## Respuesta

```json
{
  "ok": true,
  "code": "PAIS_CONSULTADO",
  "message": "País consultado.",
  "data": {
    "country": {
      "id_pais": "14900000-0000-4000-8000-000000000003",
      "nombre": "Chile",
      "codigo_iso": "CL",
      "codigo_area_telefonica": "+56",
      "zona_horaria": "America/Santiago",
      "version": 1,
      "created_at": "2026-10-27T13:00:00Z",
      "updated_at": "2026-10-27T13:00:00Z",
      "configuracion_pendiente": false
    }
  }
}
```

Identificador y fecha ilustrativos; no se asigna un UUID fijo a países que ya
existen. Todas las respuestas llevan `X-Request-Id` y `Cache-Control: no-store`.

## Persistencia y migración

Aplicar `supabase/migrations/20261027150000_fge_scrum149_paises.sql` después de
las migraciones de Sprint 8. No depende de la migración de Coordinadores
SCRUM-145 ni necesita una clave `service_role`. El Backend utiliza el JWT del
Administrador y la clave pública configurada para la RPC `administrar_paises`.

La migración agrega los dos campos nuevos y valida también en PostgreSQL las
escrituras. La inicialización establece:

| País | ISO | Prefijo | Zona inicial |
|---|---|---|---|
| Chile | CL | +56 | America/Santiago |
| Argentina | AR | +54 | America/Argentina/Buenos_Aires |
| Uruguay | UY | +598 | America/Montevideo |

Busca por ISO o nombre normalizado, conserva los UUID existentes y completa los
datos faltantes. Solo inserta un país base si no existe. La función privada de
inicialización puede repetirse sin crear duplicados, sobrescribir configuración
completa ni incrementar versiones sin cambios. Si un país base está archivado,
lo habilita durante la inicialización. La migración versionada se aplica una
vez; la función de inicialización es la operación idempotente.

Los nombres son únicos al ignorar mayúsculas y espacios laterales, incluso en
registros archivados; el ISO conserva su restricción única. No se fusionan ni
eliminan países duplicados. Si encuentra nombres repetidos o una coincidencia
ambigua de nombre/ISO, la migración aborta por completo para que se resuelva el
caso conservando las referencias.

Para países adicionales heredados no se inventan prefijo ni zona: los valores
pueden permanecer `null` y `configuracion_pendiente` será `true`. Una restricción
`NOT VALID` conserva esas filas antiguas y obliga a completar ambos valores al
modificarlas; toda alta nueva exige la configuración completa. Los tres nodos
base quedan completos. Después de configurar cualquier otro país pendiente se
puede validar `paises_configuracion_requerida` en PostgreSQL.

Modificar actualiza la misma fila bajo bloqueo y compara la versión esperada.
No reasigna Organizaciones ni cambia sus identificadores. Los triggers de sello
y auditoría existentes conservan `created_at`/`created_by`, incrementan versión
y anexan los cambios al historial.

## Errores

Se utiliza `{ ok:false, error:{ code,message,requestId,fields? }, data:null }`.
Las validaciones Zod incluyen `error.fields` con las claves del formulario.
No se exponen cuerpos crudos de Supabase, credenciales ni tokens.

| HTTP | Código | Situación |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Campos ausentes, tipos, formatos, UUID, versión o campos adicionales |
| 400 | `JSON_INVALIDO` | JSON mal formado |
| 400 | `ZONA_HORARIA_INVALIDA` | Zona no reconocida por PostgreSQL |
| 401 | `SESION_REQUERIDA` / `SESION_INVALIDA` | Sesión ausente o inválida |
| 403 | `SIN_PERMISO` | No es Administrador activo global |
| 404 | `PAIS_NO_ENCONTRADO` | País inexistente o archivado |
| 409 | `PAIS_DUPLICADO` | Nombre normalizado o ISO ya registrado |
| 409 | `CONFLICTO_VERSION` | La versión cambió; recargar antes de reintentar |
| 405 | `METODO_NO_PERMITIDO` | Operación no admitida |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Cuerpo superior a 32 KiB |
| 429 | `DEMASIADAS_SOLICITUDES` | Límite remoto |
| 503 | `MIGRACION_PAISES_PENDIENTE` / `CONFIGURACION_SUPABASE` | SQL o conexión sin configurar |
| 502/503 | `RESPUESTA_INVALIDA` / `PAISES_NO_DISPONIBLES` | Error remoto, timeout o persistencia |

## Verificación local

```powershell
node --experimental-strip-types --test backend/services/organizations/tests/countries.test.ts
npm.cmd run test:architecture
npm.cmd run check:architecture
npm.cmd run build:frontend
node scripts/verificar-paises-db.mjs <directorio-node_modules-con-pglite>
```

El script utiliza `@electric-sql/pglite` instalado en una carpeta temporal. Carga
las migraciones base reales y un esquema Auth mínimo. Verifica inicialización
repetida, configuración, lectura, altas, cambios, conflictos, autoría, historial,
conservación de una relación real con Organización, denegación ADMIN inactivo,
rol no ADMIN y acceso anónimo, y catálogo básico sin acceso a configuración.
Las pruebas HTTP pasan por un Gateway y servicio reales con persistencia
simulada. Ninguna de estas pruebas modifica Supabase remoto.

La entrega implementa Backend y contrato; no agrega una pantalla de
administración de países. El catálogo básico existente continúa funcionando.

Verificación local del 27 de octubre de 2026:

- 204 pruebas de backend/arquitectura aprobadas, incluidas 105 de Organizations.
- 50 comprobaciones de PostgreSQL/PGlite aprobadas.
- Revisión de sintaxis y compilación del Frontend correctas.
- Servicios reiniciados con esta rama: frontend `/login` 200, Gateway `/health`
  200 y renovación ficticia por Gateway 401 `SESION_INVALIDA`. Esto verifica
  conectividad real de Auth con Supabase sin usar credenciales de una persona.
- Administración y catálogo sin sesión: 401 `SESION_REQUERIDA`.
- El usuario confirmó haber aplicado la migración en Supabase y verificado
  mediante SELECT los tres países base y su configuración. Esa comprobación
  remota fue realizada por el usuario; no se probó todavía el flujo HTTP con una
  sesión ADMIN real. Se conservaron los archivos locales de QA del usuario.
