import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { readJsonBody } from './body.ts';
import type { PublicCatalogApplication, PublicQuoteRequest } from '../application/public-catalog-service.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

function parseQuote(value: unknown): PublicQuoteRequest {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (typeof data.nombre_solicitante !== 'string' || typeof data.correo !== 'string' || !items.length) {
    throw new ServiceError('DATOS_INVALIDOS', 'Completa tus datos y selecciona al menos un producto.', 400);
  }
  return {
    nombre_solicitante: data.nombre_solicitante.trim(), correo: data.correo.trim(),
    telefono: typeof data.telefono === 'string' ? data.telefono.trim() : undefined,
    mensaje: typeof data.mensaje === 'string' ? data.mensaje.trim() : undefined,
    items: items.map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      if (typeof row.id_producto !== 'string' || !Number.isFinite(Number(row.cantidad)) || Number(row.cantidad) <= 0) {
        throw new ServiceError('DATOS_INVALIDOS', 'Los productos seleccionados no son válidos.', 400);
      }
      return { id_producto: row.id_producto, cantidad: Number(row.cantidad) };
    }),
  };
}

export async function routePublicCatalog(request: IncomingMessage, response: ServerResponse, requestId: string, application: PublicCatalogApplication) {
  try {
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    if (request.method === 'GET' && url.pathname === '/v1/public/catalog') {
      const idPais = url.searchParams.get('id_pais')?.trim() || undefined;
      const idOrganizacion = url.searchParams.get('id_organizacion')?.trim() || undefined;
      respond(response, 200, success('CATALOGO_PUBLICO_LISTADO', 'Catálogo disponible.', { items: await application.list({ id_pais: idPais, id_organizacion: idOrganizacion }) }), requestId);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/public/quote-requests') {
      const quote = await application.createQuote(parseQuote(await readJsonBody(request)));
      respond(response, 201, success('SOLICITUD_COTIZACION_REGISTRADA', 'Solicitud recibida correctamente.', { quote }), requestId);
      return;
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const e = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, e.status, failure(e.code, e.message, requestId), requestId);
  }
}
