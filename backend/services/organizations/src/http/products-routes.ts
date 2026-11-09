import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ProductsApplication } from '../application/products-service.ts';
import { parseProductCreate, parseProductUpdate, productId } from '../domain/products.ts';
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
export async function routeProducts(request: IncomingMessage, response: ServerResponse, requestId: string, application: ProductsApplication) {
  try {
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    const token = tokenFrom(request);
    if (url.search) throw new ServiceError('DATOS_INVALIDOS', 'Esta operación no admite parámetros de consulta.', 400);
    if (request.method === 'GET' && url.pathname === '/v1/products') {
      respond(response, 200, success('PRODUCTOS_LISTADOS', 'Productos consultados.', { products: await application.list(token) }), requestId); return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/products') {
      const product = await application.create(token, parseProductCreate(await readJsonBody(request)));
      respond(response, 201, success('PRODUCTO_CREADO', 'Producto creado.', { product }), requestId); return;
    }
    const match = url.pathname.match(/^\/v1\/products\/([^/]+)(?:\/(images))?$/i);
    const id = match ? productId(match[1]) : undefined;
    if (match && !match[2] && request.method === 'GET') {
      const product = await application.get(token, id!);
      respond(response, 200, success('PRODUCTO_CONSULTADO', 'Producto consultado.', { product }), requestId); return;
    }
    if (match && match[2] === 'images' && request.method === 'POST') {
      const form = await readMultipartBody(request);
      const files = form.getAll('imagenes').filter((entry): entry is File => entry instanceof File);
      const parsed = await Promise.all(files.map(async (file) => ({ name: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) })));
      const images = await application.uploadImages(token, id!, parsed);
      respond(response, 201, success('IMAGENES_CARGADAS', 'Imágenes cargadas.', { imagenes: images }), requestId); return;
    }
    if (match && !match[2] && request.method === 'PATCH') {
      const { version, changes } = parseProductUpdate(await readJsonBody(request));
      const product = await application.update(token, id!, version, changes);
      respond(response, 200, success('PRODUCTO_ACTUALIZADO', 'Producto actualizado.', { product }), requestId); return;
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const e = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, e.status, failure(e.code, e.message, requestId), requestId);
  }
}
