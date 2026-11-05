import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface QuoteRequestsApplication {
  list(token: string): Promise<unknown[]>;
  updateStatus(token: string, id: string, version: number, status: string): Promise<unknown>;
}

export function createQuoteRequestsApplication(options: { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }): QuoteRequestsApplication {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.supabaseUrl.replace(/\/$/, '');
  async function rpc(name: string, token: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: {
        apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json',
      }, body: JSON.stringify(body ?? {}) });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }
    let result: unknown = null;
    try { result = await response.json(); } catch { /* respuesta vacía */ }
    if (!response.ok) {
      const code = result && typeof result === 'object' ? String((result as Record<string, unknown>).code ?? '') : '';
      if (response.status === 401 || response.status === 403 || code === '42501') throw new ServiceError('SIN_PERMISO', 'No tienes permiso para consultar estas solicitudes.', 403);
      if (code === 'P0001') throw new ServiceError('CONFLICTO_CONCURRENCIA', 'La solicitud cambió. Recarga la bandeja antes de actualizarla.', 409);
      if (code === '22023') throw new ServiceError('DATOS_INVALIDOS', 'El estado indicado no es válido.', 400);
      if (['PGRST202', '42883'].includes(code)) throw new ServiceError('MIGRACION_PENDIENTE', 'La base de datos requiere la migración de solicitudes de cotización.', 503);
      throw new ServiceError('SOLICITUD_NO_PROCESADA', 'No fue posible procesar la solicitud de cotización.', response.status >= 500 ? 503 : response.status);
    }
    return result;
  }
  return {
    async list(token) {
      const result = await rpc('consultar_solicitudes_cotizacion', token);
      if (!Array.isArray(result)) throw new ServiceError('RESPUESTA_INVALIDA', 'La bandeja devolvió una respuesta inválida.', 502);
      return result;
    },
    updateStatus(token, id, version, status) {
      return rpc('actualizar_estado_solicitud_cotizacion', token, {
        p_id_solicitud: id, p_version_esperada: version, p_estado: status,
      });
    },
  };
}
