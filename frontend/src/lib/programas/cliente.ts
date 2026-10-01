import type { ProgramaConLineas } from '../../actions/programas/programas.handler';
import type { ActualizarProgramaInput, CrearProgramaInput } from '../../actions/programas/programas.schema';
import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { ErrorSolicitudPrograma } from './transporte';

export const clienteProgramas = getSupabaseClient();
const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createApiTransport(API_BASE_URL);

async function token(): Promise<string> {
  const { data: { session }, error } = await clienteProgramas.auth.getSession();
  if (error || !session) throw new ErrorSolicitudPrograma('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.access_token;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    const response = await transport.request<T>(path, { ...options, accessToken: await token() });
    return response.data;
  } catch (error) {
    if (error instanceof ErrorSolicitudPrograma) throw error;
    if (error instanceof ApiError) {
      throw new ErrorSolicitudPrograma(
        error.status === 401 ? 'SESION' : error.code,
        error.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : error.message,
      );
    }
    throw new ErrorSolicitudPrograma('CONEXION', 'No se pudo confirmar la operación. Revisa tu conexión y consulta el catálogo antes de volver a guardar.');
  }
}

export async function listarProgramas(): Promise<ProgramaConLineas[]> {
  return (await request<{ programs: ProgramaConLineas[] }>('/api/v1/programs')).programs;
}

export async function obtenerPrograma(id: string): Promise<ProgramaConLineas> {
  return (await request<{ program: ProgramaConLineas }>(`/api/v1/programs/${encodeURIComponent(id)}`)).program;
}

export async function crearPrograma(datos: CrearProgramaInput): Promise<ProgramaConLineas> {
  return (await request<{ program: ProgramaConLineas }>('/api/v1/programs', { method: 'POST', body: datos })).program;
}

export async function actualizarPrograma(datos: ActualizarProgramaInput): Promise<ProgramaConLineas> {
  const { id_programa, ...body } = datos;
  return (await request<{ program: ProgramaConLineas }>(`/api/v1/programs/${encodeURIComponent(id_programa)}`, {
    method: 'PATCH', body,
  })).program;
}

export async function archivarPrograma(id: string, version: number): Promise<ProgramaConLineas> {
  return (await request<{ program: ProgramaConLineas }>(`/api/v1/programs/${encodeURIComponent(id)}`, {
    method: 'DELETE', body: { version_esperada: version },
  })).program;
}
