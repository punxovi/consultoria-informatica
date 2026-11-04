import { z } from 'zod';
export const itemPublicoSchema = z.object({
  id_producto: z.string().min(1), nombre: z.string().min(1), descripcion: z.string(),
  unidad_medida: z.string(), tipo_item: z.enum(['producto', 'servicio']),
  publicado: z.boolean().optional(), archived_at: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(), material_terminacion: z.string().nullable().optional(),
  caracteristicas: z.record(z.string(), z.unknown()).nullable().optional(),
  organizacion: z.object({ id_organizacion: z.string().min(1), nombre: z.string(), pais: z.object({ id_pais: z.string().min(1), nombre: z.string() }).nullable() }).nullable().optional(),
  imagenes: z.array(z.object({ url: z.string().nullable() })).optional(),
});
export type ItemPublico = z.infer<typeof itemPublicoSchema>;
export const imagenPredeterminada = '/images/producto-sin-foto.svg';
export function urlImagen(valor?: string | null): string {
  try {
    const url = new URL(valor ?? '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : imagenPredeterminada;
  } catch { return imagenPredeterminada; }
}
export function filtrarCatalogo(items: ItemPublico[], pais: string, organizacion: string) {
  return items.filter(item => item.publicado !== false && !item.archived_at &&
    (!pais || item.organizacion?.pais?.id_pais === pais) &&
    (!organizacion || item.organizacion?.id_organizacion === organizacion));
}
// Solo características públicas: nunca renderizar campos arbitrarios como precio o stock.
export function caracteristicasPublicas(item: ItemPublico): [string, string][] {
  const texto = (v: unknown) => typeof v === 'string' ? v.trim() : '';
  return [
    ['Categoría', texto(item.categoria) || texto(item.caracteristicas?.categoria)],
    ['Material y terminación', texto(item.material_terminacion)],
    ['Material', texto(item.caracteristicas?.material)],
    ['Terminación', texto(item.caracteristicas?.terminacion)],
    ['Modalidad', texto(item.caracteristicas?.modalidad)],
  ].filter(([, valor]) => valor) as [string, string][];
}
