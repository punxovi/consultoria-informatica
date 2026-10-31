import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export class CoverageError extends ServiceError {
  readonly fields?: Record<string, string[]>;

  constructor(
    code: string,
    message: string,
    status: number,
    fields?: Record<string, string[]>,
  ) {
    super(code, message, status);
    this.fields = fields;
  }
}

const fecha = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Usa una fecha con formato AAAA-MM-DD.',
).refine((valor) => {
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));
  return fechaUtc.getUTCFullYear() === anio
    && fechaUtc.getUTCMonth() === mes - 1
    && fechaUtc.getUTCDate() === dia;
}, 'La fecha indicada no es válida.');

const motivo = z.string()
  .trim()
  .min(5, 'Describe el motivo con al menos 5 caracteres.')
  .max(1000, 'El motivo no puede superar 1000 caracteres.');

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const resultado = schema.safeParse(value);
  if (resultado.success) return resultado.data;

  const fields: Record<string, string[]> = {};
  for (const issue of resultado.error.issues) {
    const field = String(issue.path.at(-1) ?? 'solicitud');
    (fields[field] ??= []).push(issue.message);
  }
  throw new CoverageError('DATOS_INVALIDOS', 'Revisa los datos de la cobertura.', 400, fields);
}

export const parseCoverageId = (value: string) => parse(z.uuid(), value);

export const parseCoverageCreate = (value: unknown) => parse(z.strictObject({
  id_usuario_beneficiario: z.uuid('Selecciona un Coordinador válido.'),
  id_pais: z.uuid('Selecciona un país válido.'),
  inicio_at: fecha,
  fin_at: fecha,
  motivo,
}).refine((data) => data.fin_at > data.inicio_at, {
  path: ['fin_at'],
  message: 'La fecha de término debe ser posterior a la fecha de inicio.',
}), value);

export const parseCoverageExtension = (value: unknown) => parse(z.strictObject({
  version_esperada: z.number().int().positive(),
  nueva_fin_at: fecha,
  motivo: motivo.optional(),
}), value);

export const parseCoverageRevocation = (value: unknown) => parse(z.strictObject({
  version_esperada: z.number().int().positive(),
  motivo_revocacion: motivo,
}), value);

export interface CoveragesRepository {
  execute(token: string, operation: string, input: Record<string, unknown>): Promise<unknown>;
}
