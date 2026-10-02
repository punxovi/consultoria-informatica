import { actions, getActionPath } from 'astro:actions';
import type { CrearPlanInput, ActualizarPlanInput } from '../../actions/planes/planes.schema';
import type { Plan, OrganizacionParaPlan } from '../server/planes';
import type { ProgramaConLineas } from '../../actions/programas/programas.handler';
import { getSupabaseClient } from '../supabase';
import { ErrorSolicitudPlan, solicitarPlan } from './transporte';

const cliente = getSupabaseClient();

async function solicitar<T>(ruta: string, entrada: unknown): Promise<T> {
  const { data: { session }, error } = await cliente.auth.getSession();
  if (error || !session) {
    throw new ErrorSolicitudPlan('SESION', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  return solicitarPlan<T>(ruta, entrada, session.access_token);
}

export const listarPlanes = () =>
  solicitar<Plan[]>(getActionPath(actions.listarPlanes), {});

export const obtenerPlan = (idPlan: string) =>
  solicitar<Plan>(getActionPath(actions.obtenerPlanPorId), { id_plan: idPlan });

export const crearPlan = (datos: CrearPlanInput) =>
  solicitar<Plan>(getActionPath(actions.crearPlan), datos);

export const actualizarPlan = (datos: ActualizarPlanInput) =>
  solicitar<Plan>(getActionPath(actions.actualizarPlan), datos);

export const listarOrganizacionesParaPlan = () =>
  solicitar<OrganizacionParaPlan[]>(getActionPath(actions.listarOrganizacionesParaPlan), {});

export const listarProgramasParaPlan = () =>
  solicitar<ProgramaConLineas[]>(getActionPath(actions.listarProgramas), {});
