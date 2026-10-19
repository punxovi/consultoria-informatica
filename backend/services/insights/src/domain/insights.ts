import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface CountryInsight { id_pais: string; codigo_iso: string; nombre: string }
export interface OrganizationInsight { id_organizacion: string; id_pais: string; numero_beneficiarios: number | null }
export interface PlanInsight { id_plan: string; id_organizacion: string; fecha_inicio: string; fecha_termino: string }
export interface ActionInsight {
  id_accion: string; id_plan: string; fecha_inicio: string; fecha_termino: string;
  estado: 'no_iniciada' | 'en_desarrollo' | 'atrasada' | 'cancelada' | 'cumplida';
}
export interface RawInsights {
  countries: CountryInsight[]; organizations: OrganizationInsight[]; plans: PlanInsight[]; actions: ActionInsight[];
}
export interface InsightsRepository {
  load(accessToken: string): Promise<RawInsights>;
  auditExport(accessToken: string, audit: ReportAudit): Promise<void>;
}
export interface InsightFilters { countryId?: string }
export const REPORT_DESTINATIONS = ['interno', 'donante', 'externo'] as const;
export type ReportDestination = typeof REPORT_DESTINATIONS[number];
export interface ReportRequest { destination: ReportDestination; filters: InsightFilters }
export interface ReportAudit {
  destination: ReportDestination;
  filters: { countryId: string | null };
}
export interface MonthlyActions { key: string; label: string; completed: number; pending: number }
export interface DashboardSnapshot {
  generatedAt: string;
  selectedCountryId: string | null;
  countries: CountryInsight[];
  metrics: { organizations: number; activePlans: number; beneficiaries: number; activeAlerts: number };
  progress: { total: number; completed: number; overdue: number; percentage: number };
  monthlyActions: MonthlyActions[];
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
  const allowed = new Set(['id_pais']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) throw new ServiceError('DATOS_INVALIDOS', `El filtro ${extra} no está permitido.`, 400);
  const countryId = url.searchParams.get('id_pais');
  if (!countryId) return {};
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(countryId)) {
    throw new ServiceError('DATOS_INVALIDOS', 'El país debe ser un UUID válido.', 400);
  }
  return { countryId };
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

function monthWindow(now: Date): Array<{ key: string; label: string }> {
  const formatter = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 9 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (8 - index), 1));
    const raw = formatter.format(date).replace('.', '');
    return { key: date.toISOString().slice(0, 7), label: raw.charAt(0).toUpperCase() + raw.slice(1) };
  });
}

export function buildSnapshot(raw: RawInsights, filters: InsightFilters, now = new Date()): DashboardSnapshot {
  const organizations = filters.countryId
    ? raw.organizations.filter((item) => item.id_pais === filters.countryId)
    : raw.organizations;
  const organizationIds = new Set(organizations.map((item) => item.id_organizacion));
  const plans = raw.plans.filter((item) => organizationIds.has(item.id_organizacion));
  const planIds = new Set(plans.map((item) => item.id_plan));
  const actions = raw.actions.filter((item) => planIds.has(item.id_plan));
  const today = now.toISOString().slice(0, 10);
  const completed = actions.filter((item) => item.estado === 'cumplida').length;
  const overdue = actions.filter((item) => item.estado === 'atrasada').length;
  const activeAlerts = actions.filter((item) => item.estado === 'atrasada' || item.estado === 'cancelada').length;
  const months = monthWindow(now);

  return {
    generatedAt: now.toISOString(),
    selectedCountryId: filters.countryId ?? null,
    countries: raw.countries,
    metrics: {
      organizations: organizations.length,
      activePlans: plans.filter((item) => item.fecha_inicio <= today && item.fecha_termino >= today).length,
      beneficiaries: organizations.reduce((total, item) => total + Math.max(0, item.numero_beneficiarios ?? 0), 0),
      activeAlerts,
    },
    progress: {
      total: actions.length,
      completed,
      overdue,
      percentage: actions.length ? Math.round((completed / actions.length) * 100) : 0,
    },
    monthlyActions: months.map((month) => {
      const values = actions.filter((item) => item.fecha_termino.startsWith(month.key));
      return {
        ...month,
        completed: values.filter((item) => item.estado === 'cumplida').length,
        pending: values.filter((item) => item.estado !== 'cumplida' && item.estado !== 'cancelada').length,
      };
    }),
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
  // HU22: la salida externa se construye desde métricas agregadas. No se
  // propagan países, organizaciones, planes, acciones, IDs ni documentos.
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
