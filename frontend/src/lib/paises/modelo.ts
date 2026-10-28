
export interface Pais {
  id_pais: string;
  nombre: string;
  codigo_iso: string;
  codigo_area_telefonica: string | null;
  zona_horaria: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  configuracion_pendiente: boolean;
}

export interface DatosCrearPais {
  nombre: string;
  codigo_iso: string;
  codigo_area_telefonica: string;
  zona_horaria: string;
}

export type DatosActualizarPais = Partial<DatosCrearPais>;
