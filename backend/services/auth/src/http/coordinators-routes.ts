import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { CoordinatorApplication } from '../application/coordinators-service.ts';
import { CoordinatorError, coordinatorId, parseCoordinatorCreate, parseCoordinatorEdit, parseCoordinatorVersion } from '../domain/coordinators.ts';
import { readJsonBody } from './body.ts';

export async function routeCoordinators(request: IncomingMessage, response: ServerResponse, requestId: string, application: CoordinatorApplication) {
  function send(status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId, 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  }
  try {
    const header = request.headers.authorization;
    if (!header || !/^Bearer\s+\S+$/i.test(header)) throw new CoordinatorError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
    const token = header.replace(/^Bearer\s+/i, '');
    await application.authorize(token);
    const url = new URL(request.url ?? '/', 'http://auth.local');
    if (url.search) throw new CoordinatorError('DATOS_INVALIDOS', 'Esta operación no admite parámetros de consulta.', 400);
    const match = /^\/v1\/coordinators(?:\/([^/]+)(?:\/(activate|deactivate))?)?$/.exec(url.pathname);
    if (!match) throw new CoordinatorError('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', 404);
    const id = match[1] ? coordinatorId(match[1]) : undefined;
    const action = match[2];
    if (!id && request.method === 'GET') return send(200, success('COORDINADORES_LISTADOS', 'Cuentas consultadas.', { coordinators: await application.list(token) }));
    if (!id && request.method === 'POST') {
      const result = await application.create(token, parseCoordinatorCreate(await readJsonBody(request)));
      return send(201, success('COORDINADOR_CREADO', result.acceso === 'enlace_enviado' ? 'Cuenta creada.' : 'Cuenta creada. Solicita recuperación de contraseña para establecer el acceso.', result));
    }
    if (id && !action && request.method === 'GET') return send(200, success('COORDINADOR_CONSULTADO', 'Cuenta consultada.', { coordinator: await application.get(token, id) }));
    if (id && !action && request.method === 'PATCH') return send(200, success('COORDINADOR_ACTUALIZADO', 'Cuenta actualizada. Los cambios de país se aplican al siguiente inicio de sesión.', { coordinator: await application.update(token, id, parseCoordinatorEdit(await readJsonBody(request))) }));
    if (id && action && request.method === 'POST') {
      const input = parseCoordinatorVersion(await readJsonBody(request));
      return send(200, success('ESTADO_COORDINADOR_ACTUALIZADO', 'Estado actualizado.', { coordinator: await application.state(token, id, input.version_esperada, action === 'activate') }));
    }
    throw new CoordinatorError('METODO_NO_PERMITIDO', 'El método no está permitido.', 405);
  } catch (error) {
    const known = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500);
    const body = failure(known.code, known.message, requestId);
    if (!body.ok && error instanceof CoordinatorError && error.fields) body.error.fields = error.fields;
    send(known.status, body);
  }
}
