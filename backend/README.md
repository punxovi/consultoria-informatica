# Backend FGE

## Nueva base de servicios

La separación progresiva del Frontend y Backend comienza en esta carpeta. La
base incluye:

- `gateway/`: entrada HTTP pública `/api/v1`, CORS, request ID y enrutamiento;
- `services/auth/`: esqueleto independiente de autenticación;
- `shared/`: contratos, configuración, errores, contexto de autenticación y
  observabilidad reutilizables;
- `dev.mjs`: ejecución conjunta del Gateway y Auth durante desarrollo.

```bash
# Desde la raíz del repositorio
npm run test:architecture
npm run dev:backend
```

El Gateway utiliza `http://127.0.0.1:4000` y Auth
`http://127.0.0.1:4101` de forma predeterminada. Las variables disponibles se
documentan en `backend/.env.example`.

La decisión y sus límites están documentados en
`docs/architecture/ADR-001-separacion-frontend-backend.md`.

El dominio de autenticación ya está migrado. Sus endpoints, sesión y guía local
se documentan en `docs/architecture/AUTH-MIGRATION.md`.

Las implementaciones que siguen bajo este encabezado continúan funcionando y
no se retirarán hasta completar la migración y las pruebas de paridad.

## Backend heredado con Astro Actions

## Programas integrados (KAN-176)

Las Actions `listarProgramas`, `obtenerProgramaPorId`, `crearPrograma` y
`actualizarPrograma` están registradas en `frontend/src/actions/index.ts`.
Usan los schemas del dominio y respuestas `{ ok, codigo, mensaje, datos }`.
El cliente envía el Bearer de la sesión; la instancia Supabase conserva RLS.

Las lecturas consultan programas y líneas activos. Las escrituras usan
`public.guardar_programa_completo(jsonb, uuid, bigint)`, una RPC con permisos
del invocador que guarda todo en una transacción y controla la versión esperada.
Requiere la migración `20260925120000_fge_guardar_programa_completo.sql`.
La versión actual requiere también las migraciones posteriores hasta
`20261003200000_fge_programas_orden_lineas.sql`, que conserva el orden de las
líneas mediante su campo `orden` y actualiza la RPC con permisos del invocador.

Los errores de dominio incluyen `NO_ENCONTRADO`, `CONFLICTO_CONCURRENCIA`,
`SIN_PERMISO`, `RESTRICCION_INCUMPLIDA` y `ERROR_BASE_DATOS`. Zod entrega
`ActionInputError` antes de ejecutar el handler si la entrada es inválida.
La guía [PROBAR-KAN-176](../docs/PROBAR-KAN-176.md) documenta los casos manuales
y automatizados y el alcance de las comprobaciones locales.

El backend de FGE se implementa con Astro Actions. Astro descubre las Actions
únicamente desde `frontend/src/actions/index.ts`; por eso el código ejecutable
permanece dentro del proyecto Astro y esta carpeta concentra la documentación
de arquitectura y contratos.

## Estructura

```text
frontend/src/actions/
├── index.ts
├── organizaciones/
│   ├── organizaciones.action.ts
│   ├── organizaciones.handler.ts
│   └── organizaciones.schema.ts
└── prueba/
    ├── recibir-datos.action.ts
    ├── recibir-datos.handler.ts
    └── recibir-datos.schema.ts

frontend/tests/actions/
├── organizaciones.schema.test.mjs
├── organizaciones.handler.test.mjs
└── recibir-datos.test.mjs
```

- `index.ts` registra las Actions que Astro expone.
- `*.action.ts` conecta el transporte de Astro con la lógica de aplicación.
- `*.schema.ts` contiene los contratos Zod y los mensajes de validación.
- `*.handler.ts` contiene lógica independiente del transporte y comprobable de
  forma aislada.

Cada dominio nuevo debe crear su propia carpeta y exportar sus Actions desde
`frontend/src/actions/index.ts`.

## Actions de Programas (KAN-171)

El registro público expone cuatro operaciones JSON para Programas
Institucionales:

| Action | Propósito | Entrada principal |
| --- | --- | --- |
| `listarProgramas` | Lista Programas activos con sus líneas de acción. | Objeto vacío |
| `obtenerProgramaPorId` | Consulta un Programa y sus líneas por UUID. | `id_programa` |
| `crearPrograma` | Crea el Programa y cada línea con su resultado esperado. | `crearProgramaSchema` |
| `actualizarPrograma` | Actualiza datos, sincroniza líneas y admite control de versión. | `actualizarProgramaSchema` |

Las cuatro Actions utilizan el cliente por petición de `supabase-actions.ts` y
reenvían el token Bearer para que las políticas RLS evalúen el rol de la
sesión. Las respuestas siguen el contrato `{ ok, codigo, mensaje, datos }` y
los errores controlados no exponen el detalle interno de Supabase.

La actualización de líneas conserva las existentes, crea las adicionales y
archiva las retiradas. Los textos legados de `programas` se mantienen
sincronizados para preservar compatibilidad con el modelo anterior.

La comprobación local no necesita escribir en Supabase:

```bash
cd frontend
npm test
npm run build
npm run dev
```

Las pruebas cubren las cuatro operaciones, validación previa, líneas de acción,
control de versión, archivado y estructura de errores. Una prueba manual con
datos reales requiere una sesión `ADMIN`; `COORD` e `INVIT` solo poseen lectura
según las políticas RLS actuales.

## Actions de Organizaciones (KAN-160)

El registro público expone cuatro operaciones JSON:

