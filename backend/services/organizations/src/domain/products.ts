import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface ProductInput {
  id_organizacion: string; nombre: string; descripcion: string; unidad_medida: string;
  categoria: string | null; material: string | null; terminacion: string | null;
  tipo_item?: 'producto' | 'servicio'; caracteristicas?: Record<string, unknown>; informacion_adicional?: string | null;
}
export type ProductChanges = Partial<Omit<ProductInput, 'id_organizacion'>> & { publicado?: boolean };
function invalid(message: string): never { throw new ServiceError('DATOS_INVALIDOS', message, 400); }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Se requiere un objeto JSON.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !fields.includes(key))) invalid('La solicitud contiene campos no admitidos.');
  return row;
}
export function productId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())) invalid('El identificador debe ser un UUID válido.');
  return value.trim().toLowerCase();
}
const textFields = { nombre: 150, descripcion: 2000, unidad_medida: 50, categoria: 80, material: 80, terminacion: 80, informacion_adicional: 2000 };
const required = new Set(['nombre', 'descripcion', 'unidad_medida']);
function fields(row: Record<string, unknown>): ProductChanges {
  const result: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(textFields)) {
    if (!Object.hasOwn(row, key)) continue;
    const value = row[key];
    if (value === null && !required.has(key)) { result[key] = null; continue; }
    if (typeof value !== 'string' || value.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) invalid(`El campo ${key} no es válido.`);
    if (required.has(key) && !value.trim()) invalid(`Completa el campo ${key}.`);
    result[key] = value.trim() || null;
  }
  if (Object.hasOwn(row, 'tipo_item')) {
    if (!['producto', 'servicio'].includes(String(row.tipo_item)) || typeof row.tipo_item !== 'string') invalid('El tipo de producto no es válido.');
    result.tipo_item = row.tipo_item;
  }
  if (Object.hasOwn(row, 'caracteristicas')) {
    if (!row.caracteristicas || typeof row.caracteristicas !== 'object' || Array.isArray(row.caracteristicas)
      || JSON.stringify(row.caracteristicas).length > 20000) invalid('Las características deben ser un objeto JSON de hasta 20000 caracteres.');
    result.caracteristicas = row.caracteristicas;
  }
  if (Object.hasOwn(row, 'publicado')) {
    if (typeof row.publicado !== 'boolean') invalid('El estado de publicación no es válido.');
    result.publicado = row.publicado;
  }
  return result as ProductChanges;
}
const editable = [...Object.keys(textFields), 'tipo_item', 'caracteristicas', 'publicado'];
export function parseProductCreate(value: unknown): ProductInput {
  const row = object(value, ['id_organizacion', ...editable]);
  for (const key of required) if (!Object.hasOwn(row, key)) invalid(`Completa el campo ${key}.`);
  const parsed = fields(row);
  if (parsed.publicado === true) invalid('El producto se crea sin publicar; actívalo después de registrarlo.');
  const { publicado, ...data } = parsed;
  return { categoria: null, material: null, terminacion: null, ...data,
    id_organizacion: productId(row.id_organizacion) } as ProductInput;
}
export function parseProductUpdate(value: unknown): { version: number; changes: ProductChanges } {
  const row = object(value, ['version_esperada', 'cambios']);
  if (!Number.isSafeInteger(row.version_esperada) || Number(row.version_esperada) < 1 || Number(row.version_esperada) >= Number.MAX_SAFE_INTEGER) invalid('La versión esperada debe ser un entero positivo seguro.');
  const changes = fields(object(row.cambios, editable));
  if (!Object.keys(changes).length) invalid('Indica al menos un cambio.');
  return { version: Number(row.version_esperada), changes };
}
export function parseCatalogFilters(params: URLSearchParams): { id_pais?: string; id_organizacion?: string } {
  const result: { id_pais?: string; id_organizacion?: string } = {};
  for (const key of params.keys()) if (!['id_pais', 'id_organizacion'].includes(key)) invalid('Filtro no admitido.');
  for (const key of ['id_pais', 'id_organizacion'] as const) {
    if (!params.has(key)) continue;
    if (params.getAll(key).length !== 1) invalid('No se admiten filtros repetidos.');
    result[key] = productId(params.get(key));
  }
  return result;
}
