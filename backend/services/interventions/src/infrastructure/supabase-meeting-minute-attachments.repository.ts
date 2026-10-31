
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import {
  MEETING_MINUTE_ATTACHMENT_MAX_BYTES,
  type CreateMeetingMinuteAttachmentInput,
  type MeetingMinuteAttachment,
  type MeetingMinuteAttachmentFile,
  type MeetingMinuteAttachmentsRepository,
} from '../domain/meeting-minute-attachments.ts';
import { assertFileSignature } from '../domain/evidences.ts';
import { randomUUID } from 'node:crypto';

type Options = {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
};

const FIELDS = [
  'id_adjunto',
  'id_acta',
  'bucket_id',
  'ruta_objeto',
  'nombre_original',
  'mime_type',
  'tamano_bytes',
  'estado_carga',
  'version',
  'created_at',
  'updated_at',
  'archived_at',
].join(',');

function attachment(value: unknown): MeetingMinuteAttachment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError('RESPUESTA_INVALIDA', 'Supabase devolvió un adjunto inválido.', 502);
  }

  const item = value as Record<string, unknown>;

  return {
    id_adjunto: String(item.id_adjunto),
    id_acta: String(item.id_acta),
    bucket_id: 'fge-evidencias',
    ruta_objeto: String(item.ruta_objeto),
    nombre_original: String(item.nombre_original),
    mime_type: item.mime_type as MeetingMinuteAttachment['mime_type'],
    tamano_bytes: Number(item.tamano_bytes),
    estado_carga: item.estado_carga as MeetingMinuteAttachment['estado_carga'],
    version: Number(item.version),
    created_at: String(item.created_at),
    updated_at: String(item.updated_at),
    archived_at: item.archived_at ? String(item.archived_at) : null,
  };
}

function databaseError(status: number): ServiceError {
  if (status === 401 || status === 403) {
    return new ServiceError('SIN_PERMISO', 'No tienes permiso para gestionar este adjunto.', status);
  }

  if (status === 404) {
    return new ServiceError('NO_ENCONTRADO', 'El adjunto no existe o no está disponible.', 404);
  }

  if (status === 409) {
    return new ServiceError('CONFLICTO', 'El adjunto cambió o ya existe.', 409);
  }

  return new ServiceError('ERROR_SUPABASE', 'No fue posible completar la operación con Supabase.', 502);
}

