import { ApiError, createApiTransport } from '../api/transporte.ts';

export interface PaisDashboard { id_pais: string; codigo_iso: string; nombre: string }
export interface MesDashboard { key: string; label: string; completed: number; pending: number }
export interface AccionPrioritariaDashboard {
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
  countries: PaisDashboard[];
  metrics: { organizations: number; activePlans: number; beneficiaries: number; activeAlerts: number };
  progress: { total: number; completed: number; overdue: number; percentage: number };
  monthlyActions: MesDashboard[];
  pendingActions: AccionPrioritariaDashboard[];
}
export interface ReportOverview {
  title: string;
  description: string;
  snapshot: DashboardSnapshot;
}
export class ErrorInsights extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'ErrorInsights'; }
}

async function token(): Promise<string> {
  const { getSupabaseClient } = await import('../supabase.ts');
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new ErrorInsights('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  return data.session.access_token;
}

export function createDashboardClient(
  apiBaseUrl: string,
  getAccessToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
) {
  const transport = createApiTransport(apiBaseUrl, fetchImpl);
  async function request<T>(path: string): Promise<T> {
    try { return (await transport.request<T>(path, { accessToken: await getAccessToken() })).data; }
    catch (error) {
      if (error instanceof ErrorInsights) throw error;
      if (error instanceof ApiError) throw new ErrorInsights(error.status === 401 ? 'SESION' : error.code, error.message);
      throw new ErrorInsights('CONEXION', 'No se pudo conectar con el servicio de métricas.');
    }
  }

  return {
    async obtenerDashboard(idPais?: string, anio?: number): Promise<DashboardSnapshot> {
      const params = new URLSearchParams();
      if (idPais) params.set('id_pais', idPais);
      if (anio) params.set('anio', String(anio));
      const filtros = params.toString();
      const query = filtros ? `?${filtros}` : '';
      return (await request<{ dashboard: DashboardSnapshot }>(`/api/v1/dashboard${query}`)).dashboard;
    },
    async obtenerResumenReporte(idPais?: string): Promise<ReportOverview> {
      const query = idPais ? `?id_pais=${encodeURIComponent(idPais)}` : '';
      return (await request<{ report: ReportOverview }>(`/api/v1/reports/overview${query}`)).report;
    },
  };
}

const dashboardClient = createDashboardClient(
  import.meta.env?.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000',
  token,
);
export const obtenerDashboard = dashboardClient.obtenerDashboard;
export const obtenerResumenReporte = dashboardClient.obtenerResumenReporte;
