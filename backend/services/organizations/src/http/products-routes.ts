import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ProductsApplication, ProductInput } from '../application/products-service.ts';
import { readJsonBody, readMultipartBody } from './body.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string) {
  response.statusCode = status; response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store'); response.setHeader('x-request-id', requestId); response.end(JSON.stringify(body));
}
function tokenFrom(request: IncomingMessage): string {
  const value = request.headers.authorization;
  const context = authContext(Array.isArray(value) ? value[0] : value);
  if (!context.accessToken) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión para realizar esta operación.', 401);
  return context.accessToken;
}
function input(value: unknown): ProductInput {
  if (!value || typeof value !== 'object') throw new ServiceError('DATOS_INVALIDOS', 'Los datos del producto no son válidos.', 400);
  const row = value as Record<string, unknown>;
  const max = (key: string, size: number, required = false): string | null => {
    const v = row[key];
    if (v === null || v === undefined || v === '') { if (required) throw new ServiceError('DATOS_INVALIDOS', `Completa el campo ${key}.`, 400); return null; }
    if (typeof v !== 'string' || v.trim().length > size) throw new ServiceError('DATOS_INVALIDOS', `El campo ${key} no es válido.`, 400);
    const trimmed = v.trim(); if (required && !trimmed) throw new ServiceError('DATOS_INVALIDOS', `Completa el campo ${key}.`, 400); return trimmed || null;
  };
  const id = max('id_organizacion', 64, true)!;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError('DATOS_INVALIDOS', 'Selecciona una Organización válida.', 400);
  return { id_organizacion: id, nombre: max('nombre', 150, true)!, descripcion: max('descripcion', 2000, true)!,
    unidad_medida: max('unidad_medida', 50, true)!, categoria: max('categoria', 80), material: max('material', 80), terminacion: max('terminacion', 80) };
}
export async function routeProducts(request: IncomingMessage, response: ServerResponse, requestId: string, application: ProductsApplication) {
  try {
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    const token = tokenFrom(request);
    if (request.method === 'GET' && url.pathname === '/v1/products') {
      respond(response, 200, success('PRODUCTOS_LISTADOS', 'Productos consultados.', { products: await application.list(token) }), requestId); return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/products') {
      const product = await application.create(token, input(await readJsonBody(request)));
      respond(response, 201, success('PRODUCTO_CREADO', 'Producto creado.', { product }), requestId); return;
    }
    const match = url.pathname.match(/^\/v1\/products\/([0-9a-f-]{36})(?:\/(images))?$/i);
    if (match && match[2] === 'images' && request.method === 'POST') {
      const form = await readMultipartBody(request);
      const files = form.getAll('imagenes').filter((entry): entry is File => entry instanceof File);
      const parsed = await Promise.all(files.map(async (file) => ({ name: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) })));
      const images = await application.uploadImages(token, match[1], parsed);
      respond(response, 201, success('IMAGENES_CARGADAS', 'Imágenes cargadas.', { imagenes: images }), requestId); return;
    }
    if (match && !match[2] && request.method === 'PATCH') {
      const value = await readJsonBody(request) as Record<string, unknown>;
      if (!Number.isSafeInteger(value?.version_esperada) || Number(value.version_esperada) < 1 || !value.cambios || typeof value.cambios !== 'object') {
        throw new ServiceError('DATOS_INVALIDOS', 'La versión o los cambios del producto no son válidos.', 400);
      }
      const raw = value.cambios as Record<string, unknown>;
      const changes: Partial<ProductInput> & { publicado?: boolean } = {};
      if ('nombre' in raw || 'descripcion' in raw || 'unidad_medida' in raw || 'categoria' in raw || 'material' in raw || 'terminacion' in raw) {
        const normalized = input({ id_organizacion: '00000000-0000-4000-8000-000000000000', nombre: raw.nombre ?? 'x', descripcion: raw.descripcion ?? 'x', unidad_medida: raw.unidad_medida ?? 'x', categoria: raw.categoria, material: raw.material, terminacion: raw.terminacion });
        for (const key of ['nombre', 'descripcion', 'unidad_medida', 'categoria', 'material', 'terminacion'] as const) if (key in raw) changes[key] = normalized[key] as never;
      }
      if ('publicado' in raw) { if (typeof raw.publicado !== 'boolean') throw new ServiceError('DATOS_INVALIDOS', 'El estado de publicación no es válido.', 400); changes.publicado = raw.publicado; }
      const product = await application.update(token, match[1], Number(value.version_esperada), changes);
      respond(response, 200, success('PRODUCTO_ACTUALIZADO', 'Producto actualizado.', { product }), requestId); return;
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const e = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, e.status, failure(e.code, e.message, requestId), requestId);
  }
}
