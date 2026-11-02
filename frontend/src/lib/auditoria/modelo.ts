import { z } from 'zod';

export const filtrosSchema = z.object({
  usuario: z.string().trim().max(150, 'Usa hasta 150 caracteres.'),
  pais: z.string().trim().max(100, 'Usa hasta 100 caracteres.'),
  desde: z.union([z.literal(''), z.string().date('Ingresa una fecha válida.')]),
  hasta: z.union([z.literal(''), z.string().date('Ingresa una fecha válida.')]),
  operacion: z.string().trim().max(80, 'Usa hasta 80 caracteres.'),
  entidad: z.string().trim().max(100, 'Usa hasta 100 caracteres.'),
}).refine(f => !f.desde || !f.hasta || f.desde <= f.hasta, {
  path: ['hasta'], message: 'La fecha de término debe ser igual o posterior al inicio.',
});
export type Filtros = z.infer<typeof filtrosSchema>;
export const vacios: Filtros = { usuario: '', pais: '', desde: '', hasta: '', operacion: '', entidad: '' };
// La proyección es propuesta para el servicio de consulta; no expone antes/después.
export const paginaSchema = z.object({
  events: z.array(z.object({
    id: z.string().min(1), usuario: z.string().nullable(), rol: z.string().nullable(),
    fecha_hora: z.string().datetime({ offset: true }), pais: z.string().nullable(),
    ip: z.string().nullable(), operacion: z.string().min(1), entidad: z.string().min(1),
    referencia: z.string().nullable(),
  })),
  nextCursor: z.string().min(1).nullable(),
});
export type Evento = z.infer<typeof paginaSchema>['events'][number];
export function parametros(filtros: Filtros, cursor?: string): string {
  const valores = filtrosSchema.parse(filtros);
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(valores)) if (valor) query.set(clave, valor);
  query.set('limit', '50');
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}
