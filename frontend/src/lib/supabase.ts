import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type EstadoFiltro = 'activo' | 'inactivo' | 'todos';

export interface OrganizacionMock {
  id: string;
  nombre: string;
  rut: string;
  estado: string;
}

export interface UserRole {
  codigo: string;
  alcance: string;
  id_pais: string | null;
}

let supabaseClient: SupabaseClient | undefined;

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY. Configúralas en frontend/.env.',
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}

/** Obtiene organizaciones desde la RPC pública autorizada por el backend. */
export async function getOrganizacionesMock(
  estadoFiltro: EstadoFiltro = 'todos',
): Promise<OrganizacionMock[]> {
  const { data, error } = await getSupabaseClient().rpc('get_organizaciones_mock', {
    estado_filtro: estadoFiltro,
  });

  if (error) {
    throw new Error(`No se pudieron cargar las organizaciones: ${error.message}`);
  }

  return (data ?? []) as OrganizacionMock[];
}

/** Obtiene los roles asignados al usuario autenticado actual. */
export async function getUserRoles(): Promise<UserRole[]> {
  const { data, error } = await getSupabaseClient().rpc('get_user_roles');

  if (error) {
    throw new Error(`No se pudieron obtener los roles: ${error.message}`);
  }

  return (data ?? []) as UserRole[];
}

export interface OrganizacionDetalle {
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
  tipo_organizacion: string;
  tipo_organizacion_otro: string | null;
  numero_beneficiarios: number;
  pais: {
    id_pais: string;
    codigo_iso: string;
    nombre: string;
  } | null;
}

export async function getOrganizacionPorId(
  idOrganizacion: string,
): Promise<OrganizacionDetalle> {
  const { data, error } = await getSupabaseClient()
    .from('organizaciones')
    .select(`
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
      pais:paises!organizaciones_id_pais_fkey (
        id_pais,
        codigo_iso,
        nombre
      )
    `)
    .eq('id_organizacion', idOrganizacion)
    .is('archived_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo cargar la organización: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      'La organización solicitada no existe.',
    );
  }

  return data as OrganizacionDetalle;
}