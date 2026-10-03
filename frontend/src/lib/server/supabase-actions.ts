import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Error controlado cuando el servidor no tiene configurada la conexión. */
export class ErrorConfiguracionSupabase extends Error {
  readonly codigo = 'CONFIGURACION_SUPABASE' as const;

  constructor() {
    super(
      'La conexión con Supabase no está configurada. Define PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY.',
    );
    this.name = 'ErrorConfiguracionSupabase';
  }
}

/**
 * Crea un cliente por petición para no compartir la sesión entre usuarios.
 * Si el Frontend envía un Bearer token, se reenvía a Supabase y RLS decide
 * qué filas y operaciones están permitidas para esa sesión.
 */
export function crearClienteSupabaseParaAction(request: Request, ipOrigen?: string): SupabaseClient {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ErrorConfiguracionSupabase();
  }

  const authorization = request.headers.get('authorization');
  const headers: Record<string, string> = {};

  if (authorization) {
    headers.Authorization = authorization;
  }

  // Contexto del adaptador de servidor; no reenviar el header declarado por el navegador.
  if (ipOrigen && ipOrigen.length <= 45 && /^[0-9a-f:.]+$/i.test(ipOrigen)) headers['X-FGE-IP-Origen'] = ipOrigen;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
