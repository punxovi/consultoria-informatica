import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { routeAuth } from './http/routes.ts';

export function createAuthServer(): Server {
  return createServer((request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'auth.request', { requestId, method: request.method, path: request.url });
    routeAuth(request, response, requestId);
  });
}

export function authPort(): number {
  return readPort('AUTH_SERVICE_PORT', 4101);
}
