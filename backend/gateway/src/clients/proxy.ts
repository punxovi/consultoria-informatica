import { auditRequestContext } from '../../../shared/observability/src/audit-context.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure } from '../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { logEvent } from '../../../shared/observability/src/index.ts';

const HEADERS_REENVIADOS = ['accept', 'authorization', 'content-type', 'x-territory-id'] as const;
const MAX_PROXY_BODY_BYTES = 52_428_800;

async function leerCuerpo(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  if (Number(request.headers['content-length']) > MAX_PROXY_BODY_BYTES) {
    throw new ServiceError('CUERPO_DEMASIADO_GRANDE', 'El archivo supera el límite de 50 MiB.', 413);
  }

  const partes: Buffer[] = [];
  let size = 0;
  for await (const parte of request) {
    const buffer = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
    size += buffer.length;
    if (size > MAX_PROXY_BODY_BYTES) throw new ServiceError('CUERPO_DEMASIADO_GRANDE', 'El archivo supera el límite de 50 MiB.', 413);
    partes.push(buffer);
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
    const context = auditRequestContext(request, false);
    if (context.ip) headers.set('x-fge-ip-origen', context.ip);
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
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) response.setHeader('content-disposition', disposition);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) response.setHeader('cache-control', cacheControl);
    const contentTypeOptions = upstream.headers.get('x-content-type-options');
    if (contentTypeOptions) response.setHeader('x-content-type-options', contentTypeOptions);
    const allow = upstream.headers.get('allow');
    if (allow) response.setHeader('allow', allow);
    response.setHeader('x-request-id', requestId);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError(
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
