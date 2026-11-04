import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

const text = (max: number) => z.string().trim().min(1).max(max).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v));
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const productFields = z.strictObject({
  nombre: text(200), descripcion: text(10000), unidad_medida: text(100),
  tipo_item: z.enum(['producto', 'servicio']), categoria: text(200).nullable(),
  material_terminacion: text(500).nullable(), caracteristicas: z.record(z.string(), z.json()),
  informacion_adicional: text(10000).nullable(),
});
export const productCreateSchema = productFields.extend({
  id_organizacion: z.uuid(), tipo_item: productFields.shape.tipo_item.default('producto'),
  categoria: productFields.shape.categoria.default(null), material_terminacion: productFields.shape.material_terminacion.default(null),
  caracteristicas: productFields.shape.caracteristicas.default({}), informacion_adicional: productFields.shape.informacion_adicional.default(null),
});
export const productUpdateSchema = z.strictObject({
  version_esperada: version,
  cambios: productFields.partial().refine(v => Object.keys(v).length > 0),
});
export const productStateSchema = z.strictObject({ version_esperada: version });
export const productFiltersSchema = z.strictObject({
  id_pais: z.uuid().optional(), id_organizacion: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export function parseProduct<T>(schema: z.ZodType<T>, input: unknown): T {
  const value = schema.safeParse(input);
  if (!value.success) throw new ServiceError('DATOS_INVALIDOS', 'Revisa los campos, filtros y versión del producto.', 400);
  return value.data;
}
export const productId = (input: unknown) => parseProduct(z.uuid(), input);
export function productFilters(url: URL) {
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(values, key) || !value.trim()) throw new ServiceError('DATOS_INVALIDOS', 'No repitas filtros ni envíes valores vacíos.', 400);
    values[key] = value;
  }
  return parseProduct(productFiltersSchema, values);
}
export interface ProductsRepository {
  execute(token: string | undefined, operation: string, data: Record<string, unknown>, publicQuery?: boolean): Promise<unknown>;
}

// Proyección explícita: incluso una respuesta errónea del proveedor no agrega
// contactos, autores, rutas internas ni otros campos al catálogo público.
export const publicProductSchema = z.object({
  id_producto: z.uuid(), nombre: z.string(), descripcion: z.string(), unidad_medida: z.string(),
  tipo_item: z.enum(['producto', 'servicio']), categoria: z.string().nullable(),
  material_terminacion: z.string().nullable(), caracteristicas: z.record(z.string(), z.json()),
  informacion_adicional: z.string().nullable(),
  organizacion: z.object({ id_organizacion: z.uuid(), nombre: z.string() }),
  pais: z.object({ id_pais: z.uuid(), nombre: z.string(), codigo_iso: z.string() }),
  imagenes: z.array(z.object({ id_archivo: z.uuid(), descripcion: z.string().nullable(), mime_type: z.string() })),
});
export const productPageSchema = <T extends z.ZodType>(item: T) => z.object({
  products: z.array(item), limit: z.number().int(), offset: z.number().int(), hasMore: z.boolean(),
});
