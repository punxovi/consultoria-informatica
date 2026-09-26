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

export const supabase = getSupabaseClient();