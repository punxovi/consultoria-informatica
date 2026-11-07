import { withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import {
  assertFileSignature, assertPublicationChange, type CreateEvidenceInput, type Evidence, type EvidencesRepository,
  type UpdateEvidenceInput,
} from '../domain/evidences.ts';

const FIELDS = [
  'id_evidencia','id_accion','origen','descripcion','incorporado_at','incorporado_por',
  'consentimiento_declarado','declaracion_consentimiento','consentimiento_at','consentimiento_por',
  'estado_publicacion','publicado','publicacion_actualizada_at','publicacion_actualizada_por',
  'bucket_id','ruta_objeto','nombre_original','mime_type','tamano_bytes','estado_carga',
  'created_at','updated_at','created_by','updated_by','archived_at','version',
].join(',');

type Options = { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch };
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function fail(status: number, body: unknown): ServiceError {
  const data = object(body);
  const code = typeof data.code === 'string' ? data.code : '';
  if (code === '40001') return new ServiceError('CONFLICTO_CONCURRENCIA', 'La evidencia cambió. Recarga antes de guardar.', 409, data);
  if (code === '23503') return new ServiceError('ACCION_NO_EXISTE', 'La acción indicada no existe o no está disponible.', 409, data);
  if (['23502','23514','22P02'].includes(code)) return new ServiceError('RESTRICCION_INCUMPLIDA', String(data.message || 'La evidencia incumple una restricción.'), 400, data);
  if (status === 401) return new ServiceError('SESION_REQUERIDA', 'La sesión no está vigente.', 401, data);
  if (status === 403 || code === '42501') return new ServiceError('SIN_PERMISO', 'No tienes permiso para gestionar esta evidencia.', 403, data);
  return new ServiceError('ERROR_BASE_DATOS', 'No fue posible completar la operación de Evidencias.', 502, data);
}
function storageFail(status: number): ServiceError {
  if (status === 401) return new ServiceError('SESION_REQUERIDA', 'La sesión no está vigente.', 401);
  if (status === 403) return new ServiceError('SIN_PERMISO', 'No tienes permiso para acceder al archivo.', 403);
  if (status === 404) return new ServiceError('ARCHIVO_NO_ENCONTRADO', 'El archivo no está disponible en Storage.', 404);
  if (status === 409) return new ServiceError('ARCHIVO_YA_CARGADO', 'El archivo ya existe. Confirma la carga pendiente.', 409);
  if (status === 413) return new ServiceError('ARCHIVO_DEMASIADO_GRANDE', 'El archivo supera el límite permitido.', 413);
  if (status === 400 || status === 415) return new ServiceError('ARCHIVO_INVALIDO', 'Storage rechazó el tipo o contenido del archivo.', 400);
  return new ServiceError('ERROR_STORAGE', 'No fue posible operar el archivo en Storage.', 502);
}
function evidence(value: unknown): Evidence {
  const data = object(value);
  if (typeof data.id_evidencia !== 'string' || typeof data.id_accion !== 'string' ||
    typeof data.ruta_objeto !== 'string' || typeof data.mime_type !== 'string' ||
    typeof data.tamano_bytes !== 'number' || typeof data.version !== 'number') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una evidencia inválida.', 502);
  }
  return data as Evidence;
}
function flattened(input: CreateEvidenceInput | UpdateEvidenceInput['cambios']): Record<string, unknown> {
  const { consentimiento, ...fields } = input;
  return consentimiento ? { ...fields, ...consentimiento } : fields;
}

