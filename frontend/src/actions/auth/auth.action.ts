import { defineAction } from 'astro:actions';
import { solicitarRecuperacionSchema, cambiarContrasenaSchema } from './auth.schema';
import { solicitarRecuperacionHandler, cambiarContrasenaHandler } from './auth.handler';

export const authActions = {
  solicitarRecuperacion: defineAction({
    input: solicitarRecuperacionSchema,
    handler: async (input, context) => {
      try {
        const origin = context.request ? new URL(context.request.url).origin : undefined;
        return await solicitarRecuperacionHandler(input, origin);
      } catch (error: any) {
        throw new Error(error.message || 'Error al procesar la solicitud de recuperación.');
      }
    },
  }),

  cambiarContrasena: defineAction({
    input: cambiarContrasenaSchema,
    handler: async (input) => {
      try {
        return await cambiarContrasenaHandler(input);
      } catch (error: any) {
        throw new Error(error.message || 'Error al actualizar la contraseña.');
      }
    },
  }),
};