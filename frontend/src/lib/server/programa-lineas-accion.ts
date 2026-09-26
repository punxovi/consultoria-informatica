import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export interface LineaAccionPrograma {
  id_linea_accion: string;
  id_programa: string;
  linea_accion: string;
  resultado_esperado: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
}

export interface CrearLineaAccionProgramaInput {
  id_programa: string;
  linea_accion: string;
  resultado_esperado: string;
}

export type ActualizarLineaAccionProgramaInput = Partial<
  Pick<CrearLineaAccionProgramaInput, 'linea_accion' | 'resultado_esperado'>
>;

export type CodigoErrorLineaAccionPrograma =
  | 'NO_ENCONTRADA'
  | 'PROGRAMA_NO_EXISTE'
  | 'LINEA_DUPLICADA'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS';

export class ErrorOperacionLineaAccionPrograma extends Error {
  public readonly codigo: CodigoErrorLineaAccionPrograma;
  public readonly detalle?: PostgrestError;

  constructor(
    codigo: CodigoErrorLineaAccionPrograma,
    message: string,
    detalle?: PostgrestError,
  ) {
    super(message, detalle ? { cause: detalle } : undefined);
    this.name = 'ErrorOperacionLineaAccionPrograma';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const CAMPOS_LINEA_ACCION = `
  id_linea_accion,
  id_programa,
  linea_accion,
  resultado_esperado,
  created_at,
  updated_at,
  created_by,
  updated_by,
  archived_at,
  version
`;

function convertirError(error: PostgrestError): ErrorOperacionLineaAccionPrograma {
  if (error.code === '23503') {
    return new ErrorOperacionLineaAccionPrograma(
      'PROGRAMA_NO_EXISTE',
      'El programa indicado no existe.',
      error,
    );
  }
  if (error.code === '23505') {
    return new ErrorOperacionLineaAccionPrograma(
      'LINEA_DUPLICADA',
      'Ya existe una línea de acción con ese nombre en el programa.',
      error,
    );
  }
  if (['23502', '23514', '22001', '22P02'].includes(error.code)) {
    return new ErrorOperacionLineaAccionPrograma(
      'RESTRICCION_INCUMPLIDA',
      'La línea de acción no cumple las restricciones de la base de datos.',
      error,
    );
  }
  if (error.code === '42501') {
    return new ErrorOperacionLineaAccionPrograma(
      'SIN_PERMISO',
      'La sesión no tiene permiso para gestionar líneas de acción.',
      error,
    );
  }
  return new ErrorOperacionLineaAccionPrograma(
    'ERROR_BASE_DATOS',
    'No fue posible completar la operación de líneas de acción.',
    error,
  );
}

/** Consulta las líneas activas de un Programa respetando la sesión y RLS. */
export async function listarLineasAccionPrograma(
  cliente: SupabaseClient,
  idPrograma: string,
): Promise<LineaAccionPrograma[]> {
  const { data, error } = await cliente
    .from('programa_lineas_accion')
    .select(CAMPOS_LINEA_ACCION)
    .eq('id_programa', idPrograma)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .order('id_linea_accion', { ascending: true });

  if (error) throw convertirError(error);
  return (data ?? []) as LineaAccionPrograma[];
}

/** Crea una línea con su resultado esperado dentro de un Programa existente. */
export async function crearLineaAccionPrograma(
  cliente: SupabaseClient,
  entrada: CrearLineaAccionProgramaInput,
): Promise<LineaAccionPrograma> {
  const { data, error } = await cliente
    .from('programa_lineas_accion')
    .insert(entrada)
    .select(CAMPOS_LINEA_ACCION)
    .single();

  if (error) throw convertirError(error);
  return data as LineaAccionPrograma;
}

/** Modifica una línea activa sin cambiar el Programa al que pertenece. */
export async function actualizarLineaAccionPrograma(
  cliente: SupabaseClient,
  idLineaAccion: string,
  cambios: ActualizarLineaAccionProgramaInput,
  versionEsperada?: number,
): Promise<LineaAccionPrograma> {
  let consulta = cliente
    .from('programa_lineas_accion')
    .update(cambios)
    .eq('id_linea_accion', idLineaAccion)
    .is('archived_at', null);

  if (versionEsperada !== undefined) {
    consulta = consulta.eq('version', versionEsperada);
  }

  const { data, error } = await consulta.select(CAMPOS_LINEA_ACCION).maybeSingle();
  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionLineaAccionPrograma(
      versionEsperada === undefined ? 'NO_ENCONTRADA' : 'CONFLICTO_CONCURRENCIA',
      versionEsperada === undefined
        ? 'La línea de acción solicitada no existe.'
        : 'La línea de acción fue modificada por otra sesión.',
    );
  }
  return data as LineaAccionPrograma;
}

/** Archiva una línea que dejó de formar parte del Programa. */
export async function archivarLineaAccionPrograma(
  cliente: SupabaseClient,
  idLineaAccion: string,
  versionEsperada?: number,
): Promise<LineaAccionPrograma> {
  let consulta = cliente
    .from('programa_lineas_accion')
    .update({ archived_at: new Date().toISOString() })
    .eq('id_linea_accion', idLineaAccion)
    .is('archived_at', null);

  if (versionEsperada !== undefined) {
    consulta = consulta.eq('version', versionEsperada);
  }

  const { data, error } = await consulta.select(CAMPOS_LINEA_ACCION).maybeSingle();
  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionLineaAccionPrograma(
      versionEsperada === undefined ? 'NO_ENCONTRADA' : 'CONFLICTO_CONCURRENCIA',
      versionEsperada === undefined
        ? 'La línea de acción solicitada no existe.'
        : 'La línea de acción fue modificada por otra sesión.',
    );
  }

  return data as LineaAccionPrograma;
}
