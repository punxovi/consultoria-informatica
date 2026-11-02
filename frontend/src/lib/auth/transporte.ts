import { ApiError, createApiTransport } from '../api/transporte.ts';

export class AuthApiError extends ApiError {
  constructor(code: string, message: string, status: number, requestId?: string) {
    super(code, message, status, requestId);
    this.name = 'AuthApiError';
  }
}

export type AuthTransport = ReturnType<typeof createApiTransport>;

export function createAuthTransport(
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): AuthTransport {
  const transport = createApiTransport(apiBaseUrl, fetchImpl);
  return {
    async request<T>(
      path: string,
      options?: { method?: string; body?: unknown; accessToken?: string },
    ) {
      try {
        return await transport.request<T>(path, options);
      } catch (error) {
        if (error instanceof ApiError) {
          throw new AuthApiError(
            error.code === 'SERVICIO_NO_DISPONIBLE' ? 'AUTH_NO_DISPONIBLE' : error.code,
            error.code === 'SERVICIO_NO_DISPONIBLE'
              ? 'No fue posible conectar con el servicio de autenticación.'
              : error.message,
            error.status,
            error.requestId,
          );
        }
        throw error;
      }
    },
  };
}
