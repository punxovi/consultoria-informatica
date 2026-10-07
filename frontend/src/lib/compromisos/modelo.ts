import { z } from 'zod';

export const fechaSchema = z.string().refine(valor => /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
  !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) && new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor,
  'Ingresa una fecha válida.');
export const camposCompromisoSchema = z.object({
  descripcion: z.string().trim().min(1, 'Describe el acuerdo.').max(2000),
  responsable_nombre: z.string().trim().min(1, 'Ingresa el responsable.').max(150),
  responsable_contacto: z.string().trim().min(1, 'Ingresa un correo, teléfono u otro medio de contacto.').max(300),
  fecha_limite: fechaSchema,
  observaciones: z.string().trim().max(2000),
});
export const guardarCompromisoSchema = camposCompromisoSchema.extend({
  id_acta: z.string().min(1, 'Selecciona el acta de origen.'),
  estado: z.enum(['pendiente', 'cumplido']),
}).strict();
export type CamposCompromiso = z.infer<typeof camposCompromisoSchema>;
export type GuardarCompromiso = z.infer<typeof guardarCompromisoSchema>;
export interface ActaOrigen { id_acta: string; nombre: string; id_plan?: string; id_accion?: string }
export interface Compromiso extends GuardarCompromiso {
  id_compromiso: string;
  id_organizacion: string;
  version: number;
  created_at: string;
  updated_at: string;
  cumplido_at: string | null;
}
export interface ServicioCompromisos {
  listar(idOrganizacion: string): Promise<Compromiso[]>;
  actas(idOrganizacion: string): Promise<ActaOrigen[]>;
  obtener(idOrganizacion: string, id: string): Promise<Compromiso>;
  crear(idOrganizacion: string, entrada: GuardarCompromiso): Promise<Compromiso>;
  actualizar(idOrganizacion: string, id: string, version: number, entrada: GuardarCompromiso): Promise<Compromiso>;
}
export function hoyLocal(fecha = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
export function vencido(compromiso: Pick<Compromiso, 'estado' | 'fecha_limite'>, hoy = hoyLocal()): boolean {
  return compromiso.estado === 'pendiente' && compromiso.fecha_limite < hoy;
}
