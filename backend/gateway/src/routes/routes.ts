import type { IncomingMessage, ServerResponse } from 'node:http';
import { API_PREFIX, failure, health } from '../../../shared/contracts/src/index.ts';
import { proxyRequest } from '../clients/proxy.ts';

export interface GatewayTargets {
  auth: URL;
  organizations: URL;
}

function responderJson(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

export async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  targets: GatewayTargets,
  requestId: string,
): Promise<void> {
  const incomingUrl = new URL(request.url ?? '/', 'http://gateway.local');

  if (request.method === 'GET' && incomingUrl.pathname === '/health') {
    responderJson(response, 200, health('api-gateway'), requestId);
    return;
  }

  const authPrefix = `${API_PREFIX}/auth`;
  if (incomingUrl.pathname === authPrefix || incomingUrl.pathname.startsWith(`${authPrefix}/`)) {
    const internalPath = incomingUrl.pathname.slice('/api'.length);
    const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.auth);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  const organizationsPrefix = `${API_PREFIX}/organizations`;
  if (
    incomingUrl.pathname === organizationsPrefix ||
    incomingUrl.pathname.startsWith(`${organizationsPrefix}/`)
  ) {
    const internalPath = incomingUrl.pathname.slice('/api'.length);
    const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.organizations);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  responderJson(
    response,
    404,
    failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe en el API Gateway.', requestId),
    requestId,
  );
}
