import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export const ESTADOS_COMPROMISO = ['pendiente', 'cumplido'] as const;
export type EstadoCompromiso = typeof ESTADOS_COMPROMISO[number];
const texto = (nombre: string, max: number) => z.string().trim().min(1, `${nombre} es obligatorio.`).max(max, `${nombre} no puede superar ${max} caracteres.`);
const fecha = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v, 'La fecha límite debe ser una fecha válida en formato AAAA-MM-DD.');
const campos = {
  descripcion: texto('El acuerdo',2000), responsable_nombre: texto('El responsable',150),
  responsable_contacto: texto('El contacto del responsable',300), fecha_limite: fecha,
  observaciones: z.string().trim().max(2000).nullable().transform(v => v || null),
};
export const crearCompromisoSchema = z.object({
  ...campos, id_acta: z.uuid('Selecciona un acta válida.'), estado: z.literal('pendiente').optional().default('pendiente'),
}).strict();
export const actualizarCompromisoSchema = z.object({
  version_esperada: z.number().int().positive('La versión esperada debe ser mayor que cero.'),
  cambios: z.object({...campos,estado:z.enum(ESTADOS_COMPROMISO)}).partial().strict()
    .refine(v => Object.keys(v).length > 0, 'Debes enviar al menos un campo para actualizar.'),
}).strict();
export type CamposCompromiso = z.infer<typeof crearCompromisoSchema>;
export interface ActualizarCompromisoInput {
  versionEsperada: number;
  cambios: z.infer<typeof actualizarCompromisoSchema>['cambios'];
}
export interface Compromiso extends Omit<CamposCompromiso,'estado' | 'responsable_contacto'> {
  responsable_contacto: string | null;
  id_compromiso: string; id_organizacion: string; estado: EstadoCompromiso;
  version: number; cumplido_at: string | null; archived_at: string | null;
  created_at: string; updated_at: string;
}
export interface OrigenesCompromisos {
  puede_gestionar: boolean;
  actas: Array<{ id_acta:string; nombre:string; id_plan:string; id_accion:string | null }>;
}
function errorZod(error: z.ZodError): never {
  throw new ServiceError('DATOS_INVALIDOS',error.issues[0]?.message ?? 'Datos inválidos.',400,{
    issues:error.issues.map(({path,message})=>({path,message})),
  });
}
export function parseCamposCompromiso(value: unknown): CamposCompromiso {
  const r=crearCompromisoSchema.safeParse(value); if(!r.success) return errorZod(r.error); return r.data;
}
export function parseActualizarCompromisoInput(value: unknown): ActualizarCompromisoInput {
  const r=actualizarCompromisoSchema.safeParse(value); if(!r.success) return errorZod(r.error);
  return {versionEsperada:r.data.version_esperada,cambios:r.data.cambios};
}
