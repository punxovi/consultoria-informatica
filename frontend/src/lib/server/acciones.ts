import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type EstadoAccion = 'no_iniciada' | 'en_desarrollo' | 'cancelada' | 'cumplida';

export interface PlanResumenAccion {
  id_plan: string;
  id_organizacion: string;
  id_programa: string;
  nombre: string;
}

export interface Accion {
  id_accion: string;
  id_plan: string;
  nombre: string;
  responsable_nombre: string;
  fecha_inicio: string;
  fecha_termino: string;
  estado: EstadoAccion;
  descripcion: string | null;
  observacion_motivo: string | null;
  resultado_esperado: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
  plan: PlanResumenAccion;
}

export interface CrearAccionPersistencia {
  id_plan: string;
  nombre: string;
  responsable_nombre: string;
  fecha_inicio: string;
  fecha_termino: string;
  estado: EstadoAccion;
  descripcion?: string | null;
  observacion_motivo?: string | null;
  resultado_esperado?: string | null;
}

export type ActualizarAccionPersistencia = Partial<CrearAccionPersistencia>;

export interface FiltrosAcciones {
  idPlan?: string;
  estado?: EstadoAccion;
  incluirArchivadas?: boolean;
}

export type CodigoErrorAccion =
  | 'NO_ENCONTRADA'
  | 'PLAN_NO_EXISTE'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS';

export class ErrorOperacionAccion extends Error {
  public readonly codigo: CodigoErrorAccion;
  public readonly detalle?: PostgrestError;

  constructor(
    codigo: CodigoErrorAccion,
    message: string,
    detalle?: PostgrestError,
  ) {
    super(message, detalle ? { cause: detalle } : undefined);
    this.name = 'ErrorOperacionAccion';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const CAMPOS_ACCION = `
  id_accion,
  id_plan,
  nombre,
  responsable_nombre,
  fecha_inicio,
  fecha_termino,
  estado,
  descripcion,
  observacion_motivo,
  resultado_esperado,
  created_at,
  updated_at,
  created_by,
  updated_by,
  archived_at,
  version,
  plan:planes!acciones_id_plan_fkey (
    id_plan,
    id_organizacion,
    id_programa,
    nombre
  )
`;

function convertirError(error: PostgrestError): ErrorOperacionAccion {
  if (error.code === '23503') {
    return new ErrorOperacionAccion(
      'PLAN_NO_EXISTE',
      'El plan indicado no existe o ya no está disponible.',
      error,
    );
  }
  if (['23502', '23514', '22007', '22P02'].includes(error.code)) {
    return new ErrorOperacionAccion(
      'RESTRICCION_INCUMPLIDA',
      'Revisa las fechas, el estado y los campos obligatorios de la acción.',
      error,
    );
  }
  if (error.code === '42501') {
    return new ErrorOperacionAccion(
      'SIN_PERMISO',
      'La sesión no tiene permiso para realizar esta operación sobre la acción.',
      error,
    );
  }
  return new ErrorOperacionAccion(
    'ERROR_BASE_DATOS',
    'No fue posible completar la operación de Acciones.',
    error,
  );
}

const comoAccion = (data: unknown) => data as Accion;

export async function listarAcciones(
  cliente: SupabaseClient,
  filtros: FiltrosAcciones = {},
): Promise<Accion[]> {
  let consulta = cliente.from('acciones').select(CAMPOS_ACCION).order('fecha_inicio', { ascending: true });
  if (!filtros.incluirArchivadas) consulta = consulta.is('archived_at', null);
  if (filtros.idPlan) consulta = consulta.eq('id_plan', filtros.idPlan);
  if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
  const { data, error } = await consulta;
  if (error) throw convertirError(error);
  return (data ?? []).map(comoAccion);
}

export async function obtenerAccionPorId(cliente: SupabaseClient, idAccion: string): Promise<Accion> {
  const { data, error } = await cliente.from('acciones')
    .select(CAMPOS_ACCION)
    .eq('id_accion', idAccion)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw convertirError(error);
  if (!data) throw new ErrorOperacionAccion('NO_ENCONTRADA', 'La acción solicitada no existe.');
  return comoAccion(data);
}

export async function crearAccion(
  cliente: SupabaseClient,
  entrada: CrearAccionPersistencia,
): Promise<Accion> {
  const { data, error } = await cliente.from('acciones').insert(entrada).select(CAMPOS_ACCION).single();
  if (error) throw convertirError(error);
  return comoAccion(data);
}

export async function actualizarAccion(
  cliente: SupabaseClient,
  idAccion: string,
  cambios: ActualizarAccionPersistencia,
  versionEsperada: number,
): Promise<Accion> {
  if (!Number.isSafeInteger(versionEsperada) || versionEsperada < 1) {
    throw new ErrorOperacionAccion('RESTRICCION_INCUMPLIDA', 'Debes indicar una versión vigente para editar la acción.');
  }
  let consulta = cliente.from('acciones').update(cambios).eq('id_accion', idAccion).is('archived_at', null);
  consulta = consulta.eq('version', versionEsperada);
  const { data, error } = await consulta.select(CAMPOS_ACCION).maybeSingle();
  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionAccion(
      'CONFLICTO_CONCURRENCIA',
      'La acción ya no está disponible con esa versión. Recarga los datos antes de guardar.',
    );
  }
  return comoAccion(data);
}
