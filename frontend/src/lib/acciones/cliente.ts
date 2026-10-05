import type { ActualizarAccionInput, CrearAccionInput } from '../validaciones/acciones';
import type { Accion, EstadoAccion } from '../modelos/acciones';
import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { ErrorSolicitudPlan } from '../planes/transporte';

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createApiTransport(API_BASE_URL);
export class ErrorSolicitudAccion extends ErrorSolicitudPlan {
  constructor(codigo: string, message: string) { super(codigo, message); this.name = 'ErrorSolicitudAccion'; }
}

async function token(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new ErrorSolicitudAccion('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  return data.session.access_token;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  try { return (await transport.request<T>(path, { ...options, accessToken: await token() })).data; }
  catch (error) {
    if (error instanceof ErrorSolicitudAccion) throw error;
    if (error instanceof ApiError) throw new ErrorSolicitudAccion(error.status === 401 ? 'SESION' : error.code, error.message);
    throw new ErrorSolicitudAccion('CONEXION', 'No se pudo conectar con el servicio de Acciones.');
  }
}

export async function listarAcciones(filtros: {
  idPlan?: string; estado?: EstadoAccion; incluirArchivadas?: boolean;
} | string = {}): Promise<Accion[]> {
  if (typeof filtros === 'string') filtros = { idPlan: filtros };
  const params = new URLSearchParams();
  if (filtros.idPlan) params.set('id_plan', filtros.idPlan);
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.incluirArchivadas) params.set('incluir_archivadas', 'true');
  const query = params.size ? `?${params}` : '';
  return (await request<{ actions: Accion[] }>(`/api/v1/actions${query}`)).actions;
}
export async function obtenerAccion(id: string): Promise<Accion> {
  return (await request<{ action: Accion }>(`/api/v1/actions/${encodeURIComponent(id)}`)).action;
}
export async function crearAccion(datos: CrearAccionInput): Promise<Accion> {
  return (await request<{ action: Accion }>('/api/v1/actions', { method: 'POST', body: datos })).action;
}
export async function actualizarAccion(datos: ActualizarAccionInput): Promise<Accion> {
  const { id_accion, ...body } = datos;
  return (await request<{ action: Accion }>(`/api/v1/actions/${encodeURIComponent(id_accion)}`, { method: 'PATCH', body })).action;
}

export async function archivarAccion(id: string, versionEsperada: number): Promise<void> {
  await request(`/api/v1/actions/${encodeURIComponent(id)}`, {
    method: 'DELETE', body: { version_esperada: versionEsperada },
  });
}
