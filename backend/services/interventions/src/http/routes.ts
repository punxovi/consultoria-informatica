
import { routeIndicators } from './indicators.routes.ts';
import type { IndicatorsRepository } from '../domain/indicators.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { InterventionsApplication } from '../application/interventions-service.ts';
import { parseActionFields, parseActionFilters, parseActionUpdate } from '../domain/actions.ts';
import {
  parseCreateMeetingMinute,
  parseMeetingMinuteFilters,
  parseUpdateMeetingMinute,
} from '../domain/meeting-minutes.ts';
import { parseCreateMeetingMinuteAttachment } from '../domain/meeting-minute-attachments.ts';
import { parsePlanFields, parsePlanFilters, parsePlanUpdate } from '../domain/plans.ts';
import { expectedVersion, invalid, objectInput, uuid } from '../domain/validation.ts';
import { readJsonBody, readEvidenceFile } from './body.ts';
import {
  parseCreateEvidence,
  parseEvidenceFilters,
  parseUpdateEvidence,
  parseUploadEvidence,
} from '../domain/evidences.ts';
import type { PublicEvidencesRepository } from '../infrastructure/supabase-public-evidences.repository.ts';

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
    throw new ServiceError(
      'SESION_REQUERIDA',
      'Debes iniciar sesión para realizar esta operación.',
      401,
    );
  }

  return context.accessToken;
}

function parseArchiveInput(value: unknown): number {
  const input = objectInput(value, ['version_esperada']);
  const version = expectedVersion(input.version_esperada);

  if (version === undefined) {
    return invalid('La versión esperada es obligatoria.');
  }

  return version;
}

