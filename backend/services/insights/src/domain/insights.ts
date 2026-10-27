import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface CountryInsight { id_pais: string; codigo_iso: string; nombre: string }
export interface OrganizationInsight { id_organizacion: string; nombre: string; id_pais: string; numero_beneficiarios: number | null }
export interface PlanInsight { id_plan: string; nombre: string; id_organizacion: string; id_programa: string | null; programa_nombre: string | null; fecha_inicio: string; fecha_termino: string }
export interface ActionInsight {
  id_accion: string; nombre: string; id_plan: string; fecha_inicio: string; fecha_termino: string;
  estado: 'no_iniciada' | 'en_desarrollo' | 'atrasada' | 'cancelada' | 'cumplida';
}
export interface RawInsights {
  countries: CountryInsight[]; organizations: OrganizationInsight[]; plans: PlanInsight[]; actions: ActionInsight[];
}
export interface InsightsRepository {
  getReportActor(accessToken: string): Promise<string>;
  load(accessToken: string): Promise<RawInsights>;
  auditExport(accessToken: string, audit: ReportAudit): Promise<void>;
  loadConsolidated(accessToken: string, filters: ConsolidatedReportFilters): Promise<ConsolidatedReportSnapshot>;
}
export interface InsightFilters { countryId?: string; year?: number }
export const REPORT_DESTINATIONS = ['interno', 'donante', 'externo'] as const;
export type ReportDestination = typeof REPORT_DESTINATIONS[number];
export interface ReportRequest { destination: ReportDestination; filters: InsightFilters }
export interface ReportAudit {
  destination: ReportDestination;
  filters: { countryId: string | null; [key:string]: unknown };
}
export interface MonthlyActions { key: string; label: string; completed: number; pending: number }

// - Interfaz detallada para las acciones pendientes en el Dashboard
export interface DashboardPendingAction {
  id_accion: string;
  nombre: string;
  estado: string;
  fecha_termino: string;
  plan: { id_plan: string; nombre: string };
  organizacion: { id_organizacion: string; nombre: string };
  programa: { id_programa: string; nombre: string } | null;
}

export interface DashboardSnapshot {
  generatedAt: string;
  selectedCountryId: string | null;
  countries: CountryInsight[];
  metrics: { organizations: number; activePlans: number; beneficiaries: number; activeAlerts: number };
  progress: { total: number; completed: number; overdue: number; percentage: number };
  monthlyActions: MonthlyActions[];
  pendingActions: DashboardPendingAction[]; 
}
export interface ExternalReport {
  destination: 'donante' | 'externo';
  privacyProfile: 'agregado_hu22';
  generatedAt: string;
  scope: 'global' | 'pais_filtrado';
  metrics: DashboardSnapshot['metrics'];
  progress: DashboardSnapshot['progress'];
  monthlyActions: DashboardSnapshot['monthlyActions'];
}
export interface InternalReport {
  destination: 'interno';
  title: string;
  description: string;
  snapshot: DashboardSnapshot;
}
export type PreparedReport = ExternalReport | InternalReport;

export function parseInsightFilters(url: URL): InsightFilters {
  const allowed = new Set(['id_pais', 'anio']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) throw new ServiceError('DATOS_INVALIDOS', `El filtro ${extra} no está permitido.`, 400);
  const countryId = url.searchParams.get('id_pais');
  if (countryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(countryId)) {
    throw new ServiceError('DATOS_INVALIDOS', 'El país debe ser un UUID válido.', 400);
  }
  const rawYear = url.searchParams.get('anio');
  let year: number | undefined;
  if (rawYear !== null) {
    if (!/^\d{4}$/.test(rawYear) || Number(rawYear) < 1900 || Number(rawYear) > 9999) {
      throw new ServiceError('DATOS_INVALIDOS', 'El año debe ser un número de cuatro dígitos entre 1900 y 9999.', 400);
    }
    year = Number(rawYear);
  }
  return { ...(countryId ? { countryId } : {}), ...(year ? { year } : {}) };
}

export function parseReportRequest(url: URL): ReportRequest {
  const allowed = new Set(['id_pais', 'destino']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) throw new ServiceError('DATOS_INVALIDOS', `El filtro ${extra} no está permitido.`, 400);
  const destination = (url.searchParams.get('destino') ?? 'interno') as ReportDestination;
  if (!REPORT_DESTINATIONS.includes(destination)) {
    throw new ServiceError('DATOS_INVALIDOS', 'El destino del reporte no es válido.', 400);
  }
  const countryId = url.searchParams.get('id_pais');
  if (countryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(countryId)) {
    throw new ServiceError('DATOS_INVALIDOS', 'El país debe ser un UUID válido.', 400);
  }
  return { destination, filters: countryId ? { countryId } : {} };
}

function monthWindow(now: Date, year?: number): Array<{ key: string; label: string }> {
  const formatter = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: year ? 12 : 9 }, (_, index) => {
    const date = year
      ? new Date(Date.UTC(year, index, 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (8 - index), 1));
    const raw = formatter.format(date).replace('.', '');
    return { key: date.toISOString().slice(0, 7), label: raw.charAt(0).toUpperCase() + raw.slice(1) };
  });
}

