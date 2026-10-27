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

  async function loadConsolidated(token: string, filters: ConsolidatedReportFilters): Promise<ConsolidatedReportSnapshot> {
    const orgParams = new URLSearchParams({ archived_at: 'is.null' });
    let orgSelect = 'id_organizacion,nombre,numero_beneficiarios,pais:paises(nombre)';

    if (filters.countryId) orgParams.set('id_pais', `eq.${filters.countryId}`);
    if (filters.organizationId) orgParams.set('id_organizacion', `eq.${filters.organizationId}`);
    if (filters.programId) {
      orgSelect += ',planes!inner(id_programa)';
      orgParams.set('planes.id_programa', `eq.${filters.programId}`);
    }
    orgParams.set('select', orgSelect);

    const orgsResponse = await request('organizaciones', orgParams, token);
    const orgsRaw = Array.isArray(orgsResponse) ? orgsResponse : [];
    const orgIds = orgsRaw.map(o => o.id_organizacion);

    if (orgIds.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        period: { start: filters.startDate, end: filters.endDate },
        filters,
        sections: { organizations: [], plans: [], actions: [], commitments: [], donations: [], indicators: [], results: [] },
        summary: { totalBeneficiaries: 0, totalDonationsAmount: 0, completedActions: 0 }
      };
    }

    const inOrgs = `in.(${orgIds.join(',')})`;

    const donacionesParams = new URLSearchParams({ 
      id_organizacion: inOrgs, 
      select: 'id_donacion,fecha,tipo_aporte,monto,cantidad,id_organizacion', 
      archived_at: 'is.null' 
    });
    donacionesParams.append('fecha', `gte.${filters.startDate}`);
    donacionesParams.append('fecha', `lte.${filters.endDate}`);

    const compromisosParams = new URLSearchParams({ 
      select: 'id_compromiso,descripcion,estado,cumplido_at,id_acta', 
      archived_at: 'is.null' 
    });

    const [planesRes, accionesRes, compromisosRes, donacionesRes] = await Promise.all([
      request('planes', new URLSearchParams({ id_organizacion: inOrgs, select: 'id_plan,nombre,id_organizacion,fecha_inicio,fecha_termino,programa:programas(nombre)', archived_at: 'is.null' }), token),
      request('acciones', new URLSearchParams({ select: 'id_accion,nombre,estado,fecha_inicio,fecha_termino,plan:planes!inner(id_organizacion,nombre)', archived_at: 'is.null' }), token),
      request('compromisos', compromisosParams, token),
      request('donaciones', donacionesParams, token)
    ]);

    const planesRaw = Array.isArray(planesRes) ? planesRes : [];
    const accionesRaw = Array.isArray(accionesRes) ? accionesRes : [];
    const compromisosRaw = Array.isArray(compromisosRes) ? compromisosRes : [];
    const donacionesRaw = Array.isArray(donacionesRes) ? donacionesRes : [];

    // Indicadores y resultados se consultan después de las acciones para
    // limitar la consulta al alcance territorial visible para la sesión.
    const actionIds = accionesRaw.map(item => item.id_accion).filter((id): id is string => typeof id === 'string');
    const indicadoresRaw = actionIds.length
      ? await request('indicadores', new URLSearchParams({
        id_accion: `in.(${actionIds.join(',')})`,
        archived_at: 'is.null',
        select: 'id_indicador,nombre,id_accion',
      }), token)
      : [];
    const indicadoresVisibles = Array.isArray(indicadoresRaw) ? indicadoresRaw : [];
    const indicatorIds = indicadoresVisibles
      .map(item => item.id_indicador)
      .filter((id): id is string => typeof id === 'string');
    const resultadosRaw = indicatorIds.length
      ? await request('resultados', new URLSearchParams({
        id_indicador: `in.(${indicatorIds.join(',')})`,
        fecha_medicion: `gte.${filters.startDate}`,
        archived_at: 'is.null',
        select: 'id_resultado,id_indicador,valor_medido,fecha_medicion,observaciones',
        order: 'fecha_medicion.desc,created_at.desc',
      }), token)
      : [];
    const resultadosVisibles = Array.isArray(resultadosRaw) ? resultadosRaw : [];

    const findOrgName = (id: string) => orgsRaw.find(o => o.id_organizacion === id)?.nombre || 'Desconocida';

    const actionOrganization = new Map(
      accionesRaw.map(action => [action.id_accion, action.plan?.id_organizacion]).filter((entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string'),
    );
    const selectedIndicatorIds = filters.indicatorIds ? new Set(filters.indicatorIds) : null;
    const selectedResultIds = filters.resultIds ? new Set(filters.resultIds) : null;
    const scopedIndicators = indicadoresVisibles.filter(indicator =>
      orgIds.includes(actionOrganization.get(indicator.id_accion) ?? '')
      && (!selectedIndicatorIds || selectedIndicatorIds.has(indicator.id_indicador)),
    );
    const scopedIndicatorIds = new Set(scopedIndicators.map(indicator => indicator.id_indicador));
    const scopedResults = resultadosVisibles.filter(result =>
      scopedIndicatorIds.has(result.id_indicador)
      && (!selectedResultIds || selectedResultIds.has(result.id_resultado))
      && typeof result.fecha_medicion === 'string'
      && result.fecha_medicion <= filters.endDate,
    );
    const resultByIndicator = new Map<string, Record<string, unknown>>();
    for (const result of scopedResults) {
      if (typeof result.id_indicador === 'string' && !resultByIndicator.has(result.id_indicador)) {
        resultByIndicator.set(result.id_indicador, result);
      }
    }
    const indicatorsWithResults = scopedIndicators.filter(indicator => resultByIndicator.has(indicator.id_indicador));

    const completedActions = accionesRaw.filter(a => a.estado === 'cumplida' && orgIds.includes(a.plan?.id_organizacion)).length;
    const totalDonations = donacionesRaw.reduce((acc, d) => acc + (Number(d.monto) || 0), 0);
    const totalBeneficiaries = orgsRaw.reduce((acc, o) => acc + (Number(o.numero_beneficiarios) || 0), 0);

    return {
      generatedAt: new Date().toISOString(),
      period: { start: filters.startDate, end: filters.endDate },
      filters,
      sections: {
        organizations: orgsRaw.map(o => ({ id_organizacion: o.id_organizacion, nombre: o.nombre, numero_beneficiarios: o.numero_beneficiarios || 0, pais: o.pais?.nombre || 'N/A' })),
        plans: planesRaw.map(p => ({ id_plan: p.id_plan, nombre: p.nombre || 'Plan', organizacion: findOrgName(p.id_organizacion), programa: p.programa?.nombre || 'N/A', fecha_inicio: p.fecha_inicio, fecha_termino: p.fecha_termino })),
        actions: accionesRaw.filter(a => orgIds.includes(a.plan?.id_organizacion)).map(a => ({ id_accion: a.id_accion, nombre: a.nombre || 'Acción', estado: a.estado, fecha_inicio: a.fecha_inicio, fecha_termino: a.fecha_termino, plan: a.plan?.nombre || 'N/A' })),
        commitments: compromisosRaw.map(c => ({ id_compromiso: c.id_compromiso, acuerdo: c.descripcion || 'Sin descripción', estado: c.estado, fecha_cumplimiento: c.cumplido_at || null, organizacion: 'Asociada a un acta' })),
        donations: donacionesRaw.map(d => ({ id_donacion: d.id_donacion, fecha: d.fecha, tipo_aporte: d.tipo_aporte, monto: d.monto, cantidad: d.cantidad, organizacion: findOrgName(d.id_organizacion) })),
        indicators: indicatorsWithResults.map(indicator => {
          const result = resultByIndicator.get(indicator.id_indicador)!;
          return {
            id_indicador: indicator.id_indicador,
            nombre: indicator.nombre || 'Indicador',
            valor_obtenido: Number(result.valor_medido),
            organizacion: findOrgName(actionOrganization.get(indicator.id_accion) ?? ''),
          };
        }),
        results: scopedResults.map(result => {
          const indicator = indicadoresVisibles.find(item => item.id_indicador === result.id_indicador);
          return {
            id_resultado: result.id_resultado,
            descripcion: result.observaciones || `Resultado de ${indicator?.nombre || 'indicador'}`,
            fecha_obtencion: result.fecha_medicion,
            organizacion: findOrgName(actionOrganization.get(indicator?.id_accion) ?? ''),
          };
        })
      },
      summary: { totalBeneficiaries, totalDonationsAmount: totalDonations, completedActions }
    };
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
