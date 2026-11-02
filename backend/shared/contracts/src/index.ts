export const API_VERSION = 'v1' as const;
export const API_PREFIX = `/api/${API_VERSION}` as const;
export * from './coverages.contracts.ts';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  fields?: Record<string, string[]>;
}

export type ApiResponse<T> =
  | { ok: true; code: string; message: string; data: T }
  | { ok: false; error: ApiError; data: null };

export interface HealthData {
  service: string;
  status: 'ok';
  version: typeof API_VERSION;
  timestamp: string;
}

export function success<T>(code: string, message: string, data: T): ApiResponse<T> {
  return { ok: true, code, message, data };
}

export function failure(code: string, message: string, requestId?: string): ApiResponse<never> {
  return {
    ok: false,
    error: { code, message, ...(requestId ? { requestId } : {}) },
    data: null,
  };
}

export function health(service: string): ApiResponse<HealthData> {
  return success('SERVICIO_DISPONIBLE', 'El servicio está disponible.', {
    service,
    status: 'ok',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
  });
}
