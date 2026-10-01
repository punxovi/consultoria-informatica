import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { InterventionsApplication } from '../application/interventions-service.ts';
import { parseActionFields, parseActionFilters, parseActionUpdate } from '../domain/actions.ts';
import { parsePlanFields, parsePlanFilters, parsePlanUpdate } from '../domain/plans.ts';
import { uuid } from '../domain/validation.ts';
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

export async function routeInterventions(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: InterventionsApplication,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://interventions.local');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      respond(response, 200, health('interventions-service'), requestId); return;
    }
    if (request.method === 'GET' && ['/v1/plans/capabilities', '/v1/actions/capabilities'].includes(url.pathname)) {
      respond(response, 200, success('INTERVENCIONES_MIGRADAS', 'El servicio de Planes y Acciones está disponible.', {
        migrated: true,
        plans: ['list', 'detail', 'create', 'update'],
        actions: ['list', 'detail', 'create', 'update'],
      }), requestId); return;
    }

    const token = tokenFrom(request);
    if (url.pathname === '/v1/plans') {
      if (request.method === 'GET') {
        const plans = await application.plans.list(token, parsePlanFilters(url));
        respond(response, 200, success('PLANES_LISTADOS', 'Los planes fueron consultados correctamente.', { plans }), requestId); return;
      }
      if (request.method === 'POST') {
        const plan = await application.plans.create(token, parsePlanFields(await readJsonBody(request)));
        respond(response, 201, success('PLAN_CREADO', 'El plan fue creado correctamente.', { plan }), requestId); return;
      }
    }
    const planMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)$/);
    if (planMatch) {
      const id = uuid(decodeURIComponent(planMatch[1]), 'El plan');
      if (request.method === 'GET') {
        const plan = await application.plans.getById(token, id);
        respond(response, 200, success('PLAN_OBTENIDO', 'El plan fue consultado correctamente.', { plan }), requestId); return;
      }
      if (request.method === 'PATCH') {
        const plan = await application.plans.update(token, id, parsePlanUpdate(await readJsonBody(request)));
        respond(response, 200, success('PLAN_ACTUALIZADO', 'El plan fue actualizado correctamente.', { plan }), requestId); return;
      }
    }

    if (url.pathname === '/v1/actions') {
      if (request.method === 'GET') {
        const actions = await application.actions.list(token, parseActionFilters(url));
        respond(response, 200, success('ACCIONES_LISTADAS', 'Las acciones fueron consultadas correctamente.', { actions }), requestId); return;
      }
      if (request.method === 'POST') {
        const action = await application.actions.create(token, parseActionFields(await readJsonBody(request)));
        respond(response, 201, success('ACCION_CREADA', 'La acción fue creada correctamente.', { action }), requestId); return;
      }
    }
    const actionMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)$/);
    if (actionMatch) {
      const id = uuid(decodeURIComponent(actionMatch[1]), 'La acción');
      if (request.method === 'GET') {
        const action = await application.actions.getById(token, id);
        respond(response, 200, success('ACCION_OBTENIDA', 'La acción fue consultada correctamente.', { action }), requestId); return;
      }
      if (request.method === 'PATCH') {
        const action = await application.actions.update(token, id, parseActionUpdate(await readJsonBody(request)));
        respond(response, 200, success('ACCION_ACTUALIZADA', 'La acción fue actualizada correctamente.', { action }), requestId); return;
      }
    }
    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, serviceError.status, failure(serviceError.code, serviceError.message, requestId), requestId);
  }
}
