import type { IncomingMessage, ServerResponse } from 'node:http';

export function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('vary', 'Origin');
    response.setHeader('access-control-expose-headers','content-disposition,content-length,x-request-id');
  }

  if (request.method !== 'OPTIONS') return false;

  response.statusCode = 204;
  response.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  response.setHeader('access-control-allow-headers', 'authorization,content-type,x-request-id,x-territory-id');
  response.end();
  return true;
}