export async function routeInterventions(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: InterventionsApplication,
  publications: PublicEvidencesRepository,
  indicators: IndicatorsRepository,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://interventions.local');

  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      respond(response, 200, health('interventions-service'), requestId);
      return;
    }

    if (
      request.method === 'GET' &&
      [
        '/v1/plans/capabilities',
        '/v1/actions/capabilities',
        '/v1/meeting-minutes/capabilities',
        '/v1/evidences/capabilities',
      ].includes(url.pathname)
    ) {
      respond(
        response,
        200,
        success('INTERVENCIONES_MIGRADAS', 'El servicio de Intervenciones está disponible.', {
          migrated: true,
          plans: ['list', 'detail', 'create', 'update', 'archive'],
          actions: ['list', 'detail', 'create', 'update', 'archive'],
          meetingMinutes: ['list', 'detail', 'create', 'update'],
          evidences: ['list', 'detail', 'create', 'update', 'upload', 'download'],
          meetingMinuteAttachments: ['list', 'create', 'upload', 'download'],
        }),
        requestId,
      );
      return;
    }

    const publicFile = url.pathname.match(/^\/v1\/public\/evidences\/([^/]+)\/file$/);

    if (publicFile) {
      response.setHeader('cache-control', 'no-store');

      if (request.method !== 'GET') {
        response.setHeader('allow', 'GET');
        throw new ServiceError(
          'METODO_NO_PERMITIDO',
          'Solo se permite consultar la publicación.',
          405,
        );
      }

      const file = await publications.download(
        uuid(decodeURIComponent(publicFile[1]), 'La evidencia'),
      );

      response.statusCode = 200;
      response.setHeader('content-type', file.mimeType);
      response.setHeader(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      );
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('x-request-id', requestId);
      response.end(file.bytes);
      return;
    }

    const token = tokenFrom(request);

    // Adjuntos de actas: listar y registrar metadatos.
    const meetingMinuteAttachmentsMatch = url.pathname.match(
      /^\/v1\/meeting-minutes\/([^/]+)\/attachments$/,
    );

    if (meetingMinuteAttachmentsMatch) {
      const meetingMinuteId = uuid(
        decodeURIComponent(meetingMinuteAttachmentsMatch[1]),
        'El acta',
      );

      if (request.method === 'GET') {
        const attachments = await application.meetingMinuteAttachments.list(
          token,
          { id_acta: meetingMinuteId },
        );

        respond(
          response,
          200,
          success(
            'ADJUNTOS_ACTA_LISTADOS',
            'Los adjuntos del acta fueron consultados correctamente.',
            { attachments },
          ),
          requestId,
        );
        return;
      }

      if (request.method === 'POST') {
        const input = parseCreateMeetingMinuteAttachment(
          await readJsonBody(request),
        );

        if (input.id_acta !== meetingMinuteId) {
          throw new ServiceError(
            'ACTA_NO_COINCIDE',
            'El identificador del acta no coincide con la solicitud.',
            400,
          );
        }

        const attachment = await application.meetingMinuteAttachments.create(
          token,
          input,
        );

        respond(
          response,
          201,
          success(
            'ADJUNTO_ACTA_CREADO',
            'El adjunto fue registrado. Ahora carga el archivo.',
            { attachment },
          ),
          requestId,
        );
        return;
      }
    }

    // Adjuntos de actas: eliminar archivo y metadatos.
    const meetingMinuteAttachmentMatch = url.pathname.match(
      /^\/v1\/meeting-minute-attachments\/([^/]+)$/,
    );

    if (meetingMinuteAttachmentMatch && request.method === 'DELETE') {
      const id = uuid(
        decodeURIComponent(meetingMinuteAttachmentMatch[1]),
        'El adjunto',
      );

      await application.meetingMinuteAttachments.delete(token, id);

      respond(
        response,
        200,
        success(
          'ADJUNTO_ACTA_ELIMINADO',
          'El adjunto fue eliminado correctamente.',
          { id_adjunto: id },
        ),
        requestId,
      );

      return;
    }
    // Adjuntos de actas: cargar y descargar archivos.
    const meetingMinuteAttachmentFileMatch = url.pathname.match(
      /^\/v1\/meeting-minute-attachments\/([^/]+)\/file$/,
    );

    if (meetingMinuteAttachmentFileMatch) {
      const id = uuid(
        decodeURIComponent(meetingMinuteAttachmentFileMatch[1]),
        'El adjunto',
      );

      if (request.method === 'PUT') {
        const parsed = parseUploadEvidence({
          version_esperada: Number(url.searchParams.get('version_esperada')),
        });

        const item = await application.meetingMinuteAttachments.getById(
          token,
          id,
        );

        const mimeType =
          request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';

        if (mimeType !== item.mime_type) {
          throw new ServiceError(
            'ARCHIVO_INVALIDO',
            'El tipo del archivo no coincide con el registro.',
            400,
          );
        }

        const bytes = await readEvidenceFile(request, item.tamano_bytes);

        const attachment = await application.meetingMinuteAttachments.upload(
          token,
          id,
          parsed.version_esperada,
          bytes,
          mimeType,
        );

        respond(
          response,
          200,
          success(
            'ADJUNTO_ACTA_CARGADO',
            'El archivo adjunto fue cargado correctamente.',
            { attachment },
          ),
          requestId,
        );
        return;
      }

      if (request.method === 'GET') {
        const file = await application.meetingMinuteAttachments.download(
          token,
          id,
        );

        response.statusCode = 200;
        response.setHeader('content-type', file.mimeType);
        response.setHeader(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        );
        response.setHeader('cache-control', 'private, no-store');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-request-id', requestId);
        response.end(file.bytes);
        return;
      }
    }

    if (await routeIndicators(request, response, url.pathname, requestId, token, indicators)) {
      return;
    }

    // Evidencias actuales de acciones: se mantienen sin cambios.
    if (url.pathname === '/v1/evidences') {
      if (request.method === 'GET') {
        const evidences = await application.evidences.list(
          token,
          parseEvidenceFilters(url),
        );

        respond(
          response,
          200,
          success('EVIDENCIAS_LISTADAS', 'Las evidencias fueron consultadas correctamente.', {
            evidences,
          }),
          requestId,
        );
        return;
      }

      if (request.method === 'POST') {
        const evidence = await application.evidences.create(
          token,
          parseCreateEvidence(await readJsonBody(request)),
        );

        respond(
          response,
          201,
          success('EVIDENCIA_CREADA', 'La evidencia fue registrada. Ahora carga el archivo.', {
            evidence,
          }),
          requestId,
        );
        return;
      }
    }

    const evidenceFileMatch = url.pathname.match(/^\/v1\/evidences\/([^/]+)\/file$/);

    if (evidenceFileMatch) {
      const id = uuid(decodeURIComponent(evidenceFileMatch[1]), 'La evidencia');

      if (request.method === 'PUT') {
        const parsed = parseUploadEvidence({
          version_esperada: Number(url.searchParams.get('version_esperada')),
        });

        const item = await application.evidences.getById(token, id);
        const mimeType =
          request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';

        if (mimeType !== item.mime_type) {
          throw new ServiceError(
            'ARCHIVO_INVALIDO',
            'El tipo del archivo no coincide con el registro.',
            400,
          );
        }

        const bytes = await readEvidenceFile(request, item.tamano_bytes);

        const evidence = await application.evidences.upload(
          token,
          id,
          parsed.version_esperada,
          bytes,
          mimeType,
        );

        respond(
          response,
          200,
          success('ARCHIVO_CARGADO', 'El archivo fue cargado correctamente.', { evidence }),
          requestId,
        );
        return;
      }

      if (request.method === 'GET') {
        const file = await application.evidences.download(token, id);

        response.statusCode = 200;
        response.setHeader('content-type', file.mimeType);
        response.setHeader(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        );
        response.setHeader('cache-control', 'private, no-store');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-request-id', requestId);
        response.end(file.bytes);
        return;
      }
    }

    const evidenceMatch = url.pathname.match(/^\/v1\/evidences\/([^/]+)$/);

    if (evidenceMatch) {
      const id = uuid(decodeURIComponent(evidenceMatch[1]), 'La evidencia');

      if (request.method === 'GET') {
        const evidence = await application.evidences.getById(token, id);

        respond(
          response,
          200,
          success('EVIDENCIA_OBTENIDA', 'La evidencia fue consultada correctamente.', {
            evidence,
          }),
          requestId,
        );
        return;
      }

      if (request.method === 'PATCH') {
        const evidence = await application.evidences.update(
          token,
          id,
          parseUpdateEvidence(await readJsonBody(request)),
        );

        respond(
          response,
          200,
          success('EVIDENCIA_ACTUALIZADA', 'La evidencia fue actualizada correctamente.', {
            evidence,
          }),
          requestId,
        );
        return;
      }
    }

    if (url.pathname === '/v1/plans') {
      if (request.method === 'GET') {
        const plans = await application.plans.list(token, parsePlanFilters(url));

        respond(
          response,
          200,
          success('PLANES_LISTADOS', 'Los planes fueron consultados correctamente.', { plans }),
          requestId,
        );
        return;
      }

      if (request.method === 'POST') {
        const plan = await application.plans.create(
          token,
          parsePlanFields(await readJsonBody(request)),
        );

        respond(
          response,
          201,
          success('PLAN_CREADO', 'El plan fue creado correctamente.', { plan }),
          requestId,
        );
        return;
      }
    }

    const planMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)$/);

    if (planMatch) {
      const id = uuid(decodeURIComponent(planMatch[1]), 'El plan');

      if (request.method === 'GET') {
        const plan = await application.plans.getById(token, id);

        respond(
          response,
          200,
          success('PLAN_OBTENIDO', 'El plan fue consultado correctamente.', { plan }),
          requestId,
        );
        return;
      }

      if (request.method === 'PATCH') {
        const plan = await application.plans.update(
          token,
          id,
          parsePlanUpdate(await readJsonBody(request)),
        );

        respond(
          response,
          200,
          success('PLAN_ACTUALIZADO', 'El plan fue actualizado correctamente.', { plan }),
          requestId,
        );
        return;
      }

      if (request.method === 'DELETE') {
        await application.plans.archive(
          token,
          id,
          parseArchiveInput(await readJsonBody(request)),
        );

        respond(
          response,
          200,
          success('PLAN_ARCHIVADO', 'El plan fue eliminado correctamente.', { id_plan: id }),
          requestId,
        );
        return;
      }
    }

    if (url.pathname === '/v1/actions') {
      if (request.method === 'GET') {
        const actions = await application.actions.list(token, parseActionFilters(url));

        respond(
          response,
          200,
          success('ACCIONES_LISTADAS', 'Las acciones fueron consultadas correctamente.', {
            actions,
          }),
          requestId,
        );
        return;
      }

      if (request.method === 'POST') {
        const action = await application.actions.create(
          token,
          parseActionFields(await readJsonBody(request)),
        );

        respond(
          response,
          201,
          success('ACCION_CREADA', 'La acción fue creada correctamente.', { action }),
          requestId,
        );
        return;
      }
    }

    const actionMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)$/);

    if (actionMatch) {
      const id = uuid(decodeURIComponent(actionMatch[1]), 'La acción');

      if (request.method === 'GET') {
        const action = await application.actions.getById(token, id);

        respond(
          response,
          200,
          success('ACCION_OBTENIDA', 'La acción fue consultada correctamente.', { action }),
          requestId,
        );
        return;
      }

      if (request.method === 'PATCH') {
        const action = await application.actions.update(
          token,
          id,
          parseActionUpdate(await readJsonBody(request)),
        );

        respond(
          response,
          200,
          success('ACCION_ACTUALIZADA', 'La acción fue actualizada correctamente.', { action }),
          requestId,
        );
        return;
      }

      if (request.method === 'DELETE') {
        await application.actions.archive(
          token,
          id,
          parseArchiveInput(await readJsonBody(request)),
        );

        respond(
          response,
          200,
          success('ACCION_ARCHIVADA', 'La acción fue eliminada correctamente.', {
            id_accion: id,
          }),
          requestId,
        );
        return;
      }
    }

    if (request.method === 'GET' && url.pathname === '/v1/meeting-minutes/catalog') {
      const organizationId = uuid(
        url.searchParams.get('id_organizacion'),
        'La organización',
      );

      const catalog = await application.meetingMinutes.catalog(token, organizationId);

      respond(
        response,
        200,
        success('CATALOGO_ACTAS', 'Opciones del acta consultadas.', { catalog }),
        requestId,
      );
      return;
    }

    if (url.pathname === '/v1/meeting-minutes') {
      if (request.method === 'GET') {
        const meetingMinutes = await application.meetingMinutes.list(
          token,
          parseMeetingMinuteFilters(url),
        );

        respond(
          response,
          200,
          success('ACTAS_LISTADAS', 'Las actas fueron consultadas correctamente.', {
            meetingMinutes,
          }),
          requestId,
        );
        return;
      }

      if (request.method === 'POST') {
        const meetingMinute = await application.meetingMinutes.create(
          token,
          parseCreateMeetingMinute(await readJsonBody(request)),
        );

        respond(
          response,
          201,
          success('ACTA_CREADA', 'El acta fue registrada correctamente.', {
            meetingMinute,
          }),
          requestId,
        );
        return;
      }
    }

    const meetingMinuteMatch = url.pathname.match(/^\/v1\/meeting-minutes\/([^/]+)$/);

    if (meetingMinuteMatch) {
      const id = uuid(decodeURIComponent(meetingMinuteMatch[1]), 'El acta');

      if (request.method === 'GET') {
        const meetingMinute = await application.meetingMinutes.getById(token, id);

        respond(
          response,
          200,
          success('ACTA_OBTENIDA', 'El acta fue consultada correctamente.', {
            meetingMinute,
          }),
          requestId,
        );
        return;
      }

      if (request.method === 'PATCH') {
        const meetingMinute = await application.meetingMinutes.update(
          token,
          id,
          parseUpdateMeetingMinute(await readJsonBody(request)),
        );

        respond(
          response,
          200,
          success('ACTA_ACTUALIZADA', 'El acta fue actualizada correctamente.', {
            meetingMinute,
          }),
          requestId,
        );
        return;
      }
    }

    respond(
      response,
      404,
      failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId),
      requestId,
    );
  } catch (error) {
    const serviceError =
      error instanceof ServiceError
        ? error
        : new ServiceError(
            'ERROR_INTERNO',
            'No fue posible completar la operación.',
            500,
            error,
          );

    respond(
      response,
      serviceError.status,
      failure(serviceError.code, serviceError.message, requestId),
      requestId,
    );
  }
}
