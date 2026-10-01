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

export interface Programa {
  id_programa: string;
  nombre: string;
  descripcion: string;
  objetivo_general: string;
  objetivos_especificos: string;
  componentes_linea_accion: string;
  resultados_esperados: string;
  referencias_ods?: string;
  referencias_esg?: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
}

export interface ProgramaConLineas extends Programa {
  lineas_accion: LineaAccionPrograma[];
}
