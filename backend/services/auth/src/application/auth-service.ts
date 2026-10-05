import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type {
  AuthRepository,
  AuthSession,
  AuthUser,
  LoginInput,
  PasswordChangeInput,
  RecoveryInput,
} from '../domain/auth.ts';

export interface AuthApplication {
  login(input: LoginInput): Promise<AuthSession>;
  requestRecovery(input: RecoveryInput): Promise<void>;
  changePassword(accessToken: string, input: PasswordChangeInput): Promise<AuthUser>;
  getSession(accessToken: string): Promise<{ authenticated: true; user: AuthUser }>;
  refreshSession(refreshToken: string): Promise<AuthSession>;
  logout(accessToken: string): Promise<void>;
}

function translated(error: unknown, operation: string): ServiceError {
  if (error instanceof ServiceError) {
    if (error.code === 'CONFIGURACION_SUPABASE') return error;
    if (error.status === 401 || error.status === 400) {
      if (operation === 'login') {
        return new ServiceError(
          'CREDENCIALES_INVALIDAS',
          'Credenciales incorrectas o acceso no autorizado.',
          401,
        );
      }
      return new ServiceError(
        'SESION_INVALIDA',
        'La sesión no es válida o ha expirado.',
        401,
      );
    }
    if (error.status === 429) {
      return new ServiceError(
        'DEMASIADAS_SOLICITUDES',
        'Se realizaron demasiadas solicitudes. Inténtalo nuevamente más tarde.',
        429,
      );
    }
  }

  return new ServiceError(
    'AUTH_NO_DISPONIBLE',
    'El servicio de autenticación no se encuentra disponible temporalmente.',
    503,
    error,
  );
}

export function createAuthApplication(
  repository: AuthRepository,
  recoveryRedirectUrl: string,
): AuthApplication {
  return {
    async login(input) {
      try {
        return await repository.login(input);
      } catch (error) {
        throw translated(error, 'login');
      }
    },

    async requestRecovery(input) {
      try {
        await repository.requestPasswordRecovery(input, recoveryRedirectUrl);
      } catch (error) {
        throw translated(error, 'recovery');
      }
    },

    async changePassword(accessToken, input) {
      try {
        return await repository.changePassword(accessToken, input.password);
      } catch (error) {
        throw translated(error, 'password-change');
      }
    },

    async getSession(accessToken) {
      try {
        return { authenticated: true, user: await repository.getUser(accessToken) };
      } catch (error) {
        throw translated(error, 'session');
      }
    },

    async refreshSession(refreshToken) {
      try {
        return await repository.refreshSession(refreshToken);
      } catch (error) {
        throw translated(error, 'refresh');
      }
    },

    async logout(accessToken) {
      try {
        await repository.logout(accessToken);
      } catch (error) {
        if (error instanceof ServiceError && (error.status === 401 || error.status === 403)) return;
        throw translated(error, 'logout');
      }
    },
  };
}
