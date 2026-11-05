import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
const text = (max: number) => z.string().trim().min(1).max(max).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v));
export const quoteState = z.enum(['solicitada','en_gestion','cotizada','cerrada','rechazada']);
export const publicQuoteSchema = z.strictObject({
  nombre: text(80), apellido: text(80), nombre_solicitante: text(161).optional(),
  correo: z.email().max(320).transform(v => v.toLowerCase()),
  telefono: z.string().trim().max(60).optional(), mensaje: z.string().trim().max(2000).optional(),
  items: z.array(z.strictObject({ id_producto: z.uuid(), cantidad: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER) }))
    .min(1).max(100).refine(items => new Set(items.map(i => i.id_producto)).size === items.length),
}).refine(v => !v.nombre_solicitante || v.nombre_solicitante === `${v.nombre} ${v.apellido}`)
  .transform(v => ({ ...v, nombre_solicitante: `${v.nombre} ${v.apellido}` }));
export const quoteUpdateSchema = z.strictObject({ version_esperada: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), estado: quoteState });
const filtersSchema = z.strictObject({
  id_pais: z.uuid().optional(), estado: quoteState.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export function parseQuote<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ServiceError('DATOS_INVALIDOS','Revisa los datos de contacto, productos, cantidades y filtros de la solicitud.',400);
  return parsed.data;
}
export const quoteId = (value: unknown) => parseQuote(z.uuid(),value);
export function quoteFilters(url: URL) {
  const values: Record<string,string> = Object.create(null);
  for (const [key,value] of url.searchParams) {
    if (Object.hasOwn(values,key) || !value.trim()) throw new ServiceError('DATOS_INVALIDOS','No repitas filtros ni envíes valores vacíos.',400);
    values[key] = value;
  }
  return parseQuote(filtersSchema,values);
}
export type PublicQuoteRequest = z.infer<typeof publicQuoteSchema>;
export const quoteConfirmationSchema = z.object({ id_solicitud: z.uuid(), estado: z.literal('solicitada'),
  id_envio: z.uuid(), solicitudes: z.array(z.object({id_solicitud:z.uuid(),estado:z.literal('solicitada')})).min(1) });
export const privateQuoteSchema = z.object({
  id_solicitud:z.uuid(),nombre_solicitante:z.string(),correo:z.string(),telefono:z.string().nullable(),mensaje:z.string().nullable(),
  nombre:z.string().nullable(),apellido:z.string().nullable(),id_envio:z.uuid().nullable(),id_pais:z.uuid().nullable(),id_coordinador:z.uuid().nullable(),
  sin_coordinador_al_recibir:z.boolean(),solo_informativa:z.boolean(),
  estado:quoteState,created_at:z.string(),updated_at:z.string(),version:z.number().int().positive(),estados_permitidos:z.array(quoteState),
  items:z.array(z.object({id_producto:z.uuid(),nombre:z.string(),nombre_producto:z.string(),cantidad:z.number().positive(),unidad_medida:z.string(),
    organizacion:z.object({id_organizacion:z.uuid(),nombre:z.string(),pais:z.object({id_pais:z.uuid(),nombre:z.string()})})})).min(1),
});
export const quotePageSchema = z.object({requests:z.array(privateQuoteSchema),limit:z.number().int(),offset:z.number().int(),hasMore:z.boolean()});