| Action | Propósito | Entrada principal |
| --- | --- | --- |
| `listarOrganizaciones` | Lista organizaciones activas y permite filtrar por país. | `id_pais?`, `incluir_archivadas` |
| `obtenerOrganizacionPorId` | Consulta una organización activa. | `id_organizacion` |
| `crearOrganizacion` | Registra una organización. | Todos los campos de `organizacionSchema` |
| `actualizarOrganizacion` | Modifica campos y admite control de concurrencia. | `id_organizacion`, `cambios`, `version_esperada?` |

Cada Action crea un cliente de Supabase por petición con
`PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Si la petición incluye
`Authorization: Bearer <access_token>`, el encabezado se reenvía a Supabase para
que las políticas RLS evalúen la sesión. No se utiliza una clave `service_role`
desde el Frontend.

Todas las respuestas de negocio comparten el mismo contrato:

```ts
type RespuestaAction<T> =
  | { ok: true; codigo: string; mensaje: string; datos: T }
  | { ok: false; codigo: string; mensaje: string; datos: null };
```

Los errores controlados distinguen organización inexistente, país inexistente,
restricciones de base de datos, conflicto de versión, falta de permisos y
configuración ausente. Los detalles internos de Supabase no se devuelven al
cliente.

La lógica de aplicación vive en `organizaciones.handler.ts` y recibe las
operaciones de repositorio como dependencia. De esta forma las cuatro Actions y
sus respuestas pueden probarse localmente sin escribir datos reales.

### Prueba local del endpoint

```bash
cd frontend
npm install
npm test
npm run build
npm run dev
```

Con el servidor iniciado, la Action de listado puede invocarse así:

```bash
curl -X POST http://localhost:4321/_actions/listarOrganizaciones \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"incluir_archivadas":false}'
```

Sin variables de Supabase configuradas, la respuesta controlada usa el código
`CONFIGURACION_SUPABASE`. Con credenciales y una sesión autorizada, la respuesta
correcta usa `ORGANIZACIONES_LISTADAS` y entrega los registros en `datos`.

## Validaciones de Organizaciones (KAN-161)

`organizacionSchema` valida y normaliza los datos completos de una
organización. Los schemas de listado, consulta por ID, creación y actualización
quedan disponibles para que las futuras Actions de Organizaciones validen sus
entradas antes de procesarlas. Entre otras reglas:

- todos los datos requeridos deben estar presentes y usar el tipo correcto;
- los identificadores deben ser UUID;
- el correo debe ser válido y se normaliza a minúsculas;
- el teléfono solo admite caracteres telefónicos;
- `numero_beneficiarios` debe ser un entero no negativo;
- `tipo_organizacion` solo admite los valores de la base de datos;
- el tipo `otra` exige `tipo_organizacion_otro`;
- las actualizaciones deben contener al menos un cambio;
- se rechazan propiedades no declaradas.

Los consumidores pueden usar `parse` o `safeParse` para rechazar datos inválidos
antes de procesarlos. `formatearErroresOrganizacion` convierte un `ZodError` en
una lista estable de objetos `{ campo, codigo, mensaje }` para formularios,
Actions y pruebas.

### Pruebas locales

```bash
cd frontend
npm install
npm test
npm run build
```

Las pruebas comprueban campos obligatorios, tipos, UUID, formatos, límites,
campos adicionales, reglas condicionales, actualizaciones vacías y la estructura
de los errores. No requieren conexión a Supabase ni modifican datos reales.

## Action inicial

`recibirDatosPrueba` acepta JSON con este contrato:

```ts
{
  nombre: string;  // 2 a 100 caracteres
  correo: string;  // correo válido
  mensaje: string; // 1 a 500 caracteres
}
```

La respuesta correcta incluye `ok: true`, el código estable
`DATOS_RECIBIDOS`, un mensaje y los datos normalizados.

Zod rechaza campos adicionales y entradas inválidas antes de ejecutar el
handler. Astro entrega esos fallos como `ActionInputError`; la interfaz puede
identificarlos por campo usando `isInputError`:

```ts
import { actions, isInputError } from 'astro:actions';

const { data, error } = await actions.recibirDatosPrueba({
  nombre: 'María Pérez',
  correo: 'maria@example.com',
  mensaje: 'Prueba de integración',
});

if (isInputError(error)) {
  console.log(error.fields.nombre);
  console.log(error.fields.correo);
  console.log(error.fields.mensaje);
}
```

Para logs o interfaces que necesiten un formato independiente de Astro,
`identificarErroresValidacion` genera objetos con `campo`, `codigo` y
`mensaje`.

## Ejecución y comprobación

Se requiere Node.js 22.12 o posterior.

```bash
cd frontend
npm install
npm test
npm run build
npm run dev
npm start
```

El proyecto usa el adaptador oficial `@astrojs/node` en modo `standalone` y
salida `server`. `npm run dev` inicia el entorno de desarrollo y `npm start`
ejecuta el artefacto generado en `dist/server/entry.mjs`.

## Cobertura de las subtareas

- KAN-46: registro de Astro Actions en `src/actions/index.ts`.
- KAN-47: estructura por dominio separando Action, esquema y handler.
- KAN-48: Zod declarado como dependencia y utilizado en los contratos.
- KAN-49: Action `recibirDatosPrueba` que recibe datos.
- KAN-50: validación de la entrada mediante el esquema Zod.
- KAN-51: errores con campo, código y mensaje identificables.
- KAN-52: arquitectura, contrato y comandos documentados en este archivo.
- KAN-160: Actions para listar, consultar, crear y actualizar organizaciones,
  conectadas al repositorio Supabase con respuestas y errores uniformes.
- KAN-161: schemas Zod reutilizables con campos obligatorios, tipos,
  restricciones y errores identificables antes del procesamiento.
