import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { AuthApplication } from '../application/auth-service.ts';
import {
  parseLoginInput,
  parsePasswordChangeInput,
  parseRecoveryInput,
  parseRefreshInput,
} from '../domain/auth.ts';
import { readJsonBody } from './body.ts';

function responder(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

function tokenFrom(request: IncomingMessage): string {
  const value = request.headers.authorization;
  const context = authContext(Array.isArray(value) ? value[0] : value);
  if (!context.accessToken) {
    throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión para realizar esta operación.', 401);
  }
  return context.accessToken;
}

export async function routeAuth(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: AuthApplication,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://auth.local');

  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      responder(response, 200, health('auth-service'), requestId);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/auth/capabilities') {
      responder(response, 200, success('AUTH_MIGRADO', 'El servicio Auth está disponible.', {
        migrated: true,
        operations: ['login', 'password-recovery', 'password-change', 'logout', 'session', 'session-refresh'],
      }), requestId);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
      const session = await application.login(parseLoginInput(await readJsonBody(request)));
      responder(response, 200, success('SESION_INICIADA', 'Sesión iniciada correctamente.', { session }), requestId);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/v1/auth/password/recovery') {
      await application.requestRecovery(parseRecoveryInput(await readJsonBody(request)));
      responder(
        response,
        200,
        success(
          'RECUPERACION_SOLICITADA',
          'Si el correo está registrado, recibirás un enlace de recuperación.',
          null,
        ),
        requestId,
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/v1/auth/password/change') {
      await application.changePassword(tokenFrom(request), parsePasswordChangeInput(await readJsonBody(request)));
      responder(
        response,
        200,
        success('CONTRASENA_ACTUALIZADA', 'Contraseña actualizada correctamente.', null),
        requestId,
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/auth/session') {
      const session = await application.getSession(tokenFrom(request));
      responder(response, 200, success('SESION_ACTIVA', 'La sesión está activa.', session), requestId);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/v1/auth/session/refresh') {
      const input = parseRefreshInput(await readJsonBody(request));
      const session = await application.refreshSession(input.refreshToken);
      responder(response, 200, success('SESION_RENOVADA', 'La sesión fue renovada.', { session }), requestId);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
      await application.logout(tokenFrom(request));
      responder(response, 200, success('SESION_CERRADA', 'Sesión cerrada correctamente.', null), requestId);
      return;
    }

    responder(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const serviceError = error instanceof ServiceError
      ? error
      : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    responder(
      response,
      serviceError.status,
      failure(serviceError.code, serviceError.message, requestId),
      requestId,
    );
  }
}
