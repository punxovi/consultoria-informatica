import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { QuoteRequestsApplication } from '../application/quote-requests-service.ts';
import { readJsonBody } from './body.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string) {
  response.statusCode = status; response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store'); response.setHeader('x-request-id', requestId); response.end(JSON.stringify(body));
}
function tokenFrom(request: IncomingMessage): string {
  const value = request.headers.authorization;
  const token = authContext(Array.isArray(value) ? value[0] : value).accessToken;
  if (!token) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
  return token;
}
export async function routeQuoteRequests(request: IncomingMessage, response: ServerResponse, requestId: string, application: QuoteRequestsApplication) {
  try {
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    const token = tokenFrom(request);
    if (request.method === 'GET' && url.pathname === '/v1/quote-requests') {
      respond(response, 200, success('SOLICITUDES_COTIZACION_LISTADAS', 'Solicitudes consultadas.', { requests: await application.list(token) }), requestId); return;
    }
    const match = url.pathname.match(/^\/v1\/quote-requests\/([0-9a-f-]{36})\/status$/i);
    if (request.method === 'PATCH' && match) {
      const body = await readJsonBody(request) as Record<string, unknown>;
      if (!Number.isSafeInteger(body?.version_esperada) || Number(body.version_esperada) < 1 || typeof body.estado !== 'string') {
        throw new ServiceError('DATOS_INVALIDOS', 'La versión y el estado son obligatorios.', 400);
      }
      const requestData = await application.updateStatus(token, match[1], Number(body.version_esperada), body.estado);
      respond(response, 200, success('SOLICITUD_COTIZACION_ACTUALIZADA', 'Estado actualizado.', { request: requestData }), requestId); return;
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const e = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, e.status, failure(e.code, e.message, requestId), requestId);
  }
}
