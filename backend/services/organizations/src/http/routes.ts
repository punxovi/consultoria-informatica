import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { OrganizationsApplication } from '../application/organizations-service.ts';
import {
  parseOrganizationFields,
  parseOrganizationFilters,
  parseUpdateInput,
  parseUuid,
  parseLegalRecordInput,
  parseCamposCompromiso,
  parseActualizarCompromisoInput,
} from '../domain/organizations.ts';
import { readJsonBody, readMultipartBody } from './body.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string): void {
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

export async function routeOrganizations(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: OrganizationsApplication,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://organizations.local');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      respond(response, 200, health('organizations-service'), requestId);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/v1/organizations/capabilities') {
      respond(response, 200, success('ORGANIZACIONES_MIGRADAS', 'El servicio de Organizaciones está disponible.', {
        migrated: true,
        operations: [
          'list',
          'detail',
          'create',
          'update',
          'countries',
          'legal-record:get',
          'legal-record:create',
          'legal-record:update',
          'commitments:list',
          'commitments:origins',
          'commitments:create',
          'commitments:detail',
          'commitments:update',
        ],
      }), requestId);
      return;
    }

    const token = tokenFrom(request);
    if (request.method === 'GET' && url.pathname === '/v1/organizations/countries') {
      const countries = await application.listCountries(token);
      respond(response, 200, success('PAISES_LISTADOS', 'Los países fueron consultados correctamente.', { countries }), requestId);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/v1/organizations') {
      const organizations = await application.list(token, parseOrganizationFilters(url));
      respond(response, 200, success('ORGANIZACIONES_LISTADAS', 'Las organizaciones fueron consultadas correctamente.', { organizations }), requestId);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/organizations') {
      const organization = await application.create(token, parseOrganizationFields(await readJsonBody(request)));
      respond(response, 201, success('ORGANIZACION_CREADA', 'La organización fue creada correctamente.', { organization }), requestId);
      return;
    }

    // Rutas para Compromisos de una Organización
    const commitmentsMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/commitments(?:\/([^/]+))?$/);
    if (commitmentsMatch) {
      const orgId = parseUuid(decodeURIComponent(commitmentsMatch[1]), 'La organización');
      const commitmentId = commitmentsMatch[2] ? parseUuid(decodeURIComponent(commitmentsMatch[2]), 'El compromiso') : undefined;

      // Subruta para orígenes (actas)
      if (!commitmentId && url.pathname.endsWith('/origins') && request.method === 'GET') {
        const origins = await application.listCommitmentOrigins(token, orgId);
        respond(response, 200, success('ORIGENES_COMPROMISOS_LISTADOS', 'Los orígenes de compromisos fueron consultados correctamente.', { origins }), requestId);
        return;
      }

      if (!commitmentId) {
        if (request.method === 'GET') {
          const idActa = url.searchParams.get('id_acta') ?? undefined;
          const commitments = await application.listCommitments(token, orgId, { ...(idActa ? { id_acta: idActa } : {}) });
          respond(response, 200, success('COMPROMISOS_LISTADOS', 'Los compromisos fueron consultados correctamente.', { commitments }), requestId);
          return;
        }
        if (request.method === 'POST') {
          const fields = parseCamposCompromiso(await readJsonBody(request));
          const commitment = await application.createCommitment(token, orgId, fields);
          respond(response, 201, success('COMPROMISO_CREADO', 'El compromiso fue creado correctamente.', { commitment }), requestId);
          return;
        }
      } else {
        if (request.method === 'GET') {
          const commitment = await application.getCommitmentById(token, orgId, commitmentId);
          respond(response, 200, success('COMPROMISO_OBTENIDO', 'El compromiso fue consultado correctamente.', { commitment }), requestId);
          return;
        }
        if (request.method === 'PATCH') {
          const input = parseActualizarCompromisoInput(await readJsonBody(request));
          const commitment = await application.updateCommitment(token, orgId, commitmentId, input);
          respond(response, 200, success('COMPROMISO_ACTUALIZADO', 'El compromiso fue actualizado correctamente.', { commitment }), requestId);
          return;
        }
      }
    }

    const legalMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/legal-record$/);
    if (legalMatch) {
      const id = parseUuid(decodeURIComponent(legalMatch[1]), 'La organización');
      if (request.method === 'GET') {
        const expediente = await application.getLegalRecord(token, id);
        respond(response, 200, success('EXPEDIENTE_LEGAL_OBTENIDO', 'El expediente legal fue consultado correctamente.', { expediente }), requestId);
        return;
      }
      if (request.method === 'POST') {
        const input = await parseLegalRecordInput(await readMultipartBody(request), false);
        const expediente = await application.createLegalRecord(token, id, input);
        respond(response, 201, success('EXPEDIENTE_LEGAL_CREADO', 'El expediente legal fue creado correctamente.', { expediente }), requestId);
        return;
      }
      if (request.method === 'PATCH') {
        const input = await parseLegalRecordInput(await readMultipartBody(request), true);
        const expediente = await application.updateLegalRecord(token, id, input);
        respond(response, 200, success('EXPEDIENTE_LEGAL_ACTUALIZADO', 'El expediente legal fue actualizado correctamente.', { expediente }), requestId);
        return;
      }
    }

    const match = url.pathname.match(/^\/v1\/organizations\/([^/]+)$/);
    if (match) {
      const id = parseUuid(decodeURIComponent(match[1]), 'La organización');
      if (request.method === 'GET') {
        const organization = await application.getById(token, id);
        respond(response, 200, success('ORGANIZACION_OBTENIDA', 'La organización fue consultada correctamente.', { organization }), requestId);
        return;
      }
      if (request.method === 'PATCH') {
        const organization = await application.update(token, id, parseUpdateInput(await readJsonBody(request)));
        respond(response, 200, success('ORGANIZACION_ACTUALIZADA', 'La organización fue actualizada correctamente.', { organization }), requestId);
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