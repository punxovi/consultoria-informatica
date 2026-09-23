import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

/** Programa institucional global: no pertenece a un país ni a una organización. */
export interface Programa {
  id_programa: string;
  nombre: string;
  descripcion: string;
  objetivo_general: string;
  objetivos_especificos: string;
  componentes_linea_accion: string;
  resultados_esperados: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
}

/**
 * Contrato de la tabla actual. Las líneas individuales se gestionan en
 * programa-lineas-accion.ts; las Actions de KAN-171 coordinarán ambas escrituras.
 */
export interface CrearProgramaInput {
  nombre: string;
  descripcion: string;
  objetivo_general: string;
  objetivos_especificos: string;
  componentes_linea_accion: string;
  resultados_esperados: string;
}

export type ActualizarProgramaInput = Partial<CrearProgramaInput>;

export type CodigoErrorPrograma =
  | 'NO_ENCONTRADO'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS';

export class ErrorOperacionPrograma extends Error {
  public readonly codigo: CodigoErrorPrograma;
  public readonly detalle?: PostgrestError;

  constructor(
    codigo: CodigoErrorPrograma,
    message: string,
    detalle?: PostgrestError,
  ) {
    super(message, detalle ? { cause: detalle } : undefined);
    this.name = 'ErrorOperacionPrograma';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const CAMPOS_PROGRAMA = `
  id_programa,
  nombre,
  descripcion,
  objetivo_general,
  objetivos_especificos,
  componentes_linea_accion,
  resultados_esperados,
  created_at,
  updated_at,
  created_by,
  updated_by,
  archived_at,
  version
`;

function convertirError(error: PostgrestError): ErrorOperacionPrograma {
  if (['23502', '23503', '23505', '23514', '22P02'].includes(error.code)) {
    return new ErrorOperacionPrograma(
      'RESTRICCION_INCUMPLIDA',
      'El programa no cumple las restricciones de la base de datos.',
      error,
    );
  }
  if (error.code === '42501') {
    return new ErrorOperacionPrograma(
      'SIN_PERMISO',
      'La sesión no tiene permiso para realizar esta operación.',
      error,
    );
  }
  return new ErrorOperacionPrograma(
    'ERROR_BASE_DATOS',
    'No fue posible completar la operación de programas.',
    error,
  );
}

/** Lista el catálogo institucional activo, respetando RLS del cliente. */
export async function listarProgramas(cliente: SupabaseClient): Promise<Programa[]> {
  const { data, error } = await cliente
    .from('programas')
    .select(CAMPOS_PROGRAMA)
    .is('archived_at', null)
    .order('nombre', { ascending: true })
    .order('id_programa', { ascending: true });

  if (error) throw convertirError(error);
  return (data ?? []) as Programa[];
}

/** Consulta un Programa por UUID o informa que no existe/está archivado. */
export async function obtenerProgramaPorId(
  cliente: SupabaseClient,
  idPrograma: string,
): Promise<Programa> {
  const { data, error } = await cliente
    .from('programas')
    .select(CAMPOS_PROGRAMA)
    .eq('id_programa', idPrograma)
    .is('archived_at', null)
    .maybeSingle();

  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionPrograma('NO_ENCONTRADO', 'El programa solicitado no existe.');
  }
  return data as Programa;
}

/** Registra un Programa sin asociarlo directamente a una Organización. */
export async function crearPrograma(
  cliente: SupabaseClient,
  entrada: CrearProgramaInput,
): Promise<Programa> {
  const { data, error } = await cliente
    .from('programas')
    .insert(entrada)
    .select(CAMPOS_PROGRAMA)
    .single();

  if (error) throw convertirError(error);
  return data as Programa;
}

/** Actualiza un Programa activo; versionEsperada evita sobrescribir cambios ajenos. */
export async function actualizarPrograma(
  cliente: SupabaseClient,
  idPrograma: string,
  cambios: ActualizarProgramaInput,
  versionEsperada?: number,
): Promise<Programa> {
  let consulta = cliente
    .from('programas')
    .update(cambios)
    .eq('id_programa', idPrograma)
    .is('archived_at', null);

  if (versionEsperada !== undefined) {
    consulta = consulta.eq('version', versionEsperada);
  }

  const { data, error } = await consulta.select(CAMPOS_PROGRAMA).maybeSingle();
  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionPrograma(
      versionEsperada === undefined ? 'NO_ENCONTRADO' : 'CONFLICTO_CONCURRENCIA',
      versionEsperada === undefined
        ? 'El programa solicitado no existe.'
        : 'El programa fue modificado por otra sesión.',
    );
  }
  return data as Programa;
}
