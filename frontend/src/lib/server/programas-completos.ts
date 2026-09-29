import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { ActualizarProgramaInput, CrearProgramaInput } from '../../actions/programas/programas.schema';
import { ErrorOperacionPrograma, type Programa } from './programas.ts';
import type { LineaAccionPrograma } from './programa-lineas-accion';

export interface ProgramaConLineas extends Programa {
  lineas_accion: LineaAccionPrograma[];
}

const MENSAJES_VALIDACION_RPC = new Set([
  'Debe enviar los campos del programa.',
  'Campos de programa no permitidos.',
  'Campos de programa inválidos.',
  'Referencias de programa invalidas.',
  'Faltan campos obligatorios.',
  'Líneas de acción inválidas.',
  'Debe enviar entre 1 y 50 líneas.',
  'Línea de acción inválida.',
  'Líneas de acción repetidas.',
]);

/** Traduce restricciones SQL a mensajes que permiten corregir el formulario. */
export function mensajeRestriccionPrograma(error: Pick<PostgrestError, 'code' | 'message'>) {
  if (error.code === '22023' && MENSAJES_VALIDACION_RPC.has(error.message)) {
    return error.message;
  }

  if (error.code === '23505') {
    return 'Hay líneas de acción repetidas. Cada línea debe tener un nombre diferente.';
  }

  if (error.code === '23502') {
    return 'Falta información obligatoria para guardar el programa.';
  }

  if (error.code === '23503') {
    return 'El programa contiene una relación que ya no está disponible.';
  }

  if (error.code === '23514') {
    return 'Algún texto está vacío o supera el máximo permitido. Revisa especialmente las líneas de acción y sus resultados.';
  }

  if (error.code === '22P02') {
    return 'Uno de los datos tiene un formato inválido.';
  }

  return 'Revisa los campos y las líneas de acción del programa.';
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
      throw new ErrorOperacionPrograma(
        'RESTRICCION_INCUMPLIDA',
        mensajeRestriccionPrograma(error),
        error,
      );
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