export function buildSnapshot(raw: RawInsights, filters: InsightFilters, now = new Date()): DashboardSnapshot {
  let organizations = filters.countryId
    ? raw.organizations.filter((item) => item.id_pais === filters.countryId)
    : raw.organizations;
  let organizationIds = new Set(organizations.map((item) => item.id_organizacion));
  let plans = raw.plans.filter((item) => organizationIds.has(item.id_organizacion));
  if (filters.year) {
    const yearStart = `${filters.year}-01-01`;
    const yearEnd = `${filters.year}-12-31`;
    plans = plans.filter((item) => item.fecha_inicio <= yearEnd && item.fecha_termino >= yearStart);
    organizationIds = new Set(plans.map((item) => item.id_organizacion));
    organizations = organizations.filter((item) => organizationIds.has(item.id_organizacion));
  }
  const planIds = new Set(plans.map((item) => item.id_plan));
  const actions = raw.actions.filter((item) =>
    planIds.has(item.id_plan) && (!filters.year || item.fecha_termino.startsWith(`${filters.year}-`)),
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const completed = actions.filter(
    (item) => item.estado === 'cumplida',
  ).length;

  const overdue = actions.filter(
    (item) =>
      item.estado === 'atrasada' ||
      (
        item.fecha_termino < today &&
        !['cumplida', 'cancelada'].includes(item.estado)
      ),
  ).length;
  const activeAlerts = actions.filter((item) => item.estado === 'atrasada' || item.estado === 'cancelada').length;
  const months = monthWindow(now, filters.year);
  const plansInScope = filters.year ? plans.length : plans.filter((item) => item.fecha_inicio <= today && item.fecha_termino >= today).length;

  // Porcentaje de avance de los Planes de Intervención.
  // Fórmula definida: (Acciones cumplidas / Total de acciones vinculadas a planes activos) * 100
  // Si no hay acciones, el porcentaje es 0.
  const percentage = actions.length ? Math.round((completed / actions.length) * 100) : 0;

  // Identificar acciones próximas a vencer o vencidas (atrasadas, en desarrollo, no iniciadas)
  // Excluyendo explícitamente cumplidas y canceladas.
  const pendingActions: DashboardPendingAction[] = actions
    .filter(a => ['no_iniciada', 'en_desarrollo', 'atrasada'].includes(a.estado))
    .map(action => {
      const plan = plans.find(p => p.id_plan === action.id_plan)!; 
      const org = organizations.find(o => o.id_organizacion === plan.id_organizacion)!;
      return {
        id_accion: action.id_accion,
        nombre: action.nombre || 'Sin nombre',
        estado: action.estado,
        fecha_termino: action.fecha_termino,
        plan: { id_plan: plan.id_plan, nombre: plan.nombre || 'Sin nombre' },
        organizacion: { id_organizacion: org.id_organizacion, nombre: org.nombre || 'Desconocida' },
        programa: plan.id_programa && plan.programa_nombre ? { id_programa: plan.id_programa, nombre: plan.programa_nombre } : null
      };
    })
    .sort((a, b) => a.fecha_termino.localeCompare(b.fecha_termino)); // Las más urgentes primero

  return {
    generatedAt: now.toISOString(),
    selectedCountryId: filters.countryId ?? null,
    countries: raw.countries,
    metrics: {
      organizations: organizations.length,
      // Planes activos (fecha actual entre inicio y término)
      activePlans: plansInScope,
      beneficiaries: organizations.reduce((total, item) => total + Math.max(0, item.numero_beneficiarios ?? 0), 0),
      activeAlerts,
    },
    progress: {
      total: actions.length,
      completed,
      overdue,
      percentage,
    },
    monthlyActions: months.map((month) => {
      const values = actions.filter((item) => item.fecha_termino.startsWith(month.key));
      return {
        ...month,
        completed: values.filter((item) => item.estado === 'cumplida').length,
        pending: values.filter((item) => item.estado !== 'cumplida' && item.estado !== 'cancelada').length,
      };
    }),
    pendingActions // Nueva propiedad agregada para la HU del Dashboard Territorial
  };
}

export function prepareReport(snapshot: DashboardSnapshot, request: ReportRequest): PreparedReport {
  if (request.destination === 'interno') {
    return {
      destination: 'interno',
      title: 'Resumen general de gestión',
      description: 'Consolidado de información visible para la sesión solicitante.',
      snapshot,
    };
  }
  return {
    destination: request.destination,
    privacyProfile: 'agregado_hu22',
    generatedAt: snapshot.generatedAt,
    scope: request.filters.countryId ? 'pais_filtrado' : 'global',
    metrics: snapshot.metrics,
    progress: snapshot.progress,
    monthlyActions: snapshot.monthlyActions,
  };
}

// ============================================================================
// CONTRATOS Y VALIDACIONES PARA REPORTE CONSOLIDADO
// ============================================================================

export interface ConsolidatedReportFilters {
  startDate: string;
  endDate: string;
  countryId?: string;
  organizationId?: string;
  programId?: string;
  indicatorIds?: string[];
  resultIds?: string[];
}

export interface ConsolidatedReportRequest {
  destination: ReportDestination;
  filters: ConsolidatedReportFilters;
}

export interface ConsolidatedOrganization {
  id_organizacion: string;
  nombre: string;
  numero_beneficiarios: number;
  pais: string;
}

export interface ConsolidatedPlan {
  id_plan: string;
  nombre: string;
  organizacion: string;
  programa: string;
  fecha_inicio: string;
  fecha_termino: string;
}

export interface ConsolidatedAction {
  id_accion: string;
  nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_termino: string;
  plan: string;
}

export interface ConsolidatedCommitment {
  id_compromiso: string;
  acuerdo: string;
  estado: string;
  fecha_cumplimiento: string | null;
  organizacion: string;
}

export interface ConsolidatedDonation {
  id_donacion: string;
  fecha: string;
  tipo_aporte: string;
  monto: number | null;
  cantidad: number | null;
  organizacion: string;
}

export interface ConsolidatedIndicator {
  id_indicador: string;
  nombre: string;
  valor_obtenido: number;
  organizacion: string;
}

export interface ConsolidatedResult {
  id_resultado: string;
  descripcion: string;
  fecha_obtencion: string;
  organizacion: string;
}

export interface ConsolidatedReportSnapshot {
  generatedAt: string;
  period: { start: string; end: string };
  filters: ConsolidatedReportFilters;
  sections: {
    organizations: ConsolidatedOrganization[];
    plans: ConsolidatedPlan[];
    actions: ConsolidatedAction[];
    commitments: ConsolidatedCommitment[];
    donations: ConsolidatedDonation[];
    indicators: ConsolidatedIndicator[];
    results: ConsolidatedResult[];
  };
  summary: {
    totalBeneficiaries: number;
    totalDonationsAmount: number;
    completedActions: number;
  };
}

export function parseConsolidatedFilters(url: URL): ConsolidatedReportRequest {
  const allowed = new Set([
    'fecha_inicio', 'fecha_termino', 'id_pais', 'id_organizacion', 
    'id_programa', 'indicadores', 'resultados', 'destino'
  ]);
  
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) throw new ServiceError('DATOS_INVALIDOS', `El filtro ${extra} no está permitido.`, 400);
  if ([...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1)) {
    throw new ServiceError('DATOS_INVALIDOS','No se permiten filtros repetidos.',400);
  }

  const destination = (url.searchParams.get('destino') ?? 'interno') as ReportDestination;
  if (!REPORT_DESTINATIONS.includes(destination)) {
    throw new ServiceError('DATOS_INVALIDOS', 'El destino del reporte no es válido.', 400);
  }

  const startDate = url.searchParams.get('fecha_inicio');
  const endDate = url.searchParams.get('fecha_termino');

  if (!startDate || !endDate) {
    throw new ServiceError('DATOS_INVALIDOS', 'Las fechas de inicio y término son obligatorias.', 400);
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const calendarDate = (value:string) => dateRegex.test(value) && !value.startsWith('0000-')
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!calendarDate(startDate) || !calendarDate(endDate)) {
    throw new ServiceError('DATOS_INVALIDOS', 'Las fechas deben tener el formato YYYY-MM-DD.', 400);
  }

  if (startDate > endDate) {
    throw new ServiceError('DATOS_INVALIDOS', 'La fecha de inicio no puede ser posterior a la fecha de término.', 400);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  const validateUuid = (val: string | null, fieldName: string) => {
    if (val !== null && !uuidRegex.test(val)) throw new ServiceError('DATOS_INVALIDOS', `El ${fieldName} debe ser un UUID válido.`, 400);
    return val ?? undefined;
  };

  const parseUuidsArray = (val: string | null, fieldName: string) => {
    if (!val) return undefined;
    const ids = val.split(',').map(id => id.trim());
    if(ids.length>100)throw new ServiceError('DATOS_INVALIDOS','Selecciona como máximo 100 identificadores por filtro.',400);
    for (const id of ids) {
      if (!uuidRegex.test(id)) throw new ServiceError('DATOS_INVALIDOS', `Uno de los IDs en ${fieldName} no es un UUID válido.`, 400);
    }
    return ids;
  };

  return {
    destination,
    filters: {
      startDate,
      endDate,
      countryId: validateUuid(url.searchParams.get('id_pais'), 'país'),
      organizationId: validateUuid(url.searchParams.get('id_organizacion'), 'organización'),
      programId: validateUuid(url.searchParams.get('id_programa'), 'programa'),
      indicatorIds: parseUuidsArray(url.searchParams.get('indicadores'), 'indicadores'),
      resultIds: parseUuidsArray(url.searchParams.get('resultados'), 'resultados'),
    }
  };
}
