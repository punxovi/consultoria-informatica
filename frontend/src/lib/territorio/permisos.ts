import { getUserRoles, type UserRole } from '../supabase';
import { listarMisCoberturasVigentes } from '../organizaciones/cliente';

/**
 * Países en los que la sesión puede crear, editar o archivar Organizaciones y
 * Planes de Intervención. Un Coordinador consulta todos los países, pero solo
 * gestiona su país principal y los países con cobertura temporal vigente.
 *
 * La interfaz usa este alcance para ocultar acciones; la autorización efectiva
 * sigue en RLS (fge_private.usuario_puede_gestionar_pais).
 */
export type AlcanceGestion =
  | { todos: true }
  | { todos: false; paises: ReadonlySet<string> };

const SIN_ALCANCE: AlcanceGestion = { todos: false, paises: new Set() };

let alcanceEnCurso: Promise<AlcanceGestion> | undefined;

/** Descarta el alcance memoizado cuando cambia una cobertura o la sesión. */
export function invalidarAlcanceGestion(): void {
  alcanceEnCurso = undefined;
}

function esRol(rol: UserRole, codigo: string): boolean {
  return rol.codigo.toLocaleUpperCase('es-CL').includes(codigo);
}

async function calcularAlcance(): Promise<AlcanceGestion> {
  const roles = await getUserRoles();
  if (roles.some((rol) => esRol(rol, 'ADMIN'))) return { todos: true };

  const coordinaciones = roles.filter((rol) => esRol(rol, 'COORD'));
  if (coordinaciones.length === 0) return SIN_ALCANCE;
  if (coordinaciones.some((rol) => rol.alcance === 'global')) return { todos: true };

  const paises = new Set(
    coordinaciones.flatMap((rol) => (rol.id_pais ? [rol.id_pais] : [])),
  );
  for (const cobertura of await listarMisCoberturasVigentes()) {
    if (cobertura.id_pais) paises.add(cobertura.id_pais);
  }
  return { todos: false, paises };
}

/** Fallo cerrado: si no se puede verificar el alcance, no se ofrece gestionar. */
export function obtenerAlcanceGestion(): Promise<AlcanceGestion> {
  alcanceEnCurso ??= calcularAlcance().catch((error) => {
    console.error('No fue posible verificar los países gestionables:', error);
    alcanceEnCurso = undefined;
    return SIN_ALCANCE;
  });
  return alcanceEnCurso;
}

export function puedeGestionarPais(
  alcance: AlcanceGestion,
  idPais: string | null | undefined,
): boolean {
  if (alcance.todos) return true;
  return Boolean(idPais) && alcance.paises.has(idPais!);
}

export const MENSAJE_SIN_PERMISO_TERRITORIAL =
  'Solo puedes modificar registros de tu país principal o de países con cobertura temporal vigente.';
