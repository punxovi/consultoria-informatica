import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { CountriesApplication } from '../application/countries-service.ts';
import { CountryError, parseCountryId, parseCountryCreate, parseCountryUpdate } from '../domain/countries.ts';
import { readJsonBody } from './body.ts';

export async function routeCountries(request: IncomingMessage, response: ServerResponse, requestId: string, app: CountriesApplication) {
  function send(status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId, 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  }
  try {
    const header = request.headers.authorization;
    if (!header || !/^Bearer\s+\S+$/i.test(header)) throw new CountryError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
    const token = header.replace(/^Bearer\s+/i, '');
    await app.authorize(token);
    const url = new URL(request.url ?? '/', 'http://organizations.local');
    if (url.search) throw new CountryError('DATOS_INVALIDOS', 'Esta operación no admite parámetros de consulta.', 400);
    const match = /^\/v1\/countries(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) throw new CountryError('RUTA_NO_ENCONTRADA', 'La ruta no existe.', 404);
    const id = match[1] ? parseCountryId(match[1]) : undefined;
    if (request.method === 'GET' && !id) return send(200, success('PAISES_LISTADOS', 'Países consultados.', { countries: await app.list(token) }));
    if (request.method === 'GET' && id) return send(200, success('PAIS_CONSULTADO', 'País consultado.', { country: await app.get(token, id) }));
    if (request.method === 'POST' && !id) return send(201, success('PAIS_CREADO', 'País creado.', { country: await app.create(token, parseCountryCreate(await readJsonBody(request))) }));
    if (request.method === 'PATCH' && id) return send(200, success('PAIS_ACTUALIZADO', 'País actualizado.', { country: await app.update(token, id, parseCountryUpdate(await readJsonBody(request))) }));
    throw new CountryError('METODO_NO_PERMITIDO', 'El método no está permitido.', 405);
  } catch (error) {
    const known = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500);
    const body = failure(known.code, known.message, requestId);
    if (!body.ok && error instanceof CountryError && error.fields) body.error.fields = error.fields;
    send(known.status, body);
  }
}
