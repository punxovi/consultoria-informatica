import { z } from 'zod';

/**
 * Contrato de entrada de la Action inicial.
 * Los mensajes indican el campo y la causa para que la interfaz pueda mostrar
 * errores de validación comprensibles.
 */
export const recibirDatosPruebaSchema = z
  .object({
    nombre: z
      .string({ error: 'El nombre debe ser texto.' })
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres.')
      .max(100, 'El nombre no puede superar los 100 caracteres.'),
    correo: z
      .string({ error: 'El correo debe ser texto.' })
      .trim()
      .email('El correo debe tener un formato válido.')
      .transform((value) => value.toLowerCase()),
    mensaje: z
      .string({ error: 'El mensaje debe ser texto.' })
      .trim()
      .min(1, 'El mensaje es obligatorio.')
      .max(500, 'El mensaje no puede superar los 500 caracteres.'),
  })
  .strict('No se permiten campos adicionales.');

export type RecibirDatosPruebaInput = z.infer<
  typeof recibirDatosPruebaSchema
>;

export interface ErrorValidacionIdentificable {
  campo: string;
  codigo: string;
  mensaje: string;
}

/** Convierte los issues de Zod a un formato estable para logs o interfaces. */
export function identificarErroresValidacion(
  error: z.ZodError,
): ErrorValidacionIdentificable[] {
  return error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : '_entrada',
    codigo: issue.code,
    mensaje: issue.message,
  }));
}
