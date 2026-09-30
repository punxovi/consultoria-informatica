import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';

function responder(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

export function routeAuth(request: IncomingMessage, response: ServerResponse, requestId: string): void {
  const url = new URL(request.url ?? '/', 'http://auth.local');

  if (request.method === 'GET' && url.pathname === '/health') {
    responder(response, 200, health('auth-service'), requestId);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/auth/capabilities') {
    responder(response, 200, success('AUTH_BASE_LISTA', 'La base del servicio Auth está disponible.', {
      migrated: false,
      operations: ['login', 'password-recovery', 'password-change', 'logout', 'session'],
    }), requestId);
    return;
  }

  if (url.pathname === '/v1/auth' || url.pathname.startsWith('/v1/auth/')) {
    responder(
      response,
      501,
      failure(
        'AUTH_PENDIENTE_MIGRACION',
        'La operación continuará temporalmente en Astro Actions hasta el paso de migración de Auth.',
        requestId,
      ),
      requestId,
    );
    return;
  }

  responder(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
}
