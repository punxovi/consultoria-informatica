import { z } from 'zod';

// Cuenta de Coordinador según el contrato propuesto en docs/CONTRATO-COORDINADORES.md:
// perfiles (nombre, activo, version) + correo de auth.users + país de su asignación COORD.
export const coordinadorSchema = z.object({
  id_usuario: z.uuid(),
  nombre: z.string().min(1),
  correo: z.string().min(3),
  id_pais: z.uuid(),
  pais: z.object({ id_pais: z.uuid(), nombre: z.string().min(1), codigo_iso: z.string().optional() }).optional(),
  activo: z.boolean(),
  version: z.number().int().positive(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Coordinador = z.infer<typeof coordinadorSchema>;

export const LIMITE_NOMBRE = 120;
export const LIMITE_CORREO = 254;
const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nombre = z
  .string({ error: 'Ingresa el nombre del Coordinador.' })
  .trim()
  .min(1, 'Ingresa el nombre del Coordinador.')
  .max(LIMITE_NOMBRE, `El nombre no puede superar ${LIMITE_NOMBRE} caracteres.`);

const idPais = z
  .string({ error: 'Selecciona el país principal.' })
  .trim()
  .min(1, 'Selecciona el país principal.')
  .pipe(z.uuid('Selecciona un país principal válido.'));

export const crearCoordinadorSchema = z.object({
  nombre,
  correo: z
    .string({ error: 'Ingresa el correo electrónico.' })
    .trim()
    .min(1, 'Ingresa el correo electrónico.')
    .max(LIMITE_CORREO, `El correo no puede superar ${LIMITE_CORREO} caracteres.`)
    .regex(correoValido, 'Ingresa un correo electrónico válido (ej. nombre@fundacion.org).')
    .transform((valor) => valor.toLowerCase()),
  id_pais: idPais,
});

// El correo identifica el inicio de sesión: no se modifica desde la edición.
export const editarCoordinadorSchema = z.object({ nombre, id_pais: idPais });

export type DatosCrearCoordinador = z.infer<typeof crearCoordinadorSchema>;
export type DatosEditarCoordinador = z.infer<typeof editarCoordinadorSchema>;

export type ErroresFormulario = Partial<Record<'nombre' | 'correo' | 'id_pais', string>>;

export function erroresDeValidacion(error: z.ZodError): ErroresFormulario {
  const errores: ErroresFormulario = {};
  for (const issue of error.issues) {
    const campo = issue.path[0] as keyof ErroresFormulario;
    if (campo && !errores[campo]) errores[campo] = issue.message;
  }
  return errores;
}

export type FiltroEstado = 'todas' | 'activas' | 'inactivas';

export interface FiltrosCoordinadores {
  texto: string;
  estado: FiltroEstado;
  idPais: string;
}

const normalizar = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function filtrarCoordinadores(lista: Coordinador[], filtros: FiltrosCoordinadores): Coordinador[] {
  const texto = normalizar(filtros.texto);
  return lista.filter((c) =>
    (!texto || normalizar(c.nombre).includes(texto) || normalizar(c.correo).includes(texto))
    && (filtros.estado === 'todas' || (filtros.estado === 'activas') === c.activo)
    && (!filtros.idPais || c.id_pais === filtros.idPais));
}

export function ordenarCoordinadores(lista: Coordinador[]): Coordinador[] {
  return [...lista].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
}
