import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { readJsonBody } from './body.ts';
import type { PublicCatalogApplication } from '../application/public-catalog-service.ts';
import { publicQuoteSchema,parseQuote as validateQuote } from '../domain/quote-requests.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
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
    const imagen = /^\/v1\/public\/catalog\/images\/([^/]+)$/.exec(url.pathname);
    if (request.method === 'GET' && imagen) {
      const archivo = await application.image(decodeURIComponent(imagen[1]));
      response.statusCode = 200;
      response.setHeader('content-type', archivo.mimeType);
      response.setHeader('content-length', String(archivo.bytes.length));
      response.setHeader('cache-control', 'public, max-age=300');
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('x-request-id', requestId);
      response.end(archivo.bytes);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/public/quote-requests') {
      if(url.search)throw new ServiceError('DATOS_INVALIDOS','El registro público no admite filtros.',400);
      if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')throw new ServiceError('FORMATO_INVALIDO','Usa application/json.',415);
      const quote = await application.createQuote(validateQuote(publicQuoteSchema,await readJsonBody(request)));
      respond(response, 201, success('SOLICITUD_COTIZACION_REGISTRADA', 'Solicitud recibida correctamente.', { quote }), requestId);
      return;
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const e = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, e.status, failure(e.code, e.message, requestId), requestId);
  }
}
