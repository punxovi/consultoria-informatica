import type { RecibirDatosPruebaInput } from './recibir-datos.schema';

export const CODIGO_DATOS_RECIBIDOS = 'DATOS_RECIBIDOS' as const;

/** Lógica de aplicación separada del transporte para facilitar sus pruebas. */
export function procesarDatosPrueba(input: RecibirDatosPruebaInput) {
  return {
    ok: true as const,
    codigo: CODIGO_DATOS_RECIBIDOS,
    mensaje: 'Los datos fueron recibidos correctamente.',
    datos: input,
  };
}
