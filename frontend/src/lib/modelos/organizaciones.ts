export type TipoOrganizacion =
  | 'comedor_merendero'
  | 'centro_comunitario'
  | 'emprendimiento_uv'
  | 'otra';

export interface PaisResumen {
  id_pais: string;
  codigo_iso: string;
  nombre: string;
}

export interface Organizacion {
  id_organizacion: string;
  id_pais: string;
  nombre: string;
  nombre_representante: string;
  telefono: string;
  correo: string;
  region_departamento: string;
  comuna_municipio_ciudad: string;
  direccion: string;
  publico_objetivo: string;
  descripcion_breve: string;
  tipo_organizacion: TipoOrganizacion;
  tipo_organizacion_otro: string | null;
  numero_beneficiarios: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
  pais: PaisResumen;
  imagen?: ImagenOrganizacion | null;
}

export interface ImagenOrganizacion {
  id_archivo: string;
  nombre_original: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  tamano_bytes: number;
  updated_at: string;
}

export interface CrearOrganizacionInput {
  id_pais: string;
  nombre: string;
  nombre_representante: string;
  telefono: string;
  correo: string;
  region_departamento: string;
  comuna_municipio_ciudad: string;
  direccion: string;
  publico_objetivo: string;
  descripcion_breve: string;
  tipo_organizacion: TipoOrganizacion;
  tipo_organizacion_otro?: string | null;
  numero_beneficiarios: number;
}

export type ActualizarOrganizacionInput = Partial<CrearOrganizacionInput>;

export interface FiltrosOrganizaciones {
  q?: string;
  idPais?: string;
  idPrograma?: string;
  incluirArchivadas?: boolean;
}
