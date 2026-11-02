import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { CoveragesApplication } from '../application/coverages-service.ts';
import {
  CoverageError,
  parseCoverageCreate,
  parseCoverageExtension,
  parseCoverageId,
  parseCoverageRevocation,
} from '../domain/coverages-api.ts';
import { readJsonBody } from './body.ts';

export async function routeCoverages(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  app: CoveragesApplication,
): Promise<void> {
  function send(status: number, body: unknown) {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
  }

  try {
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw new CoverageError('SESION_REQUERIDA', 'Debes iniciar sesión para gestionar coberturas.', 401);
    }
    const token = authorization.replace(/^Bearer\s+/i, '');
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    if (url.search) throw new CoverageError('DATOS_INVALIDOS', 'Esta operación no admite parámetros de consulta.', 400);

    const base = '/v1/organizations/temporary-coverages';
    if (url.pathname === base && request.method === 'GET') {
      const coverages = await app.list(token);
      send(200, success('COBERTURAS_LISTADAS', 'Las coberturas fueron consultadas correctamente.', { coverages }));
      return;
    }
    if (url.pathname === base && request.method === 'POST') {
      const coverage = await app.create(token, parseCoverageCreate(await readJsonBody(request)));
      send(201, success('COBERTURA_CREADA', 'La cobertura fue creada correctamente.', { coverage }));
      return;
    }
    if (url.pathname === `${base}/mine` && request.method === 'GET') {
      const coverages = await app.mine(token);
      send(200, success('COBERTURAS_VIGENTES_LISTADAS', 'Las coberturas vigentes fueron consultadas correctamente.', { coverages }));
      return;
    }

    const match = new RegExp(`^${base}/([^/]+)/(extend|revoke)$`).exec(url.pathname);
    if (match && request.method === 'PATCH') {
      const id = parseCoverageId(decodeURIComponent(match[1]));
      if (match[2] === 'extend') {
        const coverage = await app.extend(token, id, parseCoverageExtension(await readJsonBody(request)));
        send(200, success('COBERTURA_EXTENDIDA', 'La cobertura fue extendida correctamente.', { coverage }));
        return;
      }
      const coverage = await app.revoke(token, id, parseCoverageRevocation(await readJsonBody(request)));
      send(200, success('COBERTURA_REVOCADA', 'La cobertura fue revocada correctamente.', { coverage }));
      return;
    }

    throw new CoverageError('RUTA_NO_ENCONTRADA', 'La ruta de coberturas no existe.', 404);
  } catch (error) {
    const known = error instanceof ServiceError
      ? error
      : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación de coberturas.', 500);
    const body = failure(known.code, known.message, requestId);
    if (!body.ok && error instanceof CoverageError && error.fields) body.error.fields = error.fields;
    send(known.status, body);
  }
}
