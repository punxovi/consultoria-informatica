import { withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
import { parseConsolidatedSnapshot, validateConsolidatedFilters } from '../domain/consolidated-report.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type {
  ActionInsight, CountryInsight, InsightsRepository, OrganizationInsight, PlanInsight, RawInsights, ReportAudit,
  ConsolidatedReportFilters, ConsolidatedReportSnapshot
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

// Adaptación para aceptar el nombre de la organización
function organization(value: unknown): OrganizationInsight {
  const item = record(value);
  if (typeof item.id_organizacion !== 'string' || typeof item.id_pais !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una organización inválida.', 502);
  }
  return { ...item, nombre: typeof item.nombre === 'string' ? item.nombre : 'Sin nombre' } as unknown as OrganizationInsight;
}

// Adaptación para aceptar el nombre del plan y del programa asociado
function plan(value: unknown): PlanInsight {
  const item = record(value);
  if (typeof item.id_plan !== 'string' || typeof item.id_organizacion !== 'string' || typeof item.fecha_inicio !== 'string' || typeof item.fecha_termino !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un plan inválido.', 502);
  }
  const prog = item.programa as Record<string, unknown> | undefined;
  return { 
    ...item, 
    nombre: typeof item.nombre === 'string' ? item.nombre : 'Sin nombre',
    id_programa: typeof item.id_programa === 'string' ? item.id_programa : null,
    programa_nombre: prog && typeof prog.nombre === 'string' ? prog.nombre : null
  } as unknown as PlanInsight;
}

// Adaptación para aceptar el nombre de la acción
function action(value: unknown): ActionInsight {
  const item = record(value);
  if (typeof item.id_accion !== 'string' || typeof item.id_plan !== 'string' || typeof item.estado !== 'string' || typeof item.fecha_termino !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una acción inválida.', 502);
  }
  return { ...item, nombre: typeof item.nombre === 'string' ? item.nombre : 'Sin nombre' } as unknown as ActionInsight;
}

export function createSupabaseInsightsRepository(options: RepositoryOptions): InsightsRepository {
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.supabaseUrl);
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

  async function loadConsolidated(token: string, input: ConsolidatedReportFilters): Promise<ConsolidatedReportSnapshot> {
    const filters = validateConsolidatedFilters(input);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/rpc/consultar_reporte_consolidado`, {
        method: 'POST',
        headers: { apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ p_filtros: filters }), signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE','No fue posible consultar el consolidado.',503,error);
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = record(body).code;
      if (['22023','22007','22008','22P02'].includes(String(code))) throw new ServiceError('DATOS_INVALIDOS','El rango o los filtros del consolidado no son válidos.',400);
      if (code === '54000') throw new ServiceError('REPORTE_DEMASIADO_GRANDE','Reduce el período o los filtros del reporte.',413);
      if (code === 'PGRST202' || code === '42883') throw new ServiceError('MIGRACION_PENDIENTE','Falta aplicar la migración HU22 del reporte consolidado.',503);
      throw databaseError(response.status,body);
    }
    return parseConsolidatedSnapshot(body,filters);
  }

  return {
    async getReportActor(token):Promise<string> {
      let response:Response;
      try {
        response=await fetchImpl(`${baseUrl}/auth/v1/user`,{headers:{apikey:options.anonKey,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});
      } catch {
        throw new ServiceError('SUPABASE_NO_DISPONIBLE','No fue posible validar la sesión para el reporte.',503);
      }
      if(!response.ok)throw databaseError(response.status,{});
      const body=record(await response.json().catch(()=>null));
      if(typeof body.id!=='string'||!body.id)throw new ServiceError('RESPUESTA_INVALIDA','Supabase no devolvió una identidad válida para el reporte.',502);
      return body.id;
    },
    async load(token): Promise<RawInsights> {
      // Modificamos las proyecciones `select` para el Dashboard Territorial
      const [countries, organizations, plans, actions] = await Promise.all([
        request('paises', new URLSearchParams({ select: 'id_pais,codigo_iso,nombre', archived_at: 'is.null', order: 'nombre.asc' }), token),
        // Se añade 'nombre' a organizaciones
        request('organizaciones', new URLSearchParams({ select: 'id_organizacion,nombre,id_pais,numero_beneficiarios', archived_at: 'is.null' }), token),
        // Se añade 'nombre', 'id_programa' y la relación 'programas(nombre)'
        request('planes', new URLSearchParams({ select: 'id_plan,nombre,id_organizacion,id_programa,fecha_inicio,fecha_termino,programa:programas(nombre)', archived_at: 'is.null' }), token),
        // Se añade 'nombre' a las acciones
        request('acciones', new URLSearchParams({ select: 'id_accion,nombre,id_plan,fecha_inicio,fecha_termino,estado', archived_at: 'is.null' }), token),
      ]);
      
      return {
        countries: rows(countries, country), 
        organizations: rows(organizations, organization),
        plans: rows(plans, plan), 
        actions: rows(actions, action),
      };
    },
    auditExport,
    loadConsolidated
  };
}

export function createSupabaseInsightsRepositoryFromEnv(): InsightsRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return {
      async getReportActor() { throw new ServiceError('CONFIGURACION_SUPABASE','El servicio de Reportes no tiene configurada la autenticación.',503); },
      async load() { throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Dashboard y Reportes no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.', 503); },
      async auditExport() { throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Reportes no puede registrar auditoría sin configuración de Supabase.', 503); },
      async loadConsolidated() { throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Reportes no tiene configurada la función de carga consolidada.', 503); }
    };
  }
  return createSupabaseInsightsRepository({ supabaseUrl, anonKey });
}
