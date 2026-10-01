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
