import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';

export interface PaisDashboard { id_pais: string; codigo_iso: string; nombre: string }
export interface MesDashboard { key: string; label: string; completed: number; pending: number }
export interface DashboardSnapshot {
  generatedAt: string;
  selectedCountryId: string | null;
  countries: PaisDashboard[];
  metrics: { organizations: number; activePlans: number; beneficiaries: number; activeAlerts: number };
  progress: { total: number; completed: number; overdue: number; percentage: number };
  monthlyActions: MesDashboard[];
}
export interface ReportOverview {
  title: string;
  description: string;
  snapshot: DashboardSnapshot;
}
export class ErrorInsights extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ErrorInsights'; }
}

const transport = createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000');
async function token(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new ErrorInsights('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  return data.session.access_token;
}
async function request<T>(path: string): Promise<T> {
  try { return (await transport.request<T>(path, { accessToken: await token() })).data; }
  catch (error) {
    if (error instanceof ErrorInsights) throw error;
    if (error instanceof ApiError) throw new ErrorInsights(error.status === 401 ? 'SESION' : error.code, error.message);
    throw new ErrorInsights('CONEXION', 'No se pudo conectar con el servicio de métricas.');
  }
}

export async function obtenerDashboard(idPais?: string): Promise<DashboardSnapshot> {
  const query = idPais ? `?id_pais=${encodeURIComponent(idPais)}` : '';
  return (await request<{ dashboard: DashboardSnapshot }>(`/api/v1/dashboard${query}`)).dashboard;
}
export async function obtenerResumenReporte(idPais?: string): Promise<ReportOverview> {
  const query = idPais ? `?id_pais=${encodeURIComponent(idPais)}` : '';
  return (await request<{ report: ReportOverview }>(`/api/v1/reports/overview${query}`)).report;
}
