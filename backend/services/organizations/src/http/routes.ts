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
  parseCamposDiagnostico,
  parseActualizarDiagnosticoInput,
  parseCreateDonation,
  parseCreateDonationFile,
  parseUploadDonationFile,
  parseOrganizationImageMimeType,
  parseOrganizationImageUpload,
  ORGANIZATION_IMAGE_MAX_BYTES,
} from '../domain/organizations.ts';
import { readJsonBody, readMultipartBody, readBinaryFile, readLimitedBinaryBody } from './body.ts';
import { parseUpdateDonation, parseArchiveDonation } from '../domain/donations.ts';
import { parseCommitmentsPdfQuery } from '../domain/commitments-pdf.ts';

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
          'commitments:pdf',
          'diagnosticos:list',
          'diagnosticos:create',
          'diagnosticos:detail',
          'diagnosticos:update',
          'donations:list',
          'donations:detail',
          'donations:create',
          'donations:update',
          'donations:archive',
          'donations:files:list',
          'donations:files:reserve',
          'donations:files:upload',
          'donations:files:download',
          'image:replace',
          'image:download',
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

    const commitmentsMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/commitments(?:\/([^/]+))?$/);
    if (commitmentsMatch) {
      const orgId = parseUuid(decodeURIComponent(commitmentsMatch[1]), 'La organización');
      if (commitmentsMatch[2] === 'pdf') {
        response.setHeader('cache-control', 'private, no-store');
        if (request.method !== 'GET') {
          response.setHeader('allow', 'GET');
          throw new ServiceError('METODO_NO_PERMITIDO', 'La descarga de compromisos solo permite GET.', 405);
        }
        const context = parseCommitmentsPdfQuery(orgId, url.searchParams);
        const file = await application.downloadCommitmentsPdf(token, context);
        response.statusCode = 200;
        response.setHeader('content-type', file.mimeType);
        response.setHeader('content-length', file.bytes.length);
        response.setHeader('content-disposition', `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-request-id', requestId);
        response.end(file.bytes);
        return;
      }
      if (commitmentsMatch[2] === 'origins' && request.method === 'GET') {
        const origins = await application.listCommitmentOrigins(token, orgId);
        respond(response, 200, success('ORIGENES_COMPROMISOS_LISTADOS', 'Los orígenes de compromisos fueron consultados correctamente.', origins), requestId);
        return;
      }
      const commitmentId = commitmentsMatch[2] ? parseUuid(decodeURIComponent(commitmentsMatch[2]), 'El compromiso') : undefined;

      if (!commitmentId) {
        if (request.method === 'GET') {
          const extra = [...url.searchParams.keys()].find(k => k !== 'id_acta');
          if(extra) throw new ServiceError('DATOS_INVALIDOS',`El filtro ${extra} no está permitido.`,400);
          const idActa = url.searchParams.has('id_acta') ? parseUuid(url.searchParams.get('id_acta'), 'El acta') : undefined;
          const commitments = await application.listCommitments(token, orgId, { ...(idActa ? { id_acta: idActa } : {}) });
          respond(response, 200, success('COMPROMISOS_LISTADOS', 'Los compromisos fueron consultados correctamente.', { compromisos:commitments }), requestId);
          return;
        }
        if (request.method === 'POST') {
          const fields = parseCamposCompromiso(await readJsonBody(request));
          const commitment = await application.createCommitment(token, orgId, fields);
          respond(response, 201, success('COMPROMISO_CREADO', 'El compromiso fue creado correctamente.', { compromiso:commitment }), requestId);
          return;
        }
      } else {
        if (request.method === 'GET') {
          const commitment = await application.getCommitmentById(token, orgId, commitmentId);
          respond(response, 200, success('COMPROMISO_OBTENIDO', 'El compromiso fue consultado correctamente.', { compromiso:commitment }), requestId);
          return;
        }
        if (request.method === 'PATCH') {
          const input = parseActualizarCompromisoInput(await readJsonBody(request));
          const commitment = await application.updateCommitment(token, orgId, commitmentId, input);
          respond(response, 200, success('COMPROMISO_ACTUALIZADO', 'El compromiso fue actualizado correctamente.', { compromiso:commitment }), requestId);
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

    const imageMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/image$/);
    if (imageMatch) {
      const id = parseUuid(decodeURIComponent(imageMatch[1]), 'La organización');
      if (request.method === 'PUT') {
        const mimeType = parseOrganizationImageMimeType(request.headers['content-type']);
        const bytes = await readLimitedBinaryBody(request, ORGANIZATION_IMAGE_MAX_BYTES);
        const upload = parseOrganizationImageUpload(bytes, mimeType, url.searchParams.get('nombre'));
        const imagen = await application.replaceOrganizationImage(token, id, upload);
        respond(response, 200, success('IMAGEN_ORGANIZACION_GUARDADA', 'La imagen de la organización fue guardada correctamente.', { imagen }), requestId);
        return;
      }
      if (request.method === 'GET') {
        const file = await application.downloadOrganizationImage(token, id);
        response.statusCode = 200;
        response.setHeader('content-type', file.mimeType);
        response.setHeader('cache-control', 'private, no-store');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-request-id', requestId);
        response.end(file.bytes);
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

    const diagnosticosMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/diagnosticos(?:\/([^/]+))?$/);
    if (diagnosticosMatch) {
      const orgId = parseUuid(decodeURIComponent(diagnosticosMatch[1]), 'La organización');
      const diagnosticoId = diagnosticosMatch[2] ? parseUuid(decodeURIComponent(diagnosticosMatch[2]), 'El diagnóstico') : undefined;

      if (!diagnosticoId) {
        if (request.method === 'GET') {
          const diagnosticos = await application.listDiagnosticos(token, orgId);
          respond(response, 200, success('DIAGNOSTICOS_LISTADOS', 'Los diagnósticos fueron consultados correctamente.', { diagnosticos }), requestId);
          return;
        }
        if (request.method === 'POST') {
          const fields = parseCamposDiagnostico(await readJsonBody(request));
          const diagnostico = await application.createDiagnostico(token, orgId, fields);
          respond(response, 201, success('DIAGNOSTICO_CREADO', 'El diagnóstico fue creado correctamente.', { diagnostico }), requestId);
          return;
        }
      } else {
        if (request.method === 'GET') {
          const diagnostico = await application.getDiagnosticoById(token, orgId, diagnosticoId);
          respond(response, 200, success('DIAGNOSTICO_OBTENIDO', 'El diagnóstico fue consultado correctamente.', { diagnostico }), requestId);
          return;
        }
        if (request.method === 'PATCH') {
          const input = parseActualizarDiagnosticoInput(await readJsonBody(request));
          const diagnostico = await application.updateDiagnostico(token, orgId, diagnosticoId, input);
          respond(response, 200, success('DIAGNOSTICO_ACTUALIZADO', 'El diagnóstico fue actualizado correctamente.', { diagnostico }), requestId);
          return;
        }
      }
    }

    if (url.pathname === '/v1/donations') {
      if (request.method === 'GET') {
        const donations = await application.listDonations(token, '');
        respond(response, 200, success('DONACIONES_LISTADAS', 'Las donaciones fueron consultadas correctamente.', { donations }), requestId);
        return;
      }
      if (request.method === 'POST') {
        const input = parseCreateDonation(await readJsonBody(request));
        if (!input.id_organizacion) throw new ServiceError('DATOS_INVALIDOS', 'La Organización receptora es obligatoria.', 400);
        const donation = await application.createDonation(token, input.id_organizacion, input);
        respond(response, 201, success('DONACION_CREADA', 'La donación fue creada correctamente.', { donation }), requestId);
        return;
      }
    }
    const orgDonationsMatch = url.pathname.match(
      /^\/v1\/organizations\/([^/]+)\/donations(?:\/([^/]+)(?:\/files(?:\/([^/]+)(?:\/file)?)?)?)?$/
    );
    if (orgDonationsMatch) {
      const orgId = parseUuid(decodeURIComponent(orgDonationsMatch[1]), 'La organización');
      const donationId = orgDonationsMatch[2] ? parseUuid(decodeURIComponent(orgDonationsMatch[2]), 'La donación') : undefined;
      const fileId = orgDonationsMatch[3] ? parseUuid(decodeURIComponent(orgDonationsMatch[3]), 'El archivo de respaldo') : undefined;
      if (donationId && url.pathname.includes('/files')) await application.getDonationById(token, orgId, donationId);

      if (!donationId) {
        if (request.method === 'GET') {
          const donaciones = await application.listDonations(token, orgId);
          respond(response, 200, success('DONACIONES_LISTADAS', 'Las donaciones fueron consultadas correctamente.', { donations: donaciones }), requestId);
          return;
        }
        if (request.method === 'POST') {
          const body = await readJsonBody(request);
          const fields = parseCreateDonation(body);
          const donation = await application.createDonation(token, orgId, fields);
          respond(response, 201, success('DONACION_CREADA', 'La donación fue creada correctamente.', { donation }), requestId);
          return;
        }
      } else if (!fileId) {
        if (url.pathname.endsWith('/files')) {
          if (request.method === 'GET') {
            const files = await application.listDonationFiles(token, donationId);
            respond(response, 200, success('RESPALDOS_LISTADOS', 'Los respaldos de la donación fueron consultados correctamente.', { files }), requestId);
            return;
          }
          if (request.method === 'POST') {
            const body = await readJsonBody(request);
            const input = parseCreateDonationFile(body);
            const file = await application.reserveDonationFile(token, donationId, input);
            respond(response, 201, success('RESPALDO_RESERVADO', 'El archivo de respaldo fue reservado. Ahora carga el archivo.', { file }), requestId);
            return;
          }
        } else {
          if (request.method === 'PATCH') {
            const donation = await application.updateDonation(token, orgId, donationId, parseUpdateDonation(await readJsonBody(request)));
            respond(response, 200, success('DONACION_ACTUALIZADA', 'La donación fue actualizada correctamente.', { donation }), requestId);
            return;
          }
          if (request.method === 'DELETE') {
            const input = parseArchiveDonation(await readJsonBody(request));
            await application.archiveDonation(token, orgId, donationId, input.version_esperada);
            respond(response, 200, success('DONACION_ARCHIVADA', 'La donación y sus respaldos fueron archivados.', { id_donacion: donationId }), requestId);
            return;
          }
          if (request.method === 'GET') {
            const donation = await application.getDonationById(token, orgId, donationId);
            respond(response, 200, success('DONACION_OBTENIDA', 'La donación fue consultada correctamente.', { donation }), requestId);
            return;
          }
        }
      } else {
        if (request.method === 'PUT') {
          const parsed = parseUploadDonationFile({ version_esperada: Number(url.searchParams.get('version_esperada')) });
          const item = await application.getDonationFileById(token, donationId, fileId);
          const mimeType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';
          if (mimeType !== item.mime_type) {
            throw new ServiceError('ARCHIVO_INVALIDO', 'El tipo del archivo no coincide con el registro.', 400);
          }
          const bytes = await readBinaryFile(request, item.tamano_bytes);
          const file = await application.uploadDonationFile(token, donationId, fileId, parsed.version_esperada, bytes, mimeType);
          respond(response, 200, success('ARCHIVO_CARGADO', 'El archivo fue cargado correctamente.', { file }), requestId);
          return;
        }
        if (request.method === 'GET') {
          if (url.pathname.endsWith('/file') || url.searchParams.get('download') === 'true') {
            const file = await application.downloadDonationFile(token, donationId, fileId);
            response.statusCode = 200;
            response.setHeader('content-type', file.mimeType);
            response.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
            response.setHeader('cache-control', 'private, no-store');
            response.setHeader('x-content-type-options', 'nosniff');
            response.setHeader('x-request-id', requestId);
            response.end(file.bytes);
            return;
          }
          const file = await application.getDonationFileById(token, donationId, fileId);
          respond(response, 200, success('RESPALDO_OBTENIDO', 'El respaldo fue consultado correctamente.', { file }), requestId);
          return;
        }
      }
    }

    const directDonationMatch = url.pathname.match(
      /^\/v1\/donations\/([^/]+)(?:\/files(?:\/([^/]+)(?:\/file)?)?)?$/
    );
    if (directDonationMatch) {
      const donationId = parseUuid(decodeURIComponent(directDonationMatch[1]), 'La donación');
      const fileId = directDonationMatch[2] ? parseUuid(decodeURIComponent(directDonationMatch[2]), 'El archivo de respaldo') : undefined;

      if (!fileId) {
        if (url.pathname.endsWith('/files')) {
          if (request.method === 'GET') {
            const files = await application.listDonationFiles(token, donationId);
            respond(response, 200, success('RESPALDOS_LISTADOS', 'Los respaldos de la donación fueron consultados correctamente.', { files }), requestId);
            return;
          }
          if (request.method === 'POST') {
            const body = await readJsonBody(request);
            const input = parseCreateDonationFile(body);
            const file = await application.reserveDonationFile(token, donationId, input);
            respond(response, 201, success('RESPALDO_RESERVADO', 'El archivo de respaldo fue reservado. Ahora carga el archivo.', { file }), requestId);
            return;
          }
        } else {
          if (request.method === 'PATCH') {
            const donation = await application.updateDonation(token, '', donationId, parseUpdateDonation(await readJsonBody(request)));
            respond(response, 200, success('DONACION_ACTUALIZADA', 'La donación fue actualizada correctamente.', { donation }), requestId);
            return;
          }
          if (request.method === 'DELETE') {
            const input = parseArchiveDonation(await readJsonBody(request));
            await application.archiveDonation(token, '', donationId, input.version_esperada);
            respond(response, 200, success('DONACION_ARCHIVADA', 'La donación y sus respaldos fueron archivados.', { id_donacion: donationId }), requestId);
            return;
          }
          if (request.method === 'GET') {
            const donation = await application.getDonationById(token, '', donationId);
            respond(response, 200, success('DONACION_OBTENIDA', 'La donación fue consultada correctamente.', { donation }), requestId);
            return;
          }
        }
      } else {
        if (request.method === 'PUT') {
          const parsed = parseUploadDonationFile({ version_esperada: Number(url.searchParams.get('version_esperada')) });
          const item = await application.getDonationFileById(token, donationId, fileId);
          const mimeType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';
          if (mimeType !== item.mime_type) {
            throw new ServiceError('ARCHIVO_INVALIDO', 'El tipo del archivo no coincide con el registro.', 400);
          }
          const bytes = await readBinaryFile(request, item.tamano_bytes);
          const file = await application.uploadDonationFile(token, donationId, fileId, parsed.version_esperada, bytes, mimeType);
          respond(response, 200, success('ARCHIVO_CARGADO', 'El archivo fue cargado correctamente.', { file }), requestId);
          return;
        }
        if (request.method === 'GET') {
          if (url.pathname.endsWith('/file') || url.searchParams.get('download') === 'true') {
            const file = await application.downloadDonationFile(token, donationId, fileId);
            response.statusCode = 200;
            response.setHeader('content-type', file.mimeType);
            response.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
            response.setHeader('cache-control', 'private, no-store');
            response.setHeader('x-content-type-options', 'nosniff');
            response.setHeader('x-request-id', requestId);
            response.end(file.bytes);
            return;
          }
          const file = await application.getDonationFileById(token, donationId, fileId);
          respond(response, 200, success('RESPALDO_OBTENIDO', 'El respaldo fue consultado correctamente.', { file }), requestId);
          return;
        }
      }
    }

    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const serviceError = error instanceof ServiceError
      ? error
      : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    const payload = failure(serviceError.code, serviceError.message, requestId);
    if (serviceError.code === 'DATOS_INVALIDOS' && serviceError.cause && typeof serviceError.cause === 'object'
      && 'issues' in serviceError.cause && Array.isArray(serviceError.cause.issues) && !payload.ok) {
      const fields: Record<string, string[]> = Object.create(null);
      for (const issue of serviceError.cause.issues) {
        if (Array.isArray(issue.path) && typeof issue.message === 'string') {
          const path = issue.path.join('.') || '_form';
          (fields[path] ??= []).push(issue.message);
        }
      }
      payload.error.fields = fields;
    }
    respond(response, serviceError.status, payload, requestId);
  }
}
