import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type {
  CountrySummary,
  Organization,
  OrganizationFields,
  OrganizationFilters,
  OrganizationsRepository,
} from '../domain/organizations.ts';

interface RepositoryOptions {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

const ORGANIZATION_FIELDS = [
  'id_organizacion', 'id_pais', 'nombre', 'nombre_representante', 'telefono',
  'correo', 'region_departamento', 'comuna_municipio_ciudad', 'direccion',
  'publico_objetivo', 'descripcion_breve', 'tipo_organizacion',
  'tipo_organizacion_otro', 'numero_beneficiarios', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'archived_at', 'version',
  'pais:paises!organizaciones_id_pais_fkey(id_pais,codigo_iso,nombre)',
].join(',');

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function postgrestError(status: number, body: unknown): ServiceError {
  const detail = record(body);
  const code = typeof detail.code === 'string' ? detail.code : '';
  if (code === '23503') {
    return new ServiceError('PAIS_NO_EXISTE', 'El país indicado no existe o ya no está disponible.', 409, detail);
  }
  if (['23502', '23514', '22P02'].includes(code)) {
    return new ServiceError('RESTRICCION_INCUMPLIDA', 'La organización no cumple las restricciones de la base de datos.', 400, detail);
  }
  if (code === '42501' || status === 401 || status === 403) {
    return new ServiceError('SIN_PERMISO', 'La sesión no tiene permiso para realizar esta operación.', status === 401 ? 401 : 403, detail);
  }
  return new ServiceError('ERROR_BASE_DATOS', 'No fue posible completar la operación de organizaciones.', 502, detail);
}

function organization(value: unknown): Organization {
  const data = record(value);
  if (typeof data.id_organizacion !== 'string' || typeof data.nombre !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una organización inválida.', 502);
  }
  return data as unknown as Organization;
}

function country(value: unknown): CountrySummary {
  const data = record(value);
  if (typeof data.id_pais !== 'string' || typeof data.codigo_iso !== 'string' || typeof data.nombre !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un país inválido.', 502);
  }
  return data as unknown as CountrySummary;
}

export function createSupabaseOrganizationsRepository(options: RepositoryOptions): OrganizationsRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');

  async function request(
    table: string,
    accessToken: string,
    params: URLSearchParams,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${table}?${params}`, {
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
    if (!response.ok) throw postgrestError(response.status, body);
    return body;
  }

  async function organizationRows(
    accessToken: string,
    params: URLSearchParams,
    init?: RequestInit,
  ): Promise<Organization[]> {
    params.set('select', ORGANIZATION_FIELDS);
    const body = await request('organizaciones', accessToken, params, init);
    if (!Array.isArray(body)) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
    }
    return body.map(organization);
  }

  return {
    async list(accessToken, filters) {
      const params = new URLSearchParams({ order: 'nombre.asc' });
      if (!filters.includeArchived) params.set('archived_at', 'is.null');
      if (filters.idPais) params.set('id_pais', `eq.${filters.idPais}`);
      return organizationRows(accessToken, params);
    },

    async getById(accessToken, id) {
      const rows = await organizationRows(accessToken, new URLSearchParams({
        id_organizacion: `eq.${id}`,
        archived_at: 'is.null',
        limit: '1',
      }));
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADA', 'La organización solicitada no existe.', 404);
      return rows[0];
    },

    async create(accessToken, fields) {
      const rows = await organizationRows(accessToken, new URLSearchParams(), {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(fields),
      });
      if (!rows[0]) throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible crear la organización.', 502);
      return rows[0];
    },

    async update(accessToken, id, changes, expectedVersion) {
      const params = new URLSearchParams({
        id_organizacion: `eq.${id}`,
        archived_at: 'is.null',
      });
      if (expectedVersion !== undefined) params.set('version', `eq.${expectedVersion}`);
      const rows = await organizationRows(accessToken, params, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(changes),
      });
      if (!rows[0]) {
        throw new ServiceError(
          expectedVersion === undefined ? 'NO_ENCONTRADA' : 'CONFLICTO_CONCURRENCIA',
          expectedVersion === undefined
            ? 'La organización solicitada no existe.'
            : 'La organización fue modificada por otra sesión.',
          expectedVersion === undefined ? 404 : 409,
        );
      }
      return rows[0];
    },

    async listCountries(accessToken) {
      const body = await request('paises', accessToken, new URLSearchParams({
        select: 'id_pais,codigo_iso,nombre',
        archived_at: 'is.null',
        order: 'nombre.asc',
      }));
      if (!Array.isArray(body)) {
        throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
      }
      return body.map(country);
    },
  };
}

function unconfiguredRepository(): OrganizationsRepository {
  const unavailable = async (): Promise<never> => {
    throw new ServiceError(
      'CONFIGURACION_SUPABASE',
      'El servicio de Organizaciones no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.',
      503,
    );
  };
  return {
    list: unavailable,
    getById: unavailable,
    create: unavailable,
    update: unavailable,
    listCountries: unavailable,
  };
}

export function createSupabaseOrganizationsRepositoryFromEnv(): OrganizationsRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unconfiguredRepository();
  return createSupabaseOrganizationsRepository({ supabaseUrl, anonKey });
}
