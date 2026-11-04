import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface PublicCatalogItem {
  id_producto: string;
  nombre: string;
  descripcion: string;
  unidad_medida: string;
  tipo_item: 'producto' | 'servicio';
  caracteristicas: unknown;
}

export interface PublicQuoteRequest {
  nombre_solicitante: string;
  correo: string;
  telefono?: string;
  mensaje?: string;
  items: Array<{ id_producto: string; cantidad: number }>;
}

export interface PublicCatalogApplication {
  list(): Promise<PublicCatalogItem[]>;
  createQuote(input: PublicQuoteRequest): Promise<{ id_solicitud: string; estado: string }>;
}

export function createPublicCatalogApplication(options: { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }): PublicCatalogApplication {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.supabaseUrl.replace(/\/$/, '');
  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: options.anonKey, authorization: `Bearer ${options.anonKey}`, 'content-type': 'application/json', ...init.headers },
    });
    let body: unknown = null;
    try { body = await response.json(); } catch { /* respuesta vacía */ }
    if (!response.ok) {
      throw new ServiceError('SOLICITUD_NO_PROCESADA', 'No fue posible procesar la solicitud.', response.status >= 500 ? 503 : 400);
    }
    return body;
  }
  return {
    async list() {
      const body = await call('catalogo_cotizacion_publico?select=id_producto,nombre,descripcion,unidad_medida,tipo_item,caracteristicas&order=nombre.asc');
      if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'El catálogo no está disponible.', 502);
      return body as PublicCatalogItem[];
    },
    async createQuote(input) {
      const body = await call('rpc/registrar_solicitud_cotizacion', { method: 'POST', body: JSON.stringify({ p_datos: input }) });
      const result = Array.isArray(body) ? body[0] : body;
      if (!result || typeof result.id_solicitud !== 'string') throw new ServiceError('RESPUESTA_INVALIDA', 'La solicitud no fue confirmada.', 502);
      return result as { id_solicitud: string; estado: string };
    },
  };
}
