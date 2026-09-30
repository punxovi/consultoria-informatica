import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export interface EntidadRelacionadaPlan {
  id: string;
  nombre: string;
}

export interface OrganizacionPlan extends EntidadRelacionadaPlan {
  id_pais: string;
}

export interface Plan {
  id_plan: string;
  id_organizacion: string;
  id_programa: string;
  nombre: string;
  situacion_necesidad: string;
  objetivo_general: string;
  objetivos_especificos: string;
  resultado_esperado: string;
  responsable_nombre: string;
  fecha_inicio: string;
  fecha_termino: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
  organizacion: OrganizacionPlan;
  programa: EntidadRelacionadaPlan;
}

export interface CrearPlanPersistencia {
  id_organizacion: string;
  id_programa: string;
  nombre: string;
  situacion_necesidad: string;
  objetivo_general: string;
  objetivos_especificos: string;
  resultado_esperado: string;
  responsable_nombre: string;
  fecha_inicio: string;
  fecha_termino: string;
}

export type ActualizarPlanPersistencia = Partial<CrearPlanPersistencia>;

export interface FiltrosPlanes {
  idOrganizacion?: string;
  idPrograma?: string;
  incluirArchivados?: boolean;
}

export type CodigoErrorPlan =
  | 'NO_ENCONTRADO'
  | 'ORGANIZACION_NO_EXISTE'
  | 'PROGRAMA_NO_EXISTE'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS';

export class ErrorOperacionPlan extends Error {
  public readonly codigo: CodigoErrorPlan;
  public readonly detalle?: PostgrestError;

  constructor(
    codigo: CodigoErrorPlan,
    message: string,
    detalle?: PostgrestError,
  ) {
    super(message, detalle ? { cause: detalle } : undefined);
    this.name = 'ErrorOperacionPlan';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const CAMPOS_PLAN = `
  id_plan,
  id_organizacion,
  id_programa,
  nombre,
  situacion_necesidad,
  objetivo_general,
  objetivos_especificos,
  resultado_esperado,
  responsable_nombre,
  fecha_inicio,
  fecha_termino,
  created_at,
  updated_at,
  created_by,
  updated_by,
  archived_at,
  version,
  organizacion:organizaciones!planes_id_organizacion_fkey (
    id:id_organizacion,
    id_pais,
    nombre
  ),
  programa:programas!planes_id_programa_fkey (
    id:id_programa,
    nombre
  )
`;

function convertirError(error: PostgrestError): ErrorOperacionPlan {
  if (error.code === '23503') {
    const detalle = `${error.message} ${error.details ?? ''}`;
    if (detalle.includes('id_organizacion')) {
      return new ErrorOperacionPlan('ORGANIZACION_NO_EXISTE', 'La organización indicada no existe o ya no está disponible.', error);
    }
    if (detalle.includes('id_programa')) {
      return new ErrorOperacionPlan('PROGRAMA_NO_EXISTE', 'El programa indicado no existe o ya no está disponible.', error);
    }
  }
  if (['23502', '23514', '22007', '22P02'].includes(error.code)) {
    return new ErrorOperacionPlan(
      'RESTRICCION_INCUMPLIDA',
      error.code === '23514'
        ? 'Revisa las fechas y los campos obligatorios del plan.'
        : 'El plan contiene datos inválidos o incompletos.',
      error,
    );
  }
  if (error.code === '42501') {
    return new ErrorOperacionPlan('SIN_PERMISO', 'La sesión no tiene permiso para realizar esta operación sobre el plan.', error);
  }
  return new ErrorOperacionPlan('ERROR_BASE_DATOS', 'No fue posible completar la operación de Planes.', error);
}

const comoPlan = (data: unknown) => data as Plan;

export async function listarPlanes(
  cliente: SupabaseClient,
  filtros: FiltrosPlanes = {},
): Promise<Plan[]> {
  let consulta = cliente.from('planes').select(CAMPOS_PLAN).order('fecha_inicio', { ascending: false });
  if (!filtros.incluirArchivados) consulta = consulta.is('archived_at', null);
  if (filtros.idOrganizacion) consulta = consulta.eq('id_organizacion', filtros.idOrganizacion);
  if (filtros.idPrograma) consulta = consulta.eq('id_programa', filtros.idPrograma);
  const { data, error } = await consulta;
  if (error) throw convertirError(error);
  return (data ?? []).map(comoPlan);
}

export async function obtenerPlanPorId(cliente: SupabaseClient, idPlan: string): Promise<Plan> {
  const { data, error } = await cliente
    .from('planes')
    .select(CAMPOS_PLAN)
    .eq('id_plan', idPlan)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw convertirError(error);
  if (!data) throw new ErrorOperacionPlan('NO_ENCONTRADO', 'El plan solicitado no existe.');
  return comoPlan(data);
}

export async function crearPlan(cliente: SupabaseClient, entrada: CrearPlanPersistencia): Promise<Plan> {
  const { data, error } = await cliente.from('planes').insert(entrada).select(CAMPOS_PLAN).single();
  if (error) throw convertirError(error);
  return comoPlan(data);
}

export async function actualizarPlan(
  cliente: SupabaseClient,
  idPlan: string,
  cambios: ActualizarPlanPersistencia,
  versionEsperada?: number,
): Promise<Plan> {
  let consulta = cliente.from('planes').update(cambios).eq('id_plan', idPlan).is('archived_at', null);
  if (versionEsperada !== undefined) consulta = consulta.eq('version', versionEsperada);
  const { data, error } = await consulta.select(CAMPOS_PLAN).maybeSingle();
  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionPlan(
      versionEsperada === undefined ? 'NO_ENCONTRADO' : 'CONFLICTO_CONCURRENCIA',
      versionEsperada === undefined
        ? 'El plan solicitado no existe.'
        : 'El plan fue modificado por otra sesión. Recarga los datos antes de guardar.',
    );
  }
  return comoPlan(data);
}
