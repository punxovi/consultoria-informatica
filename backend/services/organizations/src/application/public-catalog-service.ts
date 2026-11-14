import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { createQuoteRepository } from '../infrastructure/supabase-quote-requests.repository.ts';
import type { PublicQuoteRequest } from '../domain/quote-requests.ts';
import { parseCatalogFilters } from '../domain/products.ts';
export type { PublicQuoteRequest } from '../domain/quote-requests.ts';

export interface PublicCatalogItem {
  id_producto: string;
  nombre: string;
  descripcion: string;
  unidad_medida: string;
  tipo_item: 'producto' | 'servicio';
  caracteristicas: unknown;
  organizacion: { id_organizacion: string; nombre: string; pais: { id_pais: string; nombre: string } | null };
  imagenes?: Array<{ id_archivo: string }>;
}

export interface PublicCatalogImage { bytes: Buffer; mimeType: string }

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PublicCatalogApplication {
  list(filters?: { id_pais?: string; id_organizacion?: string }): Promise<PublicCatalogItem[]>;
  image(id: string): Promise<PublicCatalogImage>;
  createQuote(input: PublicQuoteRequest): Promise<{ id_solicitud: string; estado: string; id_envio?:string; solicitudes?:Array<{id_solicitud:string;estado:string}> }>;
}

export function createPublicCatalogApplication(options: { supabaseUrl: string; anonKey: string; serverKey?: string; fetchImpl?: typeof fetch }): PublicCatalogApplication {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.supabaseUrl.replace(/\/$/, '');
  const quotes=createQuoteRepository(options);
  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try { response = await fetchImpl(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: options.anonKey, 'content-type': 'application/json', ...init.headers },
    }); } catch { throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible consultar el catálogo.', 503); }
    let body: unknown = null;
    try { body = await response.json(); } catch { /* respuesta vacía */ }
    if (!response.ok) {
      throw new ServiceError('SOLICITUD_NO_PROCESADA', 'No fue posible procesar la solicitud.', response.status >= 500 ? 503 : 400);
    }
    return body;
  }
  return {
    async list(filters = {}) {
      const valid = parseCatalogFilters(new URLSearchParams(Object.entries(filters).filter(([,value]) => value !== undefined) as [string,string][]));
      const query = (select: string) => {
        const params = new URLSearchParams({ select, order: 'nombre.asc,id_producto.asc' });
        // PostgREST aplica los predicados en SQL antes de max-rows/Range.
        if (valid.id_organizacion) params.set('organizacion->>id_organizacion', `eq.${valid.id_organizacion}`);
        if (valid.id_pais) params.set('organizacion->pais->>id_pais', `eq.${valid.id_pais}`);
        return `catalogo_cotizacion_publico?${params}`;
      };
      const campos = 'id_producto,nombre,descripcion,unidad_medida,tipo_item,caracteristicas,organizacion';
      let body: unknown;
      // Sin la migración de imágenes la columna no existe: el catálogo sigue disponible sin fotos.
      try { body = await call(query(`${campos},imagenes`)); }
      catch (error) {
        if (!(error instanceof ServiceError) || error.status !== 400) throw error;
        body = await call(query(campos));
      }
      if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'El catálogo no está disponible.', 502);
      return body as PublicCatalogItem[];
    },
    async image(id) {
      const unavailable = () => new ServiceError('IMAGEN_NO_ENCONTRADA', 'La imagen no está disponible.', 404);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw unavailable();
      const key = options.serverKey?.trim();
      if (!key) throw new ServiceError('IMAGENES_NO_CONFIGURADAS', 'Las imágenes del catálogo no están disponibles.', 503);
      const headers: Record<string, string> = { apikey: key };
      if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
      const request = async (path: string, init: RequestInit = {}) => {
        try {
          return await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000) });
        } catch { throw new ServiceError('IMAGENES_NO_DISPONIBLES', 'No fue posible obtener la imagen.', 503); }
      };
      const resolved = await request('/rest/v1/rpc/obtener_imagen_producto_publica', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_id: id }),
      });
      if (!resolved.ok) throw new ServiceError('IMAGENES_NO_DISPONIBLES', 'No fue posible obtener la imagen.', 503);
      const rows: unknown = await resolved.json().catch(() => null);
      if (!Array.isArray(rows) || rows.length !== 1) throw unavailable();
      const file = rows[0] as { bucket_id?: unknown; ruta_objeto?: unknown; mime_type?: unknown; tamano_bytes?: unknown };
      if (file.bucket_id !== 'fge-archivos' || typeof file.ruta_objeto !== 'string' || !file.ruta_objeto.startsWith('productos/')
        || typeof file.mime_type !== 'string' || !IMAGE_TYPES.has(file.mime_type)) throw unavailable();
      const path = file.ruta_objeto.split('/').map(encodeURIComponent).join('/');
      const download = await request(`/storage/v1/object/authenticated/fge-archivos/${path}`);
      if (!download.ok) {
        if (download.status === 400 || download.status === 404) throw unavailable();
        throw new ServiceError('IMAGENES_NO_DISPONIBLES', 'No fue posible obtener la imagen.', 503);
      }
      const bytes = Buffer.from(await download.arrayBuffer());
      if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) throw unavailable();
      return { bytes, mimeType: file.mime_type };
    },
    async createQuote(input) {
      return await quotes.execute('create',input,undefined,true) as {id_solicitud:string;estado:string;id_envio:string;solicitudes:Array<{id_solicitud:string;estado:string}>};
    },
  };
}
