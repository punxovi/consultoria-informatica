import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type {
  ActionInsight, CountryInsight, InsightsRepository, OrganizationInsight, PlanInsight, RawInsights, ReportAudit,
} from '../domain/insights.ts';

interface RepositoryOptions { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function databaseError(status: number, body: unknown): ServiceError {
  const detail = record(body);
  const code = typeof detail.code === 'string' ? detail.code : '';
  if (code === '42501' || status === 401 || status === 403) {
    return new ServiceError('SIN_PERMISO', 'La sesión no tiene permiso para consultar métricas y reportes.', status === 401 ? 401 : 403, detail);
  }
  return new ServiceError('ERROR_BASE_DATOS', 'No fue posible consultar la información del Dashboard.', 502, detail);
}

function rows<T>(body: unknown, validate: (value: unknown) => T): T[] {
  if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió métricas inválidas.', 502);
  return body.map(validate);
}

function country(value: unknown): CountryInsight {
  const item = record(value);
  if (typeof item.id_pais !== 'string' || typeof item.codigo_iso !== 'string' || typeof item.nombre !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un país inválido.', 502);
  }
  return item as unknown as CountryInsight;
}
function organization(value: unknown): OrganizationInsight {
  const item = record(value);
  if (typeof item.id_organizacion !== 'string' || typeof item.id_pais !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una organización inválida.', 502);
  }
  return item as unknown as OrganizationInsight;
}
function plan(value: unknown): PlanInsight {
  const item = record(value);
  if (typeof item.id_plan !== 'string' || typeof item.id_organizacion !== 'string' || typeof item.fecha_inicio !== 'string' || typeof item.fecha_termino !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un plan inválido.', 502);
  }
  return item as unknown as PlanInsight;
}
function action(value: unknown): ActionInsight {
  const item = record(value);
  if (typeof item.id_accion !== 'string' || typeof item.id_plan !== 'string' || typeof item.estado !== 'string' || typeof item.fecha_termino !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una acción inválida.', 502);
  }
  return item as unknown as ActionInsight;
}

export function createSupabaseInsightsRepository(options: RepositoryOptions): InsightsRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');
  async function request(table: string, query: URLSearchParams, token: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${table}?${query}`, {
        headers: { apikey: options.anonKey, authorization: `Bearer ${token}`, accept: 'application/json' },
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw databaseError(response.status, body);
    return body;
  }
  async function auditExport(token: string, audit: ReportAudit): Promise<void> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/rpc/registrar_exportacion_reporte`, {
        method: 'POST',
        headers: {
          apikey: options.anonKey,
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_destino: audit.destination, p_filtros: audit.filters }),
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible registrar la exportación.', 503, error);
    }
    if (!response.ok) {
      let body: unknown = null;
      try { body = await response.json(); } catch { body = null; }
      throw databaseError(response.status, body);
    }
  }
  return {
    async load(token): Promise<RawInsights> {
      const [countries, organizations, plans, actions] = await Promise.all([
        request('paises', new URLSearchParams({ select: 'id_pais,codigo_iso,nombre', archived_at: 'is.null', order: 'nombre.asc' }), token),
        request('organizaciones', new URLSearchParams({ select: 'id_organizacion,id_pais,numero_beneficiarios', archived_at: 'is.null' }), token),
        request('planes', new URLSearchParams({ select: 'id_plan,id_organizacion,fecha_inicio,fecha_termino', archived_at: 'is.null' }), token),
        request('acciones', new URLSearchParams({ select: 'id_accion,id_plan,fecha_inicio,fecha_termino,estado', archived_at: 'is.null' }), token),
      ]);
      return {
        countries: rows(countries, country), organizations: rows(organizations, organization),
        plans: rows(plans, plan), actions: rows(actions, action),
      };
    },
    auditExport,
  };
}

export function createSupabaseInsightsRepositoryFromEnv(): InsightsRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return {
      async load() { throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Dashboard y Reportes no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.', 503); },
      async auditExport() { throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Reportes no puede registrar auditoría sin configuración de Supabase.', 503); },
    };
  }
  return createSupabaseInsightsRepository({ supabaseUrl, anonKey });
}