export function createSupabaseMeetingMinuteAttachmentsRepository(
  options: Options,
): MeetingMinuteAttachmentsRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');

  const headers = (token: string, extra?: HeadersInit) => {
    const result = new Headers(extra);
    result.set('apikey', options.anonKey);
    result.set('authorization', `Bearer ${token}`);
    return result;
  };

  async function database(
    path: string,
    token: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
        ...init,
        headers: headers(token, {
          'content-type': 'application/json',
          ...Object.fromEntries(new Headers(init.headers).entries()),
        }),
      });
    } catch {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con Supabase.', 503);
    }

    if (!response.ok) throw databaseError(response.status);

    if (response.status === 204) return null;

    try {
      return await response.json();
    } catch {
      throw new ServiceError('RESPUESTA_INVALIDA', 'Supabase devolvió una respuesta inválida.', 502);
    }
  }

  async function rows(token: string, params: URLSearchParams, init?: RequestInit) {
    params.set('select', FIELDS);
    const data = await database(`adjuntos_acta?${params}`, token, init);

    if (!Array.isArray(data)) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'Supabase devolvió una lista inválida.', 502);
    }

    return data.map(attachment);
  }

  async function getById(token: string, id: string): Promise<MeetingMinuteAttachment> {
    const found = await rows(token, new URLSearchParams({
      id_adjunto: `eq.${id}`,
      archived_at: 'is.null',
      limit: '1',
    }));

    if (!found[0]) {
      throw new ServiceError('NO_ENCONTRADO', 'El adjunto no existe o no está disponible.', 404);
    }

    return found[0];
  }

  async function storage(
    token: string,
    item: MeetingMinuteAttachment,
    method: 'POST' | 'GET' | 'DELETE',
    bytes?: Buffer,
  ): Promise<Response> {
    const path = [
      encodeURIComponent(item.bucket_id),
      ...item.ruta_objeto.split('/').map(encodeURIComponent),
    ].join('/');

    try {
      return await fetchImpl(`${baseUrl}/storage/v1/object/${path}`, {
        method,
        headers: headers(token, method === 'POST' ? {
          'content-type': item.mime_type,
          'x-upsert': 'false',
        } : undefined),
        body: bytes,
      });
    } catch {
      throw new ServiceError('STORAGE_NO_DISPONIBLE', 'No fue posible conectar con Storage.', 503);
    }
  }

  return {
    async list(token, filters) {
      return rows(token, new URLSearchParams({
        id_acta: `eq.${filters.id_acta}`,
        archived_at: 'is.null',
        order: 'created_at.asc',
      }));
    },

    async getById(token, id) {
      return getById(token, id);
    },

    async create(token, input: CreateMeetingMinuteAttachmentInput) {
      const id = randomUUID();

      const rutaObjeto = `actas/${input.id_acta}/${id}`;

      const created = await rows(token, new URLSearchParams(), {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          ...input,
          id_adjunto: id,
          bucket_id: 'fge-evidencias',
          ruta_objeto: rutaObjeto,
          estado_carga: 'reservado',
        }),
      });

      if (!created[0]) {
        throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible registrar el adjunto.', 502);
      }

      return created[0];
    },

    async upload(token, id, expectedVersion, bytes, mimeType) {
      const item = await getById(token, id);

      if (item.version !== expectedVersion) {
        throw new ServiceError('CONFLICTO_CONCURRENCIA', 'El adjunto cambió. Recarga antes de cargar.', 409);
      }

      if (!['reservado', 'fallido'].includes(item.estado_carga)) {
        throw new ServiceError('CARGA_NO_DISPONIBLE', 'Este adjunto ya está disponible.', 409);
      }

      if (
        bytes.length !== item.tamano_bytes ||
        bytes.length > MEETING_MINUTE_ATTACHMENT_MAX_BYTES ||
        mimeType !== item.mime_type
      ) {
        throw new ServiceError('ARCHIVO_INVALIDO', 'El archivo no coincide con el registro.', 400);
      }

      assertFileSignature(bytes, mimeType);

      const result = await storage(token, item, 'POST', bytes);

      if (!result.ok) {
        const duplicate = result.status === 409;

        if (!duplicate) {
          throw new ServiceError('STORAGE_ERROR', 'No fue posible almacenar el archivo.', 502);
        }

        const existing = await storage(token, item, 'GET');

        if (!existing.ok) {
          throw new ServiceError('STORAGE_ERROR', 'No fue posible verificar el archivo existente.', 502);
        }

        const existingBytes = Buffer.from(await existing.arrayBuffer());

        if (!existingBytes.equals(bytes)) {
          throw new ServiceError('ARCHIVO_DUPLICADO', 'El archivo almacenado no coincide con el nuevo.', 409);
        }
      }

      const updated = await rows(token, new URLSearchParams({
        id_adjunto: `eq.${id}`,
        version: `eq.${expectedVersion}`,
        estado_carga: `in.(reservado,fallido)`,
        archived_at: 'is.null',
      }), {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          estado_carga: 'disponible',
          version: expectedVersion + 1,
        }),
      });

      if (!updated[0]) {
        throw new ServiceError('CONFLICTO_CONCURRENCIA', 'No fue posible confirmar la carga del adjunto.', 409);
      }

      return updated[0];
    },

    async download(token, id): Promise<MeetingMinuteAttachmentFile> {
      const item = await getById(token, id);

      if (item.estado_carga !== 'disponible') {
        throw new ServiceError('ARCHIVO_NO_DISPONIBLE', 'El archivo aún no está disponible.', 409);
      }

      const result = await storage(token, item, 'GET');

      if (!result.ok) {
        throw new ServiceError('STORAGE_ERROR', 'No fue posible descargar el archivo.', 502);
      }

      return {
        bytes: Buffer.from(await result.arrayBuffer()),
        mimeType: item.mime_type,
        fileName: item.nombre_original,
      };
    },
    async delete(token, id): Promise<void> {
      const item = await getById(token, id);
      const storageResponse = await storage(token, item, 'DELETE');

      if (!storageResponse.ok && storageResponse.status !== 404) {
        throw new ServiceError(
          'STORAGE_ERROR',
          'No fue posible eliminar el archivo almacenado.',
          502,
        );
      }
      const deleted = await rows(
        token,
        new URLSearchParams({
          id_adjunto: `eq.${id}`,
          archived_at: 'is.null',
        }),
        {
          method: 'DELETE',
          headers: {
            prefer: 'return=representation',
          },
        },
      );

      if (!deleted[0]) {
        throw new ServiceError(
          'NO_ENCONTRADO',
          'No fue posible eliminar el registro del adjunto.',
          404,
        );
      }
    },

    };
}
export function createSupabaseMeetingMinuteAttachmentsRepositoryFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new ServiceError(
      'CONFIGURACION_INVALIDA',
      'Falta configurar SUPABASE_URL o SUPABASE_ANON_KEY.',
      500,
    );
  }

  return createSupabaseMeetingMinuteAttachmentsRepository({
    supabaseUrl,
    anonKey,
  });
}
