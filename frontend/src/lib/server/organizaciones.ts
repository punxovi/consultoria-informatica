import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

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
  idPais?: string;
  incluirArchivadas?: boolean;
}

export type CodigoErrorOrganizacion =
  | 'NO_ENCONTRADA'
  | 'PAIS_NO_EXISTE'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS';

export class ErrorOperacionOrganizacion extends Error {
  public readonly codigo: CodigoErrorOrganizacion;
  public readonly detalle?: PostgrestError;

  constructor(
    codigo: CodigoErrorOrganizacion,
    message: string,
    detalle?: PostgrestError,
  ) {
    super(message, detalle ? { cause: detalle } : undefined);
    this.name = 'ErrorOperacionOrganizacion';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const CAMPOS_ORGANIZACION = `
  id_organizacion,
  id_pais,
  nombre,
  nombre_representante,
  telefono,
  correo,
  region_departamento,
  comuna_municipio_ciudad,
  direccion,
  publico_objetivo,
  descripcion_breve,
  tipo_organizacion,
  tipo_organizacion_otro,
  numero_beneficiarios,
  created_at,
  updated_at,
  created_by,
  updated_by,
  archived_at,
  version,
  pais:paises!organizaciones_id_pais_fkey (
    id_pais,
    codigo_iso,
    nombre
  )
`;

function convertirError(error: PostgrestError): ErrorOperacionOrganizacion {
  if (error.code === '23503') {
    return new ErrorOperacionOrganizacion(
      'PAIS_NO_EXISTE',
      'El país indicado no existe o ya no está disponible.',
      error,
    );
  }

  if (['23502', '23514', '22P02'].includes(error.code)) {
    return new ErrorOperacionOrganizacion(
      'RESTRICCION_INCUMPLIDA',
      'La organización no cumple las restricciones de la base de datos.',
      error,
    );
  }

  if (error.code === '42501') {
    return new ErrorOperacionOrganizacion(
      'SIN_PERMISO',
      'La sesión no tiene permiso para realizar esta operación.',
      error,
    );
  }

  return new ErrorOperacionOrganizacion(
    'ERROR_BASE_DATOS',
    'No fue posible completar la operación de organizaciones.',
    error,
  );
}

function comoOrganizacion(data: unknown): Organizacion {
  return data as Organizacion;
}

/** Lista organizaciones activas y su país, respetando la sesión/RLS del cliente. */
export async function listarOrganizaciones(
  cliente: SupabaseClient,
  filtros: FiltrosOrganizaciones = {},
): Promise<Organizacion[]> {
  let consulta = cliente
    .from('organizaciones')
    .select(CAMPOS_ORGANIZACION)
    .order('nombre', { ascending: true });

  if (!filtros.incluirArchivadas) {
    consulta = consulta.is('archived_at', null);
  }

  if (filtros.idPais) {
    consulta = consulta.eq('id_pais', filtros.idPais);
  }

  const { data, error } = await consulta;
  if (error) throw convertirError(error);

  return (data ?? []).map(comoOrganizacion);
}

/** Obtiene una organización activa por UUID o devuelve NO_ENCONTRADA. */
export async function obtenerOrganizacionPorId(
  cliente: SupabaseClient,
  idOrganizacion: string,
): Promise<Organizacion> {
  const { data, error } = await cliente
    .from('organizaciones')
    .select(CAMPOS_ORGANIZACION)
    .eq('id_organizacion', idOrganizacion)
    .is('archived_at', null)
    .maybeSingle();

  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionOrganizacion(
      'NO_ENCONTRADA',
      'La organización solicitada no existe.',
    );
  }

  return comoOrganizacion(data);
}

/** Registra una organización; PostgreSQL valida País y restricciones del modelo. */
export async function crearOrganizacion(
  cliente: SupabaseClient,
  entrada: CrearOrganizacionInput,
): Promise<Organizacion> {
  const { data, error } = await cliente
    .from('organizaciones')
    .insert(entrada)
    .select(CAMPOS_ORGANIZACION)
    .single();

  if (error) throw convertirError(error);
  return comoOrganizacion(data);
}

/**
 * Modifica una organización activa. Si se entrega versionEsperada, evita
 * sobrescribir una edición concurrente realizada desde otra sesión.
 */
export async function actualizarOrganizacion(
  cliente: SupabaseClient,
  idOrganizacion: string,
  cambios: ActualizarOrganizacionInput,
  versionEsperada?: number,
): Promise<Organizacion> {
  let consulta = cliente
    .from('organizaciones')
    .update(cambios)
    .eq('id_organizacion', idOrganizacion)
    .is('archived_at', null);

  if (versionEsperada !== undefined) {
    consulta = consulta.eq('version', versionEsperada);
  }

  const { data, error } = await consulta.select(CAMPOS_ORGANIZACION).maybeSingle();
  if (error) throw convertirError(error);
  if (!data) {
    throw new ErrorOperacionOrganizacion(
      versionEsperada === undefined ? 'NO_ENCONTRADA' : 'CONFLICTO_CONCURRENCIA',
      versionEsperada === undefined
        ? 'La organización solicitada no existe.'
        : 'La organización fue modificada por otra sesión.',
    );
  }

  return comoOrganizacion(data);
}
