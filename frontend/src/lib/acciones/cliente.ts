import { actions, getActionPath } from 'astro:actions';
import type { CrearAccionInput, ActualizarAccionInput } from '../../actions/acciones/acciones.schema';
import type { Accion } from '../server/acciones';
import { getSupabaseClient } from '../supabase';
// Planes y Acciones comparten el contrato de respuesta de las Astro Actions.
import { ErrorSolicitudPlan, solicitarPlan } from '../planes/transporte';

async function solicitar<T>(ruta: string, entrada: unknown): Promise<T> {
  const { data: { session }, error } = await getSupabaseClient().auth.getSession();
  if (error || !session) throw new ErrorSolicitudPlan('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  return solicitarPlan<T>(ruta, entrada, session.access_token);
}

export const listarAcciones = (idPlan: string) =>
  solicitar<Accion[]>(getActionPath(actions.listarAcciones), { id_plan: idPlan });
export const obtenerAccion = (idAccion: string) =>
  solicitar<Accion>(getActionPath(actions.obtenerAccionPorId), { id_accion: idAccion });
export const crearAccion = (entrada: CrearAccionInput) =>
  solicitar<Accion>(getActionPath(actions.crearAccion), entrada);
export const actualizarAccion = (entrada: ActualizarAccionInput) =>
  solicitar<Accion>(getActionPath(actions.actualizarAccion), entrada);
