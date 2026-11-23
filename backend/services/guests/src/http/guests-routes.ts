import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { GuestApplication } from '../application/guests-service.ts';
import { GuestError, guestId, parseGuestCreate, parseGuestVersion } from '../domain/guests.ts';
import { readJsonBody } from './body.ts';

export async function routeGuests(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: GuestApplication,
) {
  function send(status: number, body: unknown) {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
  }

  try {
    const url = new URL(request.url ?? '/', 'http://auth.local');

    if (url.pathname === '/v1/guests/request' && request.method === 'POST') {
      const input = parseGuestCreate(await readJsonBody(request));
      const guest = await application.create(input);
      return send(201, success('SOLICITUD_INVITADO_REGISTRADA', 'Solicitud de acceso registrada correctamente.', { guest }));
    }

    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw new GuestError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
    }
    const token = authorization.replace(/^Bearer\s+/i, '');

    if (url.pathname === '/v1/guests/consume' && request.method === 'POST') {
      if (url.search) throw new GuestError('DATOS_INVALIDOS', 'Esta operación no admite parámetros.', 400);
      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
        throw new GuestError('DATOS_INVALIDOS', 'Esta operación requiere un objeto vacío.', 400);
      }
      const guest = await application.consume(token);
      return send(200, success('ACCESO_INVITADO_INICIADO', 'Acceso habilitado durante 24 horas.', { guest }));
    }
    
    await application.authorize(token);

    if (url.search) {
      throw new GuestError('DATOS_INVALIDOS', 'Esta operación no admite parámetros de consulta.', 400);
    }

    const match = /^\/v1\/guests(?:\/([^/]+)(?:\/(approve|reject|revoke))?)?$/.exec(url.pathname);
    if (!match) {
      throw new GuestError('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', 404);
    }

    const id = match[1] ? guestId(match[1]) : undefined;
    const action = match[2];

    if (!id && request.method === 'GET') {
      const guests = await application.list(token);
      return send(200, success('INVITADOS_LISTADOS', 'Solicitudes consultadas correctamente.', { guests }));
    }

    if (id && !action && request.method === 'GET') {
      const guest = await application.get(token, id);
      return send(200, success('INVITADO_CONSULTADO', 'Solicitud consultada correctamente.', { guest }));
    }

    if (id && action && request.method === 'POST') {
      const input = parseGuestVersion(await readJsonBody(request));
      let guest;

      if (action === 'approve') {
        guest = await application.approve(token, id, input);
        return send(200, success('INVITADO_APROBADO', 'Solicitud aprobada y enlace de acceso generado.', { guest }));
      }
      if (action === 'reject') {
        guest = await application.reject(token, id, input);
        return send(200, success('INVITADO_RECHAZADO', 'Solicitud de invitado rechazada.', { guest }));
      }
      if (action === 'revoke') {
        guest = await application.revoke(token, id, input);
        return send(200, success('INVITADO_REVOCADO', 'Acceso de invitado revocado correctamente.', { guest }));
      }
    }

    throw new GuestError('METODO_NO_PERMITIDO', 'El método no está permitido.', 405);
  } catch (error) {
    const known = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500);
    const body = failure(known.code, known.message, requestId);
    if (!body.ok && error instanceof GuestError && error.fields) {
      body.error.fields = error.fields;
    }
    send(known.status, body);
  }
}
