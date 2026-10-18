import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

const quantity = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const date = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine(value =>
  value.slice(0, 4) !== '0000' && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'Fecha de medición inválida.');
export const associateIndicatorsSchema = z.object({
  indicadores: z.array(z.object({ id_indicador: z.uuid(), meta: quantity }).strict()).min(1).max(100)
    .refine(items => new Set(items.map(i => i.id_indicador)).size === items.length, 'No repitas indicadores en la selección.'),
}).strict();
export const updateGoalSchema = z.object({ version_esperada: version, cambios: z.object({ meta: quantity }).strict() }).strict();
const resultFields = z.object({
  valor_medido: quantity, fecha_medicion: date, observaciones: z.string().trim().max(1000).nullable().optional(),
}).strict();
export const createResultSchema = resultFields.extend({ id_indicador: z.uuid() });
export const updateResultSchema = z.object({ version_esperada: version, cambios: resultFields }).strict();

export function parseIndicatorInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ServiceError('DATOS_INVALIDOS', 'Revisa los indicadores, los valores, la fecha y la versión del registro.', 400);
  return parsed.data;
}

export interface IndicatorsRepository {
  catalog(token: string): Promise<unknown[]>;
  list(token: string, action: string): Promise<unknown[]>;
  associate(token: string, action: string, input: z.infer<typeof associateIndicatorsSchema>): Promise<unknown[]>;
  updateGoal(token: string, id: string, input: z.infer<typeof updateGoalSchema>): Promise<unknown>;
  createResult(token: string, input: z.infer<typeof createResultSchema>): Promise<unknown>;
  updateResult(token: string, id: string, input: z.infer<typeof updateResultSchema>): Promise<unknown>;
}
