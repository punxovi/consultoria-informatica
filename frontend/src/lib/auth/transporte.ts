interface ApiSuccess<T> {
  ok: true;
  code: string;
  message: string;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
  data: null;
}

export class AuthApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export interface AuthTransport {
  request<T>(
    path: string,
    options?: { method?: string; body?: unknown; accessToken?: string },
  ): Promise<ApiSuccess<T>>;
}

export function createAuthTransport(
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): AuthTransport {
  const baseUrl = apiBaseUrl.replace(/\/$/, '');

  return {
    async request<T>(
      path: string,
      options: { method?: string; body?: unknown; accessToken?: string } = {},
    ): Promise<ApiSuccess<T>> {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch {
        throw new AuthApiError(
          'AUTH_NO_DISPONIBLE',
          'No fue posible conectar con el servicio de autenticación.',
          0,
        );
      }

      let payload: ApiSuccess<T> | ApiFailure;
      try {
        payload = await response.json() as ApiSuccess<T> | ApiFailure;
      } catch {
        throw new AuthApiError(
          'RESPUESTA_INVALIDA',
          'El servicio de autenticación devolvió una respuesta inválida.',
          response.status,
        );
      }

      if (!response.ok || !payload.ok) {
        const failure = payload as ApiFailure;
        throw new AuthApiError(
          failure.error?.code ?? 'AUTH_ERROR',
          failure.error?.message ?? 'No fue posible completar la operación.',
          response.status,
          failure.error?.requestId,
        );
      }

      return payload;
    },
  };
}
