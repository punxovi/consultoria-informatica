import { supabase } from '../../lib/supabase';
import type { SolicitarRecuperacionInput, CambiarContrasenaInput, LoginInput } from './auth.schema';

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

export async function loginHandler(data: LoginInput) {
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: data.correo,
    password: data.password,
  });

  if (error || !authData.session) {
    throw new Error('Credenciales incorrectas o acceso no autorizado.');
  }

  return { success: true, session: authData.session };
}