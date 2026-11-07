import { withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type {
  Program,
  ProgramFields,
  ProgramLine,
  ProgramsRepository,
  ProgramWithLines,
  UpdateProgramInput,
} from '../domain/programs.ts';

interface RepositoryOptions {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

const PROGRAM_FIELDS = [
  'id_programa', 'nombre', 'descripcion', 'objetivo_general', 'objetivos_especificos',
  'componentes_linea_accion', 'resultados_esperados', 'referencias_ods', 'referencias_esg',
  'created_at', 'updated_at', 'created_by', 'updated_by', 'archived_at', 'version',
].join(',');

const LINE_FIELDS = [
  'id_linea_accion', 'id_programa', 'linea_accion', 'resultado_esperado',
  'orden', 'created_at', 'updated_at', 'created_by', 'updated_by', 'archived_at', 'version',
].join(',');

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function databaseError(status: number, body: unknown): ServiceError {
  const detail = record(body);
  const code = typeof detail.code === 'string' ? detail.code : '';
  const message = typeof detail.message === 'string' ? detail.message : '';
  if (code === 'P0002') return new ServiceError('NO_ENCONTRADO', 'El programa solicitado no existe.', 404, detail);
  if (code === '40001') return new ServiceError('CONFLICTO_CONCURRENCIA', 'El programa fue modificado por otra sesión. Recarga los datos antes de volver a editar.', 409, detail);
  if (code === '42501' || status === 401 || status === 403) {
    return new ServiceError('SIN_PERMISO', 'La sesión no tiene permiso para gestionar programas.', status === 401 ? 401 : 403, detail);
  }
  if (['23502', '23503', '23505', '23514', '22023', '22P02'].includes(code)) {
    const known = new Set([
      'Debe enviar los campos del programa.', 'Campos de programa no permitidos.',
      'Campos de programa inválidos.', 'Referencias de programa invalidas.',
      'Faltan campos obligatorios.', 'Líneas de acción inválidas.',
      'Debe enviar entre 1 y 50 líneas.', 'Línea de acción inválida.',
      'Líneas de acción repetidas.',
    ]);
    return new ServiceError(
      'RESTRICCION_INCUMPLIDA',
      code === '22023' && known.has(message)
        ? message
        : 'Revisa los campos y las líneas de acción del programa.',
      400,
      detail,
    );
  }
  return new ServiceError('ERROR_BASE_DATOS', 'No fue posible completar la operación de programas.', 502, detail);
}

function program(value: unknown): Program {
  const data = record(value);
  if (typeof data.id_programa !== 'string' || typeof data.nombre !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un programa inválido.', 502);
  }
  return data as unknown as Program;
}

function line(value: unknown): ProgramLine {
  const data = record(value);
  if (typeof data.id_linea_accion !== 'string' || typeof data.linea_accion !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una línea de acción inválida.', 502);
  }
  return data as unknown as ProgramLine;
}

function completeProgram(value: unknown): ProgramWithLines {
  const data = program(value) as ProgramWithLines;
  if (!Array.isArray(data.lineas_accion)) {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un programa sin líneas de acción válidas.', 502);
  }
  return { ...data, lineas_accion: data.lineas_accion.map(line) };
}

export function createSupabaseProgramsRepository(options: RepositoryOptions): ProgramsRepository {
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.supabaseUrl);
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');

  async function request(path: string, accessToken: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: options.anonKey,
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw databaseError(response.status, body);
    return body;
  }

  async function programRows(accessToken: string, params: URLSearchParams, init?: RequestInit): Promise<Program[]> {
    params.set('select', PROGRAM_FIELDS);
    const body = await request(`programas?${params}`, accessToken, init);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
    return body.map(program);
  }

  async function listLines(accessToken: string, programId: string): Promise<ProgramLine[]> {
    const params = new URLSearchParams({
      select: LINE_FIELDS,
      id_programa: `eq.${programId}`,
      archived_at: 'is.null',
      order: 'orden.asc,id_linea_accion.asc',
    });
    const body = await request(`programa_lineas_accion?${params}`, accessToken);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió líneas inválidas.', 502);
    return body.map(line);
  }

  async function withLines(accessToken: string, programs: Program[]): Promise<ProgramWithLines[]> {
    return Promise.all(programs.map(async (item) => ({
      ...item,
      lineas_accion: await listLines(accessToken, item.id_programa),
    })));
  }

  async function save(
    accessToken: string,
    changes: Partial<ProgramFields>,
    id: string | null,
    expectedVersion: number | null,
  ): Promise<ProgramWithLines> {
    const body = await request('rpc/guardar_programa_completo', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        p_datos: changes,
        p_id_programa: id,
        p_version_esperada: expectedVersion,
      }),
    });
    return completeProgram(body);
  }

  return {
    async list(accessToken) {
      const rows = await programRows(accessToken, new URLSearchParams({
        archived_at: 'is.null', order: 'nombre.asc,id_programa.asc',
      }));
      return withLines(accessToken, rows);
    },
    async getById(accessToken, id) {
      const rows = await programRows(accessToken, new URLSearchParams({
        id_programa: `eq.${id}`, archived_at: 'is.null', limit: '1',
      }));
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADO', 'El programa solicitado no existe.', 404);
      return (await withLines(accessToken, rows))[0];
    },
    create(accessToken, fields) {
      return save(accessToken, fields, null, null);
    },
    update(accessToken, id, input: UpdateProgramInput) {
      return save(accessToken, input.changes, id, input.expectedVersion ?? null);
    },
    async archive(accessToken, id, expectedVersion) {
      const params = new URLSearchParams({
        id_programa: `eq.${id}`,
        version: `eq.${expectedVersion}`,
        archived_at: 'is.null',
      });
      const rows = await programRows(accessToken, params, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      });
      if (!rows[0]) {
        throw new ServiceError('CONFLICTO_CONCURRENCIA', 'No se pudo eliminar: el programa cambió, ya fue archivado o no tienes permiso. Recarga la página.', 409);
      }
      return rows[0];
    },
  };
}

function unconfiguredRepository(): ProgramsRepository {
  const unavailable = async (): Promise<never> => {
    throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Programas no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.', 503);
  };
  return { list: unavailable, getById: unavailable, create: unavailable, update: unavailable, archive: unavailable };
}

export function createSupabaseProgramsRepositoryFromEnv(): ProgramsRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unconfiguredRepository();
  return createSupabaseProgramsRepository({ supabaseUrl, anonKey });
}
