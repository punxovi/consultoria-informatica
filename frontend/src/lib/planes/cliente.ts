import type { CrearPlanInput, ActualizarPlanInput } from '../../actions/planes/planes.schema';
import type { Plan, OrganizacionParaPlan } from '../server/planes';
import type { ProgramaConLineas } from '../../actions/programas/programas.handler';
import { ApiError, createApiTransport } from '../api/transporte';
import { listarOrganizaciones } from '../organizaciones/cliente';
import { listarProgramas } from '../programas/cliente';
import { getSupabaseClient } from '../supabase';
import { ErrorSolicitudPlan } from './transporte';

const cliente = getSupabaseClient();
const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createApiTransport(API_BASE_URL);

async function token(): Promise<string> {
  const { data: { session }, error } = await cliente.auth.getSession();
  if (error || !session) {
    throw new ErrorSolicitudPlan('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  return session.access_token;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return (await transport.request<T>(path, { ...options, accessToken: await token() })).data;
  } catch (error) {
    if (error instanceof ErrorSolicitudPlan) throw error;
    if (error instanceof ApiError) throw new ErrorSolicitudPlan(
      error.status === 401 ? 'SESION' : error.code,
      error.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : error.message,
    );
    throw new ErrorSolicitudPlan('CONEXION', 'No se pudo confirmar la operación. Revisa tu conexión antes de volver a intentarlo.');
  }
}

export async function listarPlanes(): Promise<Plan[]> {
  return (await request<{ plans: Plan[] }>('/api/v1/plans')).plans;
}

export async function obtenerPlan(idPlan: string): Promise<Plan> {
  return (await request<{ plan: Plan }>(`/api/v1/plans/${encodeURIComponent(idPlan)}`)).plan;
}

export async function crearPlan(datos: CrearPlanInput): Promise<Plan> {
  return (await request<{ plan: Plan }>('/api/v1/plans', { method: 'POST', body: datos })).plan;
}

export async function actualizarPlan(datos: ActualizarPlanInput): Promise<Plan> {
  const { id_plan, ...body } = datos;
  return (await request<{ plan: Plan }>(`/api/v1/plans/${encodeURIComponent(id_plan)}`, { method: 'PATCH', body })).plan;
}

export async function archivarPlan(id: string, versionEsperada: number): Promise<void> {
  await request(`/api/v1/plans/${encodeURIComponent(id)}`, {
    method: 'DELETE', body: { version_esperada: versionEsperada },
  });
}

export const listarOrganizacionesParaPlan = (): Promise<Organizacion[]> => listarOrganizaciones();
export const listarProgramasParaPlan = (): Promise<ProgramaConLineas[]> => listarProgramas();
