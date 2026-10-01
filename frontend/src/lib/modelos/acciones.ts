export type EstadoAccion =
  | 'no_iniciada'
  | 'en_desarrollo'
  | 'atrasada'
  | 'cancelada'
  | 'cumplida';

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
