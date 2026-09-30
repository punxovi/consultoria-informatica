import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface AuthUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: AuthUser;
}

export interface LoginInput {
  correo: string;
  password: string;
}

export interface RecoveryInput {
  correo: string;
}

export interface PasswordChangeInput {
  password: string;
  confirmPassword: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface AuthRepository {
  login(input: LoginInput): Promise<AuthSession>;
  requestPasswordRecovery(input: RecoveryInput, redirectTo: string): Promise<void>;
  changePassword(accessToken: string, password: string): Promise<AuthUser>;
  getUser(accessToken: string): Promise<AuthUser>;
  refreshSession(refreshToken: string): Promise<AuthSession>;
  logout(accessToken: string): Promise<void>;
}

function objectInput(value: unknown, allowedKeys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError('DATOS_INVALIDOS', 'La solicitud debe contener un objeto JSON.', 400);
  }

  const object = value as Record<string, unknown>;
  const extraKey = Object.keys(object).find((key) => !allowedKeys.includes(key));
  if (extraKey) {
    throw new ServiceError('DATOS_INVALIDOS', `El campo ${extraKey} no está permitido.`, 400);
  }
  return object;
}

function email(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ServiceError('DATOS_INVALIDOS', 'El correo debe ser texto.', 400);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ServiceError('DATOS_INVALIDOS', 'El correo debe tener un formato válido.', 400);
  }
  return normalized;
}

function requiredString(value: unknown, field: string, minimum = 1, maximum = 4096): string {
  if (typeof value !== 'string') {
    throw new ServiceError('DATOS_INVALIDOS', `${field} debe ser texto.`, 400);
  }
  if (value.length < minimum || value.length > maximum) {
    throw new ServiceError(
      'DATOS_INVALIDOS',
      `${field} debe tener entre ${minimum} y ${maximum} caracteres.`,
      400,
    );
  }
  return value;
}

export function parseLoginInput(value: unknown): LoginInput {
  const input = objectInput(value, ['correo', 'password']);
  return {
    correo: email(input.correo),
    password: requiredString(input.password, 'La contraseña', 1, 128),
  };
}

export function parseRecoveryInput(value: unknown): RecoveryInput {
  const input = objectInput(value, ['correo']);
  return { correo: email(input.correo) };
}

export function parsePasswordChangeInput(value: unknown): PasswordChangeInput {
  const input = objectInput(value, ['password', 'confirmPassword']);
  const password = requiredString(input.password, 'La contraseña', 8, 128);
  const confirmPassword = requiredString(input.confirmPassword, 'La confirmación', 8, 128);
  if (password !== confirmPassword) {
    throw new ServiceError('DATOS_INVALIDOS', 'Las contraseñas no coinciden.', 400);
  }
  return { password, confirmPassword };
}

export function parseRefreshInput(value: unknown): RefreshInput {
  const input = objectInput(value, ['refreshToken']);
  return { refreshToken: requiredString(input.refreshToken, 'El token de renovación', 10, 8192) };
}
