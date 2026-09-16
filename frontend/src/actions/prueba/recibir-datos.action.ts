import { defineAction } from 'astro:actions';

import { procesarDatosPrueba } from './recibir-datos.handler';
import { recibirDatosPruebaSchema } from './recibir-datos.schema';

/**
 * Action mínima para comprobar recepción de datos y validación del lado del
 * servidor. Astro convierte los fallos de Zod en ActionInputError, cuyos
 * campos se pueden identificar con isInputError(error).
 */
export const recibirDatosPrueba = defineAction({
  accept: 'json',
  input: recibirDatosPruebaSchema,
  handler: async (input) => procesarDatosPrueba(input),
});
