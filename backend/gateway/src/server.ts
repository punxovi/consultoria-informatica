import { createServer, type Server } from 'node:http';
import { readPort, readUrl } from '../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../shared/observability/src/index.ts';
import { applyCors } from './middleware/cors.ts';
import { routeRequest, type GatewayTargets } from './routes/routes.ts';

export interface GatewayOptions {
  allowedOrigins?: string[];
  targets?: Partial<GatewayTargets>;
}

function frontendOrigins(): string[] {
  return (process.env.FRONTEND_ORIGINS ?? 'http://127.0.0.1:4321,http://localhost:4321')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createGatewayServer(options: GatewayOptions = {}): Server {
  const allowedOrigins = new Set(options.allowedOrigins ?? frontendOrigins());
  const targets: GatewayTargets = {
    auth: options.targets?.auth ?? readUrl('AUTH_SERVICE_URL', 'http://127.0.0.1:4101'),
    organizations:
      options.targets?.organizations ??
      readUrl('ORGANIZATIONS_SERVICE_URL', 'http://127.0.0.1:4102'),
  };

  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    if (applyCors(request, response, allowedOrigins)) return;

    logEvent('info', 'gateway.request', {
      requestId,
      method: request.method,
      path: request.url,
    });

    await routeRequest(request, response, targets, requestId);
  });
}

export function gatewayPort(): number {
  return readPort('GATEWAY_PORT', 4000);
}
