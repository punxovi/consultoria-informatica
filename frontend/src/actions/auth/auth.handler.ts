import { supabase } from '../../lib/supabase';
import type { SolicitarRecuperacionInput, CambiarContrasenaInput } from './auth.schema';

export async function solicitarRecuperacionHandler(data: SolicitarRecuperacionInput, originUrl?: string) {
  const redirectUrl = originUrl ? `${originUrl}/cambiar-contrasena` : 'http://localhost:4321/cambiar-contrasena';

  const { error } = await supabase.auth.resetPasswordForEmail(data.correo, {
    redirectTo: redirectUrl,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true, message: 'Correo de recuperación enviado exitosamente.' };
}

export async function cambiarContrasenaHandler(data: CambiarContrasenaInput) {
  const { error } = await supabase.auth.updateUser({
    password: data.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true, message: 'Contraseña actualizada exitosamente.' };
}