import { getUserRoles } from '../supabase';

export async function paisOperativo(): Promise<string | null> {
  const roles = await getUserRoles();
  if (roles.some(r => r.codigo === 'ADMIN')) return null;
  const coordinador = roles.find(r => r.codigo === 'COORD' && r.id_pais);
  if (!coordinador) return null;
  return sessionStorage.getItem('fge.territorio.activo') || coordinador.id_pais!;
}
