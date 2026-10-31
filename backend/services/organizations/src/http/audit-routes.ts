import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { AuditApplication } from '../application/audit-service.ts';
import { AuditError, parseAuditQuery } from '../domain/audit.ts';

export async function routeAudit(request: IncomingMessage, response: ServerResponse, requestId: string, application: AuditApplication) {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
  };
  try {
    if (request.method !== 'GET') throw new AuditError('METODO_NO_PERMITIDO', 'El método no está permitido.', 405);
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw new AuditError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
    }
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    if (url.pathname !== '/v1/audit/events') throw new AuditError('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', 404);
    const token = authorization.replace(/^Bearer\s+/i, '');
    const page = await application.list(token, parseAuditQuery(url.searchParams));
    send(200, success('AUDITORIA_CONSULTADA', 'Historial de auditoría consultado.', page));
  } catch (error) {
    const known = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible consultar el historial de auditoría.', 500);
    const body = failure(known.code, known.message, requestId);
    if (!body.ok && error instanceof AuditError && error.fields) body.error.fields = error.fields;
    send(known.status, body);
  }
}
