import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ProgramsApplication } from '../application/programs-service.ts';
import { parseArchiveInput, parseProgramFields, parseUpdateInput, parseUuid } from '../domain/programs.ts';
import { readJsonBody } from './body.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

function tokenFrom(request: IncomingMessage): string {
  const value = request.headers.authorization;
  const context = authContext(Array.isArray(value) ? value[0] : value);
  if (!context.accessToken) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión para realizar esta operación.', 401);
  return context.accessToken;
}

export async function routePrograms(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: ProgramsApplication,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://programs.local');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      respond(response, 200, health('programs-service'), requestId);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/v1/programs/capabilities') {
      respond(response, 200, success('PROGRAMAS_MIGRADOS', 'El servicio de Programas está disponible.', {
        migrated: true,
        operations: ['list', 'detail', 'create', 'update', 'archive', 'action-lines'],
      }), requestId);
      return;
    }

    const token = tokenFrom(request);
    if (request.method === 'GET' && url.pathname === '/v1/programs') {
      const programs = await application.list(token);
      respond(response, 200, success('PROGRAMAS_LISTADOS', 'Los programas fueron consultados correctamente.', { programs }), requestId);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/programs') {
      const program = await application.create(token, parseProgramFields(await readJsonBody(request)));
      respond(response, 201, success('PROGRAMA_CREADO', 'El programa fue creado correctamente.', { program }), requestId);
      return;
    }

    const match = url.pathname.match(/^\/v1\/programs\/([^/]+)$/);
    if (match) {
      const id = parseUuid(decodeURIComponent(match[1]), 'El programa');
      if (request.method === 'GET') {
        const program = await application.getById(token, id);
        respond(response, 200, success('PROGRAMA_OBTENIDO', 'El programa fue consultado correctamente.', { program }), requestId);
        return;
      }
      if (request.method === 'PATCH') {
        const program = await application.update(token, id, parseUpdateInput(await readJsonBody(request)));
        respond(response, 200, success('PROGRAMA_ACTUALIZADO', 'El programa fue actualizado correctamente.', { program }), requestId);
        return;
      }
      if (request.method === 'DELETE') {
        const program = await application.archive(token, id, parseArchiveInput(await readJsonBody(request)));
        respond(response, 200, success('PROGRAMA_ARCHIVADO', 'Programa eliminado del catálogo. Su historial se conserva.', { program }), requestId);
        return;
      }
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const serviceError = error instanceof ServiceError
      ? error
      : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, serviceError.status, failure(serviceError.code, serviceError.message, requestId), requestId);
  }
}
