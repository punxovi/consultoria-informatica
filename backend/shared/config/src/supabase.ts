import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { ServiceError } from '../../errors/src/index.ts';

/** La ruta no depende del directorio desde el que se inicia el workspace. */
export function loadBackendEnvironment(envFile: URL = new URL('../../../.env', import.meta.url)): void {
  const path = fileURLToPath(envFile);
  if (existsSync(path)) loadEnvFile(path);
}

export function readSupabaseConnection(environment: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = environment.SUPABASE_URL?.trim() || environment.PUBLIC_SUPABASE_URL?.trim() || '';
  const anonKey = environment.SUPABASE_ANON_KEY?.trim() || environment.PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  return { supabaseUrl, anonKey };
}

export function validateSupabaseConnection(supabaseUrl: string, anonKey: string): void {
  let url: URL;
  try { url = new URL(supabaseUrl); } catch {
    throw configurationError();
  }
  if (!anonKey.trim() || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw configurationError();
  }
}

function configurationError() {
  return new ServiceError('SERVICIO_NO_CONFIGURADO', 'La conexión de Intervenciones requiere SUPABASE_URL y SUPABASE_ANON_KEY válidas en el Backend.', 503);
}
