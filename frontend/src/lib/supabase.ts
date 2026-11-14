import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface UserRole {
  codigo: string;
  alcance: string;
  id_pais: string | null;
}

let supabaseClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
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

/** Obtiene los roles asignados al usuario autenticado actual. */
export async function getUserRoles(): Promise<UserRole[]> {
  const { data, error } = await getSupabaseClient().rpc('get_user_roles');

  if (error) {
    const fallo = new Error(`No se pudieron obtener los roles: ${error.message}`) as Error & { status?: number };
    fallo.status = typeof error.status === 'number' ? error.status : undefined;
    throw fallo;
  }

  return (data ?? []) as UserRole[];
}

export const supabase = getSupabaseClient();
