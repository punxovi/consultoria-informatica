import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type {
  AuthRepository,
  AuthSession,
  AuthUser,
  LoginInput,
  RecoveryInput,
} from '../domain/auth.ts';

interface RepositoryOptions {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return asRecord(await response.json());
  } catch {
    return {};
  }
}

function validSession(value: Record<string, unknown>): AuthSession {
  if (
    typeof value.access_token !== 'string' ||
    typeof value.refresh_token !== 'string' ||
    typeof value.expires_in !== 'number' ||
    typeof value.token_type !== 'string' ||
    !value.user ||
    typeof value.user !== 'object'
  ) {
    throw new ServiceError('RESPUESTA_AUTH_INVALIDA', 'Supabase devolvió una sesión inválida.', 502);
  }
  return value as unknown as AuthSession;
}

function validUser(value: Record<string, unknown>): AuthUser {
  if (typeof value.id !== 'string') {
    throw new ServiceError('RESPUESTA_AUTH_INVALIDA', 'Supabase devolvió un usuario inválido.', 502);
  }
  return value as AuthUser;
}

export function createSupabaseAuthRepository(options: RepositoryOptions): AuthRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');
  async function checkGuestAccess(accessToken: string): Promise<void> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/rpc/validar_acceso_invitado`, {
        method: 'POST', headers: { apikey: options.anonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceError('SUPABASE_AUTH_NO_DISPONIBLE', 'No fue posible verificar la vigencia del acceso.', 503);
    }
    if (!response.ok) throw new ServiceError('SUPABASE_AUTH_NO_DISPONIBLE', 'No fue posible verificar la vigencia del acceso.', 503);
    if (await response.json() !== true) throw new ServiceError('SESION_INVALIDA', 'El acceso fue revocado o expiró.', 401);
  }

  async function request(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/auth/v1${path}`, {
        ...init,
        headers: {
          apikey: options.anonKey,
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_AUTH_NO_DISPONIBLE', 'No fue posible conectar con Supabase Auth.', 503, error);
    }

    const body = await responseBody(response);
    if (!response.ok) {
      throw new ServiceError('SUPABASE_AUTH_ERROR', 'Supabase Auth rechazó la solicitud.', response.status, body);
    }
    return body;
  }

  return {
    async login(input: LoginInput) {
      let body: Record<string, unknown>;
      try {
        body = await request('/token?grant_type=password', {
          method: 'POST',
          body: JSON.stringify({ email: input.correo, password: input.password }),
        });
      } catch (error) {
        // Login fallido (Llamada limpia a REST RPC)
        try {
          await fetchImpl(`${baseUrl.replace(/\/auth\/v1$/, '')}/rest/v1/rpc/registrar_evento_autenticacion`, {
            method: 'POST',
            headers: {
              apikey: options.anonKey,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ p_exitoso: false, p_detalles: { correo_intentado: input.correo } })
          });
        } catch (auditErr) {
          console.error('Error registrando auditoría de login fallido:', auditErr);
        }
        throw error;
      }

      // Login exitoso
      const session = validSession(body);
      await checkGuestAccess(session.access_token);
      try {
        await fetchImpl(`${baseUrl.replace(/\/auth\/v1$/, '')}/rest/v1/rpc/registrar_evento_autenticacion`, {
          method: 'POST',
          headers: {
            apikey: options.anonKey,
            authorization: `Bearer ${session.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ p_exitoso: true, p_detalles: { correo: input.correo } })
        });
      } catch (auditErr) {
        console.error('Error registrando auditoría de login exitoso:', auditErr);
      }

      return session;
    },


    async requestPasswordRecovery(input: RecoveryInput, redirectTo: string) {
      const redirect = encodeURIComponent(redirectTo);
      await request(`/recover?redirect_to=${redirect}`, {
        method: 'POST',
        body: JSON.stringify({ email: input.correo }),
      });
    },

    async changePassword(accessToken: string, password: string) {
      return validUser(await request('/user', {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }, accessToken));
    },

    async getUser(accessToken: string) {
      const user = validUser(await request('/user', { method: 'GET' }, accessToken));
      await checkGuestAccess(accessToken);
      return user;
    },

    async refreshSession(refreshToken: string) {
      const session = validSession(await request('/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }));
      await checkGuestAccess(session.access_token);
      return session;
    },

    async logout(accessToken: string) {
      await request('/logout?scope=local', { method: 'POST', body: '{}' }, accessToken);
    },
  };
}

function unconfiguredRepository(): AuthRepository {
  const unavailable = async (): Promise<never> => {
    throw new ServiceError(
      'CONFIGURACION_SUPABASE',
      'El servicio Auth no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.',
      503,
    );
  };
  return {
    login: unavailable,
    requestPasswordRecovery: unavailable,
    changePassword: unavailable,
    getUser: unavailable,
    refreshSession: unavailable,
    logout: unavailable,
  };
}

export function createSupabaseAuthRepositoryFromEnv(): AuthRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unconfiguredRepository();
  return createSupabaseAuthRepository({ supabaseUrl, anonKey });
}
