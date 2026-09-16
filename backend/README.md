# Backend con Astro Actions

El backend de FGE se implementa con Astro Actions. Astro descubre las Actions
únicamente desde `frontend/src/actions/index.ts`; por eso el código ejecutable
permanece dentro del proyecto Astro y esta carpeta concentra la documentación
de arquitectura y contratos.

## Estructura

```text
frontend/src/actions/
├── index.ts
└── prueba/
    ├── recibir-datos.action.ts
    ├── recibir-datos.handler.ts
    └── recibir-datos.schema.ts

frontend/tests/actions/
└── recibir-datos.test.mjs
```

- `index.ts` registra las Actions que Astro expone.
- `*.action.ts` conecta el transporte de Astro con la lógica de aplicación.
- `*.schema.ts` contiene los contratos Zod y los mensajes de validación.
- `*.handler.ts` contiene lógica independiente del transporte y comprobable de
  forma aislada.

Cada dominio nuevo debe crear su propia carpeta y exportar sus Actions desde
`frontend/src/actions/index.ts`.

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
