import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActualizarProgramaInput, CrearProgramaInput } from '../../actions/programas/programas.schema';
import { ErrorOperacionPrograma, type Programa } from './programas.ts';
import type { LineaAccionPrograma } from './programa-lineas-accion';

export interface ProgramaConLineas extends Programa {
  lineas_accion: LineaAccionPrograma[];
}

/** Una sola transacción conserva programa, textos legados y líneas consistentes. */
async function guardar(
  cliente: SupabaseClient,
  cambios: ActualizarProgramaInput['cambios'],
  idPrograma: string | null,
  versionEsperada: number | null,
): Promise<ProgramaConLineas> {
  const { data, error } = await cliente.rpc('guardar_programa_completo', {
    p_datos: cambios,
    p_id_programa: idPrograma,
    p_version_esperada: versionEsperada,
  });
  if (error) {
    if (error.code === 'P0002') {
      throw new ErrorOperacionPrograma('NO_ENCONTRADO', 'El programa solicitado no existe.', error);
    }
    if (error.code === '40001') {
      throw new ErrorOperacionPrograma('CONFLICTO_CONCURRENCIA', 'El programa fue modificado por otra sesión. Recarga los datos antes de volver a editar.', error);
    }
    if (error.code === '42501') {
      throw new ErrorOperacionPrograma('SIN_PERMISO', 'Solo el Administrador puede crear o editar programas.', error);
    }
    if (['23502', '23503', '23505', '23514', '22023', '22P02'].includes(error.code)) {
      throw new ErrorOperacionPrograma('RESTRICCION_INCUMPLIDA', 'Revisa los campos y las líneas de acción del programa.', error);
    }
    throw new ErrorOperacionPrograma('ERROR_BASE_DATOS', 'No fue posible guardar el programa. Revisa la conexión y vuelve a intentarlo.', error);
  }
  return data as ProgramaConLineas;
}

export function crearProgramaCompleto(cliente: SupabaseClient, entrada: CrearProgramaInput) {
  return guardar(cliente, entrada, null, null);
}

export function actualizarProgramaCompleto(cliente: SupabaseClient, entrada: ActualizarProgramaInput) {
  return guardar(cliente, entrada.cambios, entrada.id_programa, entrada.version_esperada ?? null);
}
