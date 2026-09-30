import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure } from '../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { logEvent } from '../../../shared/observability/src/index.ts';

const HEADERS_REENVIADOS = ['accept', 'authorization', 'content-type'] as const;

async function leerCuerpo(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const partes: Buffer[] = [];
  for await (const parte of request) {
    partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte));
  }

  return partes.length > 0 ? Buffer.concat(partes) : undefined;
}

export async function proxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  targetUrl: URL,
  requestId: string,
): Promise<void> {
  try {
    const headers = new Headers({ 'x-request-id': requestId });
    for (const header of HEADERS_REENVIADOS) {
      const value = request.headers[header];
      if (typeof value === 'string') headers.set(header, value);
    }

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: await leerCuerpo(request),
      redirect: 'manual',
    });

    response.statusCode = upstream.status;
    response.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8');
    response.setHeader('x-request-id', requestId);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const serviceError = new ServiceError(
      'SERVICIO_NO_DISPONIBLE',
      'El servicio solicitado no se encuentra disponible.',
      503,
      error,
    );
    logEvent('error', 'gateway.proxy.failed', { requestId, target: targetUrl.origin });
    response.statusCode = serviceError.status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('x-request-id', requestId);
    response.end(JSON.stringify(failure(serviceError.code, serviceError.message, requestId)));
  }
}
