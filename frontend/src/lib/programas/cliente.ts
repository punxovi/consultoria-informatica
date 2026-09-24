import { actions, getActionPath } from 'astro:actions';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'devalue';
import type { ProgramaConLineas, RespuestaActionPrograma } from '../../actions/programas/programas.handler';
import type { ActualizarProgramaInput, CrearProgramaInput } from '../../actions/programas/programas.schema';

export const clienteProgramas = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY);

/** El transporte conserva el Bearer requerido por RLS y el formato de Astro. */
async function solicitar<T>(ruta: string, entrada: unknown): Promise<T> {
  const { data: { session }, error } = await clienteProgramas.auth.getSession();
  if (error || !session) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(entrada),
    });
  } catch {
    throw new Error('No se pudo confirmar el guardado o la consulta. Revisa tu conexión y el catálogo antes de reintentar.');
  }
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    if (Array.isArray(error?.issues)) throw new Error(error.issues.map((item: { message: string }) => item.message).join(' '));
    throw new Error('No se pudo completar la solicitud. Revisa tu sesión e inténtalo nuevamente.');
  }
  const resultado = parse(await respuesta.text()) as RespuestaActionPrograma<T>;
  if (!resultado.ok) throw new Error(resultado.mensaje);
  return resultado.datos;
}

export const listarProgramas = () => solicitar<ProgramaConLineas[]>(getActionPath(actions.listarProgramas), {});
export const obtenerPrograma = (id: string) => solicitar<ProgramaConLineas>(getActionPath(actions.obtenerProgramaPorId), { id_programa: id });
export const crearPrograma = (datos: CrearProgramaInput) => solicitar<ProgramaConLineas>(getActionPath(actions.crearPrograma), datos);
export const actualizarPrograma = (datos: ActualizarProgramaInput) => solicitar<ProgramaConLineas>(getActionPath(actions.actualizarPrograma), datos);
