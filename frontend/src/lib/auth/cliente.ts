import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase';
import { AuthApiError, createAuthTransport } from './transporte';

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createAuthTransport(API_BASE_URL);

interface SessionData {
  session: Session;
}

interface VerifiedSessionData {
  authenticated: true;
  user: User;
}

async function localSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    throw new AuthApiError('AUTH_NO_DISPONIBLE', 'No fue posible consultar la sesión local.', 0);
  }
  return data.session;
}

async function saveSession(session: Session): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error || !data.session) {
    throw new AuthApiError(
      'SESION_LOCAL_INVALIDA',
      'No fue posible guardar la sesión en el navegador.',
      500,
    );
  }
  document.cookie = `fge_access_token=${encodeURIComponent(data.session.access_token)}; Path=/; SameSite=Lax; Max-Age=${Math.max(60, data.session.expires_in ?? 3600)}`;
  return data.session;
}

export async function iniciarSesion(correo: string, password: string): Promise<Session> {
  const result = await transport.request<SessionData>('/api/v1/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  return saveSession(result.data.session);
}

export async function solicitarRecuperacion(correo: string): Promise<void> {
  await transport.request('/api/v1/auth/password/recovery', {
    method: 'POST',
    body: { correo },
  });
}

export async function prepararSesionRecuperacion(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return false;
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return false;
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  return Boolean(await localSession());
}

export async function cambiarContrasena(password: string, confirmPassword: string): Promise<void> {
  const session = await localSession();
  if (!session) {
    throw new AuthApiError(
      'SESION_REQUERIDA',
      'El enlace de recuperación no es válido o ha expirado.',
      401,
    );
  }
  await transport.request('/api/v1/auth/password/change', {
    method: 'POST',
    accessToken: session.access_token,
    body: { password, confirmPassword },
  });
}

async function refreshSession(session: Session): Promise<Session | null> {
  try {
    const result = await transport.request<SessionData>('/api/v1/auth/session/refresh', {
      method: 'POST',
      body: { refreshToken: session.refresh_token },
    });
    return await saveSession(result.data.session);
  } catch (error) {
    if (error instanceof AuthApiError && (error.status === 400 || error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function verificarSesion(): Promise<boolean> {
  let session = await localSession();
  if (!session) return false;

  try {
    const result = await transport.request<VerifiedSessionData>('/api/v1/auth/session', {
      accessToken: session.access_token,
    });
    return result.data.authenticated === true;
  } catch (error) {
    if (!(error instanceof AuthApiError) || error.status !== 401) return true;
    session = await refreshSession(session);
    if (!session) return false;
    try {
      await transport.request<VerifiedSessionData>('/api/v1/auth/session', {
        accessToken: session.access_token,
      });
      return true;
    } catch (verificationError) {
      return !(verificationError instanceof AuthApiError) || verificationError.status !== 401;
    }
  }
}

export async function cerrarSesion(): Promise<void> {
  const supabase = getSupabaseClient();
  const session = await localSession().catch(() => null);
  try {
    if (session) {
      await transport.request('/api/v1/auth/logout', {
        method: 'POST',
        accessToken: session.access_token,
        body: {},
      });
    }
  } finally {
    await supabase.auth.signOut({ scope: 'local' });
    document.cookie = 'fge_access_token=; Path=/; Max-Age=0; SameSite=Lax';
  }
}

export { AuthApiError } from './transporte';
