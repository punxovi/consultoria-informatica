export interface ApiSuccess<T> {
  ok: true;
  code: string;
  message: string;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: { code: string; message: string; requestId?: string; fields?: Record<string, string[]> };
  data: null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly fields?: Record<string, string[]>;

  constructor(code: string, message: string, status: number, requestId?: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.fields = fields;
  }
}

export interface ApiTransport {
  request<T>(
    path: string,
    options?: { method?: string; body?: unknown; accessToken?: string; headers?: Record<string, string> },
  ): Promise<ApiSuccess<T>>;
}

function territorioActivo(): string | null {
  try {
    const valor = typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem('fge.territorio.activo');
    return valor?.trim() || null;
  } catch {
    return null;
  }
}

export function createApiTransport(apiBaseUrl: string, fetchImpl: typeof fetch = fetch): ApiTransport {
  const baseUrl = apiBaseUrl.replace(/\/$/, '');
  return {
    async request<T>(
      path: string,
      options: { method?: string; body?: unknown; accessToken?: string; headers?: Record<string, string> } = {},
    ): Promise<ApiSuccess<T>> {
      let response: Response;
      const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const territorio = territorioActivo();
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            ...(options.body !== undefined && !multipart ? { 'content-type': 'application/json' } : {}),
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
            ...(territorio ? { 'x-territory-id': territorio } : {}),
            ...options.headers,
          },
          ...(options.body !== undefined ? { body: multipart ? options.body as FormData : JSON.stringify(options.body) } : {}),
        });
      } catch {
        throw new ApiError('SERVICIO_NO_DISPONIBLE', 'No fue posible conectar con el servicio.', 0);
      }

      let payload: ApiSuccess<T> | ApiFailure;
      try {
        payload = await response.json() as ApiSuccess<T> | ApiFailure;
      } catch {
        throw new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió una respuesta inválida.', response.status);
      }
      if (!payload || typeof payload !== 'object' || typeof payload.ok !== 'boolean') {
        throw new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió una respuesta inválida.', response.status);
      }
      if (!response.ok || !payload.ok) {
        const failure = payload as ApiFailure;
        throw new ApiError(
          failure.error?.code ?? 'ERROR_API',
          failure.error?.message ?? 'No fue posible completar la operación.',
          response.status,
          failure.error?.requestId,
          failure.error?.fields,
        );
      }
      return payload;
    },
  };
}
