import { createAuthAuditSynchronizer, createAuthEventRecorder } from './auth-audit.ts';
import { auditHeaders, withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
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
  auditKey?: string;
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
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.supabaseUrl);
  const recordEvent=createAuthEventRecorder({...options,fetchImpl});
  const synchronize=createAuthAuditSynchronizer({...options,fetchImpl});
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');
  async function checkGuestAccess(accessToken: string): Promise<void> {
    let response: Response;
    try { response = await fetchImpl(`${baseUrl}/rest/v1/rpc/validar_acceso_invitado`, {
      method: 'POST', headers: { apikey: options.anonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(10000),
    }); } catch { throw new ServiceError('SUPABASE_AUTH_NO_DISPONIBLE', 'No fue posible verificar la vigencia del acceso.', 503); }
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
      try {
        const session = validSession(await request('/token?grant_type=password', {
          method: 'POST', body: JSON.stringify({ email: input.correo, password: input.password }),
        }));
        await checkGuestAccess(session.access_token);
        await recordEvent('login_backend',session.user.id);
        await synchronize(session.user.id);
        return session;
      } catch(error) {
        if(error instanceof ServiceError && error.code==='SUPABASE_AUTH_ERROR' && error.status>=400 && error.status<500) {
          if(!options.auditKey) throw new ServiceError('AUDITORIA_NO_DISPONIBLE','Falta configurar el registro seguro de autenticación.',503);
          const context=auditHeaders();
          let audit:Response;
          try {
            audit=await fetchImpl(`${baseUrl}/rest/v1/rpc/registrar_intento_autenticacion`,{
              method:'POST',headers:{apikey:options.auditKey,authorization:`Bearer ${options.auditKey}`,'content-type':'application/json'},
              body:JSON.stringify({p_request_id:context['x-fge-request-id']??null,p_ip:context['x-fge-ip-origen']??null,p_codigo:error.status}),
              signal:AbortSignal.timeout(10000),redirect:'error',
            });
          } catch {throw new ServiceError('AUDITORIA_NO_DISPONIBLE','No fue posible registrar el intento de autenticación.',503);}
          if(!audit.ok) throw new ServiceError('AUDITORIA_NO_DISPONIBLE','No fue posible registrar el intento de autenticación.',503);
        }
        throw error;
      }
    },


    async requestPasswordRecovery(input: RecoveryInput, redirectTo: string) {
      const redirect = encodeURIComponent(redirectTo);
      await request(`/recover?redirect_to=${redirect}`, {
        method: 'POST',
        body: JSON.stringify({ email: input.correo }),
      });
      await recordEvent('recuperacion_solicitada');
      await synchronize();
    },

    async changePassword(accessToken: string, password: string) {
      const user = validUser(await request('/user', {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }, accessToken));
      await recordEvent('password_backend',user.id);
      await synchronize(user.id);
      return user;
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
      await recordEvent('refresh_backend',session.user.id);
      await synchronize(session.user.id);
      return session;
    },

    async logout(accessToken: string) {
      const user=validUser(await request('/user',{method:'GET'},accessToken));
      await request('/logout?scope=local', { method: 'POST', body: '{}' }, accessToken);
      await recordEvent('logout_backend',user.id);
      await synchronize(user.id);
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
  return createSupabaseAuthRepository({ supabaseUrl, anonKey, auditKey:process.env.SUPABASE_SERVICE_ROLE_KEY });
}
