import { actions, getActionPath } from 'astro:actions';
import type { ProgramaConLineas } from '../../actions/programas/programas.handler';
import type { ActualizarProgramaInput, CrearProgramaInput } from '../../actions/programas/programas.schema';
import { getSupabaseClient } from '../supabase';
import { ErrorSolicitudPrograma, solicitarPrograma } from './transporte';

async function solicitar<T>(ruta: string, entrada: unknown): Promise<T> {
  const { data: { session }, error } = await getSupabaseClient().auth.getSession();
  if (error || !session) throw new ErrorSolicitudPrograma('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  return solicitarPrograma<T>(ruta, entrada, session.access_token);
}

export const listarProgramas = () => solicitar<ProgramaConLineas[]>(getActionPath(actions.listarProgramas), {});
export const obtenerPrograma = (id: string) => solicitar<ProgramaConLineas>(getActionPath(actions.obtenerProgramaPorId), { id_programa: id });
export const crearPrograma = (datos: CrearProgramaInput) => solicitar<ProgramaConLineas>(getActionPath(actions.crearPrograma), datos);
export const actualizarPrograma = (datos: ActualizarProgramaInput) => solicitar<ProgramaConLineas>(getActionPath(actions.actualizarPrograma), datos);
