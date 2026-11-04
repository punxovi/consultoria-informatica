import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ProductsApplication } from '../application/products-service.ts';
import { parseProduct, productId, productFilters, productCreateSchema, productUpdateSchema, productStateSchema } from '../domain/products.ts';
import { readJsonBody } from './body.ts';
export async function routeProducts(request: IncomingMessage, response: ServerResponse, requestId: string, app: ProductsApplication) {
  function send(status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId, 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  }
  try {
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    const isPublic = url.pathname.startsWith('/v1/public/products');
    let token = '';
    if (!isPublic) {
      const header = request.headers.authorization;
      if (!header || !/^Bearer\s+\S+$/i.test(header)) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
      token = header.replace(/^Bearer\s+/i, '');
      await app.authorize(token);
    }
    const match = (isPublic ? /^\/v1\/public\/products(?:\/([^/]+))?$/ : /^\/v1\/products(?:\/([^/]+)(?:\/(activate|deactivate))?)?$/).exec(url.pathname);
    if (!match) throw new ServiceError('RUTA_NO_ENCONTRADA', 'La ruta no existe.', 404);
    const id = match[1] ? productId(match[1]) : undefined;
    const state = match[2];
    if (request.method === 'GET' && !state) {
      if (id && url.search) throw new ServiceError('DATOS_INVALIDOS', 'El detalle no admite filtros.', 400);
      const data = id ? { id_producto: id } : productFilters(url);
      const result = isPublic ? await app.public(id ? 'get' : 'list', data) : await app.admin(token, id ? 'get' : 'list', data);
      return send(200, success(id ? 'PRODUCTO_CONSULTADO' : 'PRODUCTOS_LISTADOS', 'Catálogo consultado.', id ? { product: result } : result));
    }
    if (isPublic) throw new ServiceError('METODO_NO_PERMITIDO', 'El catálogo público solo admite consultas.', 405);
    if (url.search) throw new ServiceError('DATOS_INVALIDOS', 'La operación no admite filtros.', 400);
    const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
    if (['POST', 'PATCH'].includes(request.method ?? '') && type !== 'application/json') throw new ServiceError('FORMATO_INVALIDO', 'Usa application/json.', 415);
    if (request.method === 'POST' && !id) {
      const result = await app.admin(token, 'create', parseProduct(productCreateSchema, await readJsonBody(request)));
      return send(201, success('PRODUCTO_CREADO', 'Producto registrado sin publicar.', { product: result }));
    }
    if (request.method === 'PATCH' && id && !state) {
      const result = await app.admin(token, 'update', { id_producto: id, ...parseProduct(productUpdateSchema, await readJsonBody(request)) });
      return send(200, success('PRODUCTO_ACTUALIZADO', 'Producto actualizado.', { product: result }));
    }
    if (request.method === 'POST' && id && state) {
      const result = await app.admin(token, state, { id_producto: id, ...parseProduct(productStateSchema, await readJsonBody(request)) });
      return send(200, success(state === 'activate' ? 'PRODUCTO_ACTIVADO' : 'PRODUCTO_DESACTIVADO', 'Publicación actualizada.', { product: result }));
    }
    throw new ServiceError('METODO_NO_PERMITIDO', 'El método no está permitido.', 405);
  } catch (error) {
    const known = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación de productos.', 500);
    send(known.status, failure(known.code, known.message, requestId));
  }
}
