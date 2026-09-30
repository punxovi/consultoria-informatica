import { z } from 'zod';

const emailSchema = z
  .string({ error: 'El correo debe ser texto.' })
  .trim()
  .email('El correo debe tener un formato válido.')
  .max(254, 'El correo no puede superar 254 caracteres.')
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string({ error: 'La contraseña debe ser texto.' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(128, 'La contraseña no puede superar 128 caracteres.');

/** Schema para solicitar la recuperación de contraseña (envío de correo). */
export const solicitarRecuperacionSchema = z
  .object({
    correo: emailSchema,
  })
  .strict();

/** Schema para cambiar la contraseña utilizando el flujo de recuperación. */
export const cambiarContrasenaSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

/** Schema para el inicio de sesión. */
export const loginSchema = z
  .object({
    correo: emailSchema,
    password: z.string({ error: 'La contraseña debe ser texto.' }).min(1, 'La contraseña es obligatoria.'),
  })
  .strict();

export type SolicitarRecuperacionInput = z.infer<typeof solicitarRecuperacionSchema>;
export type CambiarContrasenaInput = z.infer<typeof cambiarContrasenaSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface ErrorValidacionAuth {
  campo: string;
  codigo: string;
  mensaje: string;
}

/** Convierte ZodError a una estructura estable para formularios y pruebas. */
export function formatearErroresAuth(
  error: z.ZodError,
): ErrorValidacionAuth[] {
  return error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : '_entrada',
    codigo: issue.code,
    mensaje: issue.message,
  }));
}
