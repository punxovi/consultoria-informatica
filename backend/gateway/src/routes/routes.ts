import type { IncomingMessage, ServerResponse } from 'node:http';
import { API_PREFIX, failure, health } from '../../../shared/contracts/src/index.ts';
import { proxyRequest } from '../clients/proxy.ts';

export interface GatewayTargets {
  auth: URL;
  organizations: URL;
  programs: URL;
  interventions: URL;
  insights: URL;
  guests?: URL; // Opcional o apuntando por defecto a auth
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
  const guestsPrefix = `${API_PREFIX}/guests`;
  const publicQuotePrefix = `${API_PREFIX}/public`;
  if (incomingUrl.pathname === `${publicQuotePrefix}/catalog` || incomingUrl.pathname === `${publicQuotePrefix}/quote-requests`) {
    const internalPath = incomingUrl.pathname.slice('/api'.length);
    const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.organizations);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  if (/^\/api\/v1\/public\/evidences\/[^/]+\/file$/.test(incomingUrl.pathname)) {
    const targetUrl = new URL(`${incomingUrl.pathname.slice('/api'.length)}${incomingUrl.search}`, targets.interventions);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  // Rutas de Autenticación, Coordinadores e Invitados
  if (
    incomingUrl.pathname === authPrefix || incomingUrl.pathname.startsWith(`${authPrefix}/`) ||
    incomingUrl.pathname === `${API_PREFIX}/coordinators` || incomingUrl.pathname.startsWith(`${API_PREFIX}/coordinators/`) ||
    incomingUrl.pathname === guestsPrefix || incomingUrl.pathname.startsWith(`${guestsPrefix}/`)
  ) {
    const internalPath = incomingUrl.pathname.slice('/api'.length);
    const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.guests ?? targets.auth);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  const organizationsPrefix = `${API_PREFIX}/organizations`;
  const donationsPrefix = `${API_PREFIX}/donations`;
  const countriesPrefix = `${API_PREFIX}/countries`;
  const auditPrefix = `${API_PREFIX}/audit`;
  if (
    incomingUrl.pathname === organizationsPrefix ||
    incomingUrl.pathname.startsWith(`${organizationsPrefix}/`) ||
    incomingUrl.pathname === countriesPrefix ||
    incomingUrl.pathname.startsWith(`${countriesPrefix}/`) ||
    incomingUrl.pathname === auditPrefix ||
    incomingUrl.pathname.startsWith(`${auditPrefix}/`) ||
    incomingUrl.pathname === donationsPrefix ||
    incomingUrl.pathname.startsWith(`${donationsPrefix}/`)
  ) {
    const internalPath = incomingUrl.pathname.slice('/api'.length);
    const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.organizations);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  const programsPrefix = `${API_PREFIX}/programs`;
  if (
    incomingUrl.pathname === programsPrefix ||
    incomingUrl.pathname.startsWith(`${programsPrefix}/`)
  ) {
    const internalPath = incomingUrl.pathname.slice('/api'.length);
    const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.programs);
    await proxyRequest(request, response, targetUrl, requestId);
    return;
  }

  for (const prefix of [
    `${API_PREFIX}/plans`,
    `${API_PREFIX}/actions`,
    `${API_PREFIX}/meeting-minutes`,
    `${API_PREFIX}/meeting-minute-attachments`,
    `${API_PREFIX}/evidences`,
    `${API_PREFIX}/indicators`,
    `${API_PREFIX}/results`,
  ]) {
    if (incomingUrl.pathname === prefix || incomingUrl.pathname.startsWith(`${prefix}/`)) {
      const internalPath = incomingUrl.pathname.slice('/api'.length);
      const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.interventions);
      await proxyRequest(request, response, targetUrl, requestId);
      return;
    }
  }

  for (const prefix of [`${API_PREFIX}/dashboard`, `${API_PREFIX}/reports`]) {
    if (incomingUrl.pathname === prefix || incomingUrl.pathname.startsWith(`${prefix}/`)) {
      const internalPath = incomingUrl.pathname.slice('/api'.length);
      const targetUrl = new URL(`${internalPath}${incomingUrl.search}`, targets.insights);
      await proxyRequest(request, response, targetUrl, requestId);
      return;
    }
  }

  responderJson(
    response,
    404,
    failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe en el API Gateway.', requestId),
    requestId,
  );
}
