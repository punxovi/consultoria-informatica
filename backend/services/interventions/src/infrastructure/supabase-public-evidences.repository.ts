import { withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { ALLOWED_EVIDENCE_MIME_TYPES, MAX_EVIDENCE_BYTES, type EvidenceFile } from '../domain/evidences.ts';

export interface PublicEvidencesRepository { download(id: string): Promise<EvidenceFile> }
type Options = { supabaseUrl: string; publicationKey: string; fetchImpl?: typeof fetch };
type PublishedFile = {
  bucket_id: string; ruta_objeto: string; nombre_original: string;
  mime_type: string; tamano_bytes: number; version: number;
};
const unavailable = () => new ServiceError('PUBLICACION_NO_ENCONTRADA', 'La publicación no está disponible.', 404);

/** Credencial exclusiva del servidor. Nunca se utiliza en las operaciones de gestión. */
export function createSupabasePublicEvidencesRepository(options: Options): PublicEvidencesRepository {
  const base = options.supabaseUrl.replace(/\/$/, '');
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.supabaseUrl);
  const headers: Record<string,string> = { apikey: options.publicationKey };
  // Las nuevas secret keys no son JWT. Las service_role legacy sí usan Bearer.
  if (!options.publicationKey.startsWith('sb_secret_')) headers.authorization = `Bearer ${options.publicationKey}`;
  async function request(path: string, init: RequestInit = {}) {
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init, headers: { ...headers, ...init.headers }, redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ServiceError('PUBLICACION_NO_DISPONIBLE', 'No fue posible consultar la publicación.', 503);
    }
  }
  async function resolve(id: string): Promise<PublishedFile> {
    const response = await request('/rest/v1/rpc/obtener_archivo_evidencia_publicada', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_id: id }),
    });
    if (!response.ok) throw new ServiceError('PUBLICACION_NO_DISPONIBLE', 'No fue posible consultar la publicación.', 503);
    const rows: unknown = await response.json().catch(() => null);
    if (!Array.isArray(rows)) throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible interpretar la publicación.', 502);
    if (!rows.length) throw unavailable();
    const file = rows[0] as PublishedFile;
    if (rows.length !== 1 || !file || typeof file !== 'object' || file.bucket_id !== 'fge-evidencias' ||
      typeof file.ruta_objeto !== 'string' ||
      !new RegExp(`^[0-9a-f-]{36}/${id}$`, 'i').test(file.ruta_objeto) ||
      !ALLOWED_EVIDENCE_MIME_TYPES.includes(file.mime_type as typeof ALLOWED_EVIDENCE_MIME_TYPES[number]) ||
      !Number.isSafeInteger(file.tamano_bytes) || file.tamano_bytes < 1 || file.tamano_bytes > MAX_EVIDENCE_BYTES ||
      typeof file.nombre_original !== 'string' || !Number.isSafeInteger(file.version) || file.version < 1) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible interpretar la publicación.', 502);
    }
    return file;
  }
  return {
    async download(id) {
      const file = await resolve(id);
      const path = file.ruta_objeto.split('/').map(encodeURIComponent).join('/');
      const response = await request(`/storage/v1/object/authenticated/fge-evidencias/${path}`);
      if (!response.ok) {
        if (response.status === 404 || response.status === 400) throw unavailable();
        throw new ServiceError('PUBLICACION_NO_DISPONIBLE', 'No fue posible obtener el archivo.', 503);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== file.tamano_bytes) throw new ServiceError('ARCHIVO_INVALIDO', 'No fue posible verificar el archivo.', 502);
      // Un retiro/revocación durante la descarga impide entregar el contenido.
      const current = await resolve(id);
      if (current.version !== file.version) throw unavailable();
      return { bytes, mimeType: file.mime_type, fileName: file.nombre_original };
    },
  };
}

export function createSupabasePublicEvidencesRepositoryFromEnv(): PublicEvidencesRepository {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publicationKey = process.env.SUPABASE_PUBLICATION_KEY;
  if (supabaseUrl && publicationKey) return createSupabasePublicEvidencesRepository({ supabaseUrl, publicationKey });
  return { async download() {
    throw new ServiceError('PUBLICACION_NO_CONFIGURADA', 'La publicación institucional aún no está disponible.', 503);
  } };
}
