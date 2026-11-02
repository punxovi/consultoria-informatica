import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export class CountryError extends ServiceError {
  readonly fields?: Record<string, string[]>;
  constructor(code: string, message: string, status: number, fields?: Record<string, string[]>) {
    super(code, message, status); this.fields = fields;
  }
}
const nombre = z.string().trim().min(1).max(120).refine(v => !/[\x00-\x1f\x7f]/.test(v), 'El nombre no admite caracteres de control.');
const codigoIso = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Usa un código ISO de dos letras.');
const codigoArea = z.string().trim().regex(/^\+[1-9][0-9]{0,2}$/, 'Usa un prefijo internacional como +56, +54 o +598.');
const zonaHoraria = z.string().trim().max(100).refine(value => {
  if (value !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)) return false;
  try { new Intl.DateTimeFormat('es', { timeZone: value }); return true; } catch { return false; }
}, 'Usa una zona IANA válida, por ejemplo America/Santiago.').transform(value => new Intl.DateTimeFormat('es', { timeZone: value }).resolvedOptions().timeZone);

export const countryFieldsSchema = z.strictObject({
  nombre, codigo_iso: codigoIso, codigo_area_telefonica: codigoArea, zona_horaria: zonaHoraria,
});
export const countryUpdateSchema = z.strictObject({
  version_esperada: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  cambios: countryFieldsSchema.partial().refine(value => Object.keys(value).length > 0, 'Informa al menos un cambio.'),
});
export interface Country {
  id_pais: string; nombre: string; codigo_iso: string;
  codigo_area_telefonica: string | null; zona_horaria: string | null;
  version: number; created_at: string; updated_at: string;
  configuracion_pendiente: boolean;
}
export type CountryFields = z.infer<typeof countryFieldsSchema>;
export type CountryUpdate = z.infer<typeof countryUpdateSchema>;
export interface CountriesRepository {
  execute(token: string, operation: string, input: Record<string, unknown>): Promise<unknown>;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path.at(-1) ?? 'solicitud');
    (fields[field] ??= []).push(issue.message);
  }
  throw new CountryError('DATOS_INVALIDOS', 'Revisa los datos del país.', 400, fields);
}
export const parseCountryCreate = (value: unknown) => parse(countryFieldsSchema, value);
export const parseCountryUpdate = (value: unknown) => parse(countryUpdateSchema, value);
export const parseCountryId = (value: unknown) => parse(z.uuid(), value);
