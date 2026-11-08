import { z } from 'zod';

export const MAX_BYTES = 52_428_800;
export const tipos = {
  'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
  'audio/mpeg': ['mp3'], 'audio/ogg': ['ogg'], 'audio/wav': ['wav'], 'video/mp4': ['mp4'], 'video/webm': ['webm'],
} as const;
export const accept = '.pdf,.jpg,.jpeg,.png,.webp,.mp3,.ogg,.wav,.mp4,.webm';
export function tipoArchivo(file: Pick<File, 'name' | 'type' | 'size'>): string {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const tipo = Object.entries(tipos).find(([, extensiones]) => (extensiones as readonly string[]).includes(extension ?? ''))?.[0];
  if (!tipo || (file.type && file.type !== tipo && !(tipo === 'audio/wav' && file.type === 'audio/x-wav'))) throw new Error('El tipo y la extensión deben corresponder a uno de los formatos permitidos.');
  if (!file.size) throw new Error('El archivo está vacío.');
  if (file.size > MAX_BYTES) throw new Error('El archivo supera el límite de 50 MiB.');
  if (file.name.length > 255) throw new Error('El nombre del archivo no puede superar 255 caracteres.');
  return tipo;
}
export const datosSchema = z.object({
  origen: z.string().trim().min(1, 'Indica el origen de la evidencia.').max(200),
  descripcion: z.string().trim().min(1, 'Describe qué respalda esta evidencia.').max(5000),
  personas: z.enum(['sin_personas', 'adultos', 'menores'], { error: 'Indica si aparecen personas identificables.' }),
  consentimiento: z.boolean(), tutor: z.boolean(), publicable: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.personas !== 'sin_personas' && !d.consentimiento) ctx.addIssue({ code: 'custom', path: ['consentimiento'], message: 'Debes declarar el consentimiento de las personas identificables.' });
  if (d.personas === 'menores' && !d.tutor) ctx.addIssue({ code: 'custom', path: ['tutor'], message: 'Debes declarar el consentimiento del padre, madre o tutor legal de los menores.' });
});
export type DatosFormulario = z.infer<typeof datosSchema>;
export type Consentimiento = { consentimiento_declarado: boolean; declaracion_consentimiento: string };
export function declaracion(datos: DatosFormulario): Consentimiento {
  return { consentimiento_declarado: true, declaracion_consentimiento: datos.personas === 'sin_personas'
    ? 'Declaro que esta evidencia no contiene personas identificables.'
    : datos.personas === 'menores'
      ? 'Declaro contar con el consentimiento de las personas identificables y con el consentimiento del padre, madre o tutor legal de los menores que aparecen en esta evidencia.'
      : 'Declaro contar con el consentimiento de las personas identificables que aparecen en esta evidencia.' };
}
// Edición: el consentimiento puede quedar sin declarar (equivale a retirarlo), pero entonces no se puede publicar.
export const edicionSchema = z.object({
  origen: z.string().trim().min(1, 'Indica el origen de la evidencia.').max(200),
  descripcion: z.string().trim().min(1, 'Describe qué respalda esta evidencia.').max(5000),
  personas: z.enum(['sin_personas', 'adultos', 'menores'], { error: 'Indica si aparecen personas identificables.' }),
  consentimiento: z.boolean(), tutor: z.boolean(), publicable: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.publicable && !consentimientoOtorgado(d)) ctx.addIssue({ code: 'custom', path: ['publicable'], message: 'Para publicar debes declarar el consentimiento correspondiente.' });
});
export const DECLARACION_RETIRADA = 'Consentimiento retirado al editar la evidencia.';
export function consentimientoOtorgado(d: Pick<DatosFormulario, 'personas' | 'consentimiento' | 'tutor'>) {
  return d.personas === 'sin_personas' || (d.consentimiento && (d.personas !== 'menores' || d.tutor));
}
/** Deduce la opción de «personas» a partir de la declaración registrada; vacío si no se reconoce o fue retirada. */
export function personasDesde(item: { consentimiento_declarado: boolean | null; declaracion_consentimiento: string | null }): DatosFormulario['personas'] | '' {
  if (item.consentimiento_declarado !== true) return '';
  const opciones = ['sin_personas', 'adultos', 'menores'] as const;
  return opciones.find(p => declaracion({ personas: p, consentimiento: true, tutor: true, origen: '', descripcion: '', publicable: false }).declaracion_consentimiento === item.declaracion_consentimiento) ?? '';
}

export const evidenciaSchema = z.object({
  id_evidencia: z.uuid(), id_accion: z.uuid(), origen: z.string(), descripcion: z.string(),
  nombre_original: z.string(), mime_type: z.string(), tamano_bytes: z.number().int().positive(), version: z.number().int().positive(),
  estado_carga: z.enum(['reservado', 'disponible', 'fallido']), estado_publicacion: z.enum(['no_publicada', 'publicada', 'retirada']),
  consentimiento_declarado: z.boolean().nullable(), declaracion_consentimiento: z.string().nullable(),
  incorporado_at: z.string().nullable().optional(), incorporado_por: z.string().nullable().optional(),
  consentimiento_at: z.string().nullable().optional(), consentimiento_por: z.string().nullable().optional(),
});
export type Evidencia = z.infer<typeof evidenciaSchema>;
export type Reserva = { id_accion: string; origen: string; descripcion: string; nombre_original: string; mime_type: string; tamano_bytes: number; consentimiento: Consentimiento };
export type Cambios = { estado_publicacion?: Evidencia['estado_publicacion']; consentimiento?: Consentimiento; origen?: string; descripcion?: string };
