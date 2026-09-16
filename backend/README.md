# Backend con Astro Actions

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
├── organizaciones.handler.test.mjs
├── organizaciones.schema.test.mjs
└── recibir-datos.test.mjs
```

- `index.ts` registra las Actions que Astro expone.
- `*.action.ts` conecta el transporte de Astro con la lógica de aplicación.
- `*.schema.ts` contiene los contratos Zod y los mensajes de validación.
- `*.handler.ts` contiene lógica independiente del transporte y comprobable de
  forma aislada.

Cada dominio nuevo debe crear su propia carpeta y exportar sus Actions desde
`frontend/src/actions/index.ts`.

## Actions de Organizaciones (KAN-160 y KAN-161)

El registro público expone cuatro operaciones JSON:

| Action | Propósito | Entrada principal |
| --- | --- | --- |
| `listarOrganizaciones` | Lista organizaciones activas y permite filtrar por país. | `id_pais?`, `incluir_archivadas` |
| `obtenerOrganizacionPorId` | Consulta una organización activa. | `id_organizacion` |
| `crearOrganizacion` | Registra una organización. | Todos los campos de `organizacionSchema` |
| `actualizarOrganizacion` | Modifica campos y admite control de concurrencia. | `id_organizacion`, `cambios`, `version_esperada?` |

Las Actions crean un cliente de Supabase por petición con
`PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Si la petición incluye
`Authorization: Bearer <access_token>`, el encabezado se reenvía a Supabase para
que las políticas RLS se evalúen con la sesión correspondiente. Nunca se expone
ni se utiliza una clave `service_role` desde el Frontend.

Todas las respuestas de negocio tienen la misma estructura:

```ts
type RespuestaAction<T> =
  | { ok: true; codigo: string; mensaje: string; datos: T }
  | { ok: false; codigo: string; mensaje: string; datos: null };
```

Los errores conocidos distinguen organización inexistente, país inexistente,
restricciones de base de datos, conflicto de versión, falta de permisos y
configuración ausente. Los detalles internos de Supabase no se devuelven al
cliente.

### Validación Zod

`organizacionSchema` valida y normaliza los campos antes de ejecutar el
handler. Entre otras reglas:

- todos los datos requeridos deben estar presentes y usar el tipo correcto;
- los identificadores deben ser UUID;
- el correo debe ser válido y se normaliza a minúsculas;
- el teléfono solo admite caracteres telefónicos;
- `numero_beneficiarios` debe ser un entero no negativo;
- `tipo_organizacion` solo admite los valores de la base de datos;
- el tipo `otra` exige `tipo_organizacion_otro`;
- las actualizaciones deben contener al menos un cambio;
- se rechazan propiedades no declaradas.

Astro convierte estos fallos en `ActionInputError` antes de abrir la conexión
con Supabase. `formatearErroresOrganizacion` también permite obtener una lista
estable de objetos `{ campo, codigo, mensaje }` para formularios y pruebas.

### Pruebas locales

```bash
cd frontend
npm install
npm test
npm run build
```

Las pruebas de handler inyectan operaciones de repositorio controladas; por eso
las cuatro Actions y sus errores pueden comprobarse sin modificar datos reales.
Para probar el endpoint local contra Supabase, inicia `npm run dev` y envía JSON
a `/_actions/<nombreAction>` con el token de una sesión autorizada:

```bash
curl -X POST http://localhost:4321/_actions/listarOrganizaciones \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"incluir_archivadas":false}'
```

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
