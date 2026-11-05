import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { randomUUID } from 'node:crypto';

export interface ProductInput {
  id_organizacion: string; nombre: string; descripcion: string; unidad_medida: string;
  categoria: string | null; material: string | null; terminacion: string | null;
}
export interface ProductUpload { name: string; mimeType: string; bytes: Buffer }
export interface ProductsApplication {
  list(token: string): Promise<unknown[]>;
  create(token: string, input: ProductInput): Promise<unknown>;
  update(token: string, id: string, version: number, changes: Partial<ProductInput> & { publicado?: boolean }): Promise<unknown>;
  uploadImages(token: string, id: string, files: ProductUpload[]): Promise<unknown[]>;
}

const PRODUCT_FIELDS = 'id_producto,id_organizacion,nombre,descripcion,unidad_medida,categoria,material_terminacion,publicado,version,updated_at';
const IMAGE_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
function imageSignatureMatches(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return mimeType === 'image/webp' && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export function createProductsApplication(options: { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }): ProductsApplication {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.supabaseUrl.replace(/\/$/, '');
  async function call(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/rest/v1/${path}`, { ...init, headers: {
        apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers,
      } });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }
    let body: unknown = null;
    try { body = await response.json(); } catch { /* sin contenido */ }
    if (!response.ok) {
      const detail = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      if (response.status === 401 || response.status === 403) throw new ServiceError('SIN_PERMISO', 'No tienes permiso para gestionar productos.', response.status);
      if (detail.code === '23505' || detail.code === 'P0001') throw new ServiceError('CONFLICTO_CONCURRENCIA', 'El producto cambió en otra sesión. Recarga antes de volver a intentarlo.', 409);
      if (['23502', '23503', '23514', '22P02'].includes(String(detail.code))) {
        if (path.startsWith('archivos?')) {
          const motivo = typeof detail.message === 'string' ? detail.message : 'la base de datos rechazó sus metadatos';
          throw new ServiceError('IMAGEN_RECHAZADA', `Supabase rechazó el registro de la imagen: ${motivo}`, 400);
        }
        throw new ServiceError('DATOS_INVALIDOS', 'Los datos del producto no son válidos o su Organización no está disponible.', 400);
      }
      throw new ServiceError('SOLICITUD_NO_PROCESADA', 'No fue posible procesar el producto.', response.status >= 500 ? 503 : response.status);
    }
    return body;
  }
  async function requireAdmin(token: string) {
    const body = await call('rpc/get_user_roles', token, { method: 'POST', body: '{}' });
    if (!Array.isArray(body) || !body.some((item) => item && typeof item === 'object' && (item as Record<string, unknown>).codigo === 'ADMIN')) {
      throw new ServiceError('SIN_PERMISO', 'Solo el Administrador puede gestionar los productos de cotización.', 403);
    }
  }
  async function enrich(token: string, rows: unknown[]): Promise<unknown[]> {
    const products = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
    if (!products.length) return [];
    const orgIds = [...new Set(products.map((p) => String(p.id_organizacion)))];
    const orgs = await call(`organizaciones?select=id_organizacion,nombre,id_pais&id_organizacion=in.(${orgIds.join(',')})&archived_at=is.null`, token);
    const orgRows = Array.isArray(orgs) ? orgs as Record<string, unknown>[] : [];
    const countryIds = [...new Set(orgRows.map((o) => String(o.id_pais)).filter(Boolean))];
    const countries = countryIds.length ? await call(`paises?select=id_pais,codigo_iso,nombre&id_pais=in.(${countryIds.join(',')})&archived_at=is.null`, token) : [];
    const countryById = new Map((Array.isArray(countries) ? countries as Record<string, unknown>[] : []).map((c) => [String(c.id_pais), c]));
    const orgById = new Map(orgRows.map((o) => [String(o.id_organizacion), o]));
    const imageData = await call(`archivos?select=id_archivo,id_producto,nombre_original,ruta_objeto&categoria=eq.imagen_producto&estado_carga=eq.disponible&archived_at=is.null&id_producto=in.(${products.map((p) => p.id_producto).join(',')})&order=created_at.asc`, token);
    const images = Array.isArray(imageData) ? imageData as Record<string, unknown>[] : [];
    const imagesByProduct = new Map<string, unknown[]>();
    for (const image of images) {
      const id = String(image.id_producto);
      const list = imagesByProduct.get(id) ?? [];
      list.push({ id_archivo: image.id_archivo, nombre_archivo: image.nombre_original, url: null });
      imagesByProduct.set(id, list);
    }
    return products.map((p) => {
      const org = orgById.get(String(p.id_organizacion));
      const country = org ? countryById.get(String(org.id_pais)) : null;
      return { ...p, material: p.material_terminacion ?? null, terminacion: null,
        organizacion: org ? { id_organizacion: org.id_organizacion, nombre: org.nombre,
          pais: country ? { id_pais: country.id_pais, codigo_iso: country.codigo_iso, nombre: country.nombre } : null } : null,
        imagenes: imagesByProduct.get(String(p.id_producto)) ?? [] };
    });
  }
  return {
    async list(token) {
      await requireAdmin(token);
      const rows = await call(`productos?select=${PRODUCT_FIELDS}&archived_at=is.null&order=nombre.asc`, token);
      if (!Array.isArray(rows)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió productos inválidos.', 502);
      return enrich(token, rows);
    },
    async create(token, input) {
      await requireAdmin(token);
      const rows = await call(`productos?select=${PRODUCT_FIELDS}`, token, { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({
        id_organizacion: input.id_organizacion, nombre: input.nombre, descripcion: input.descripcion, unidad_medida: input.unidad_medida,
        categoria: input.categoria, material_terminacion: [input.material, input.terminacion].filter(Boolean).join(' · ') || null, publicado: false,
      }) });
      if (!Array.isArray(rows) || !rows[0]) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos no confirmó el producto.', 502);
      return (await enrich(token, rows))[0];
    },
    async update(token, id, version, changes) {
      await requireAdmin(token);
      const body: Record<string, unknown> = {};
      for (const key of ['nombre', 'descripcion', 'unidad_medida', 'categoria'] as const) if (key in changes) body[key] = changes[key];
      if ('material' in changes || 'terminacion' in changes) {
        const material = changes.material ?? null; const terminacion = changes.terminacion ?? null;
        body.material_terminacion = [material, terminacion].filter(Boolean).join(' · ') || null;
      }
      if ('publicado' in changes) body.publicado = changes.publicado;
      if (!Object.keys(body).length) throw new ServiceError('DATOS_INVALIDOS', 'Indica al menos un cambio.', 400);
      body.version = version + 1;
      const rows = await call(`productos?id_producto=eq.${encodeURIComponent(id)}&version=eq.${version}&archived_at=is.null&select=${PRODUCT_FIELDS}`, token, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (!Array.isArray(rows) || !rows[0]) throw new ServiceError('CONFLICTO_CONCURRENCIA', 'El producto cambió o ya no está disponible. Recarga antes de volver a intentarlo.', 409);
      return (await enrich(token, rows))[0];
    },
    async uploadImages(token, id, files) {
      await requireAdmin(token);
      if (!files.length || files.length > 6) throw new ServiceError('DATOS_INVALIDOS', 'Selecciona entre 1 y 6 imágenes.', 400);
      const result = [];
      for (const file of files) {
        const extension = IMAGE_TYPES.get(file.mimeType);
        if (!extension || file.bytes.length < 1 || file.bytes.length > 5 * 1024 * 1024 || !imageSignatureMatches(file.bytes, file.mimeType)) throw new ServiceError('ARCHIVO_INVALIDO', 'Cada imagen debe ser JPG, PNG o WebP válida de hasta 5 MB.', 400);
        const path = `productos/${id}/${randomUUID()}.${extension}`;
        const rows = await call(`archivos?select=id_archivo,nombre_original,ruta_objeto`, token, { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({
          id_producto: id, bucket_id: 'fge-archivos', ruta_objeto: path, nombre_original: file.name.slice(0, 255), mime_type: file.mimeType,
          tamano_bytes: file.bytes.length, categoria: 'imagen_producto', estado_carga: 'reservado',
        }) });
        if (!Array.isArray(rows) || !rows[0]) throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible reservar la imagen.', 502);
        const reserved = rows[0] as Record<string, unknown>;
        const upload = await fetchImpl(`${base}/storage/v1/object/fge-archivos/${path}`, { method: 'POST', headers: {
          apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': file.mimeType, 'x-upsert': 'false',
        }, body: file.bytes });
        if (!upload.ok) {
          await call(`archivos?id_archivo=eq.${reserved.id_archivo}`, token, { method: 'PATCH', body: JSON.stringify({ estado_carga: 'fallido' }) }).catch(() => null);
          throw new ServiceError('ERROR_STORAGE', 'Falló la carga de una imagen. Puedes volver a intentarlo.', 502);
        }
        await call(`archivos?id_archivo=eq.${reserved.id_archivo}`, token, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify({ estado_carga: 'disponible' }) });
        result.push({ id_archivo: reserved.id_archivo, nombre_archivo: reserved.nombre_original, url: null });
      }
      return result;
    },
  };
}