export function createSupabaseEvidencesRepository(options: Options): EvidencesRepository {
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.supabaseUrl);
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');
  const headers = (token: string, extra?: HeadersInit) => {
    const result = new Headers(extra);
    result.set('apikey', options.anonKey);
    result.set('authorization', `Bearer ${token}`);
    return result;
  };
  async function database(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
        ...init, headers: headers(token, (() => {
          const values = new Headers(init.headers);
          values.set('content-type', 'application/json');
          return values;
        })()),
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }
    let data: unknown;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw fail(response.status, data);
    return data;
  }
  async function rows(token: string, params: URLSearchParams, init?: RequestInit): Promise<Evidence[]> {
    params.set('select', FIELDS);
    const data = await database(`evidencias?${params}`, token, init);
    if (!Array.isArray(data)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una lista inválida.', 502);
    return data.map(evidence);
  }
  async function getById(token: string, id: string): Promise<Evidence> {
    const found = await rows(token, new URLSearchParams({ id_evidencia: `eq.${id}`, archived_at: 'is.null', limit: '1' }));
    if (!found[0]) throw new ServiceError('NO_ENCONTRADA', 'La evidencia no existe o no está disponible.', 404);
    return found[0];
  }
  async function checkAction(token: string, actionId: string): Promise<void> {
    const params = new URLSearchParams({ id_accion: `eq.${actionId}`, archived_at: 'is.null', select: 'id_accion', limit: '1' });
    const data = await database(`acciones?${params}`, token);
    if (!Array.isArray(data)) throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible validar la acción.', 502);
    if (!data.length) throw new ServiceError('ACCION_NO_EXISTE', 'La acción no existe o no está disponible.', 409);
  }
  async function change(token: string, id: string, expectedVersion: number, fields: Record<string, unknown>): Promise<Evidence> {
    const params = new URLSearchParams({ id_evidencia: `eq.${id}`, archived_at: 'is.null', version: `eq.${expectedVersion}` });
    const updated = await rows(token, params, {
      method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(fields),
    });
    if (!updated[0]) throw new ServiceError('CONFLICTO_CONCURRENCIA', 'La evidencia cambió. Recarga antes de guardar.', 409);
    return updated[0];
  }
  async function storage(token: string, item: Evidence, method: 'POST' | 'GET', bytes?: Buffer): Promise<Response> {
    const path = `${encodeURIComponent(item.bucket_id)}/${item.ruta_objeto.split('/').map(encodeURIComponent).join('/')}`;
    try {
      return await fetchImpl(`${baseUrl}/storage/v1/object/${path}`, {
        method, headers: headers(token, method === 'POST' ? {
          'content-type': item.mime_type, 'x-upsert': 'false',
        } : undefined), body: bytes,
      });
    } catch (error) {
      throw new ServiceError('STORAGE_NO_DISPONIBLE', 'No fue posible conectar con Storage.', 503, error);
    }
  }
  return {
    async list(token, filters) {
      await checkAction(token, filters.actionId);
      return rows(token, new URLSearchParams({ id_accion: `eq.${filters.actionId}`, archived_at: 'is.null', order: 'incorporado_at.desc' }));
    },
    getById,
    async create(token, input) {
      await checkAction(token, input.id_accion);
      const created = await rows(token, new URLSearchParams(), {
        method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(flattened(input)),
      });
      if (!created[0]) throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible registrar la evidencia.', 502);
      return created[0];
    },
    async update(token, id, input) {
      const current = await getById(token, id);
      if (current.version !== input.version_esperada) throw new ServiceError('CONFLICTO_CONCURRENCIA', 'La evidencia cambió. Recarga antes de guardar.', 409);
      assertPublicationChange(current, input.cambios);
      return change(token, id, input.version_esperada, flattened(input.cambios));
    },
    async upload(token, id, expectedVersion, bytes, mimeType) {
      const item = await getById(token, id);
      if (item.version !== expectedVersion) throw new ServiceError('CONFLICTO_CONCURRENCIA', 'La evidencia cambió. Recarga antes de cargar.', 409);
      if (item.estado_carga !== 'reservado') throw new ServiceError('CARGA_NO_DISPONIBLE', 'Esta evidencia ya no acepta archivos.', 409);
      if (mimeType !== item.mime_type || bytes.length !== item.tamano_bytes) {
        throw new ServiceError('ARCHIVO_INVALIDO', 'El tipo o tamaño no coincide con los metadatos registrados.', 400);
      }
      assertFileSignature(bytes, mimeType);
      const result = await storage(token, item, 'POST', bytes);
      // Si Storage aceptó el archivo pero falló la confirmación en PostgREST,
      // un reintento puede completar el estado sin reemplazar el objeto.
      if (!result.ok) {
        const error = object(await result.json().catch(() => null));
        const duplicate = result.status === 409 || (result.status === 400 &&
          (error.error === 'Duplicate' || error.code === 'Duplicate' || String(error.statusCode) === '409'));
        if (!duplicate) throw storageFail(result.status);
        const existing = await storage(token, item, 'GET');
        if (!existing.ok) throw storageFail(existing.status);
        if (!Buffer.from(await existing.arrayBuffer()).equals(bytes)) {
          throw new ServiceError('ARCHIVO_DISTINTO', 'La reserva ya contiene otro archivo. Selecciona el archivo original para confirmar su carga.', 409);
        }
      }
      return change(token, id, expectedVersion, { estado_carga: 'disponible' });
    },
    async download(token, id) {
      const item = await getById(token, id);
      if (item.estado_carga !== 'disponible') throw new ServiceError('ARCHIVO_NO_DISPONIBLE', 'El archivo aún no está disponible.', 409);
      const result = await storage(token, item, 'GET');
      if (!result.ok) throw storageFail(result.status);
      await database('rpc/registrar_acceso_archivo',token,{method:'POST',body:JSON.stringify({p_tipo:'evidencia',p_id:id})});
      return { bytes: Buffer.from(await result.arrayBuffer()), mimeType: item.mime_type, fileName: item.nombre_original };
    },
  };
}

export function createSupabaseEvidencesRepositoryFromEnv(): EvidencesRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && anonKey) return createSupabaseEvidencesRepository({ supabaseUrl, anonKey });
  const unavailable = async (): Promise<never> => {
    throw new ServiceError('CONFIGURACION_SUPABASE', 'Evidencias requiere SUPABASE_URL y SUPABASE_ANON_KEY.', 503);
  };
  return { list: unavailable, getById: unavailable, create: unavailable, update: unavailable, upload: unavailable, download: unavailable };
}
