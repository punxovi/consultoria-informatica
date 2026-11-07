import type { OtorgarCoberturaInput, ExtenderCoberturaInput, RevocarCoberturaInput, PermisoTemporalResponse, EventoHistorialCoberturaResponse, CoberturaContextoResponse } from '../../../../shared/contracts/src/coverages.contracts.ts';
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

const fecha = z.iso.date('Usa una fecha calendario con formato AAAA-MM-DD.')
  .refine(value => !value.startsWith('0000-'), 'La fecha indicada no es válida.');

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

export const parseCoverageCreate = (value: unknown): OtorgarCoberturaInput => parse(z.strictObject({
  id_usuario_beneficiario: z.uuid('Selecciona un Coordinador válido.'),
  id_pais: z.uuid('Selecciona un país válido.'),
  inicio_at: fecha,
  fin_at: fecha,
  motivo,
}).refine((data) => data.fin_at > data.inicio_at, {
  path: ['fin_at'],
  message: 'La fecha de término debe ser posterior a la fecha de inicio.',
}), value);

export const parseCoverageExtension = (value: unknown): ExtenderCoberturaInput => parse(z.strictObject({
  version_esperada: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  nueva_fin_at: fecha,
  motivo: motivo.optional(),
}), value);

export const parseCoverageRevocation = (value: unknown): RevocarCoberturaInput => parse(z.strictObject({
  version_esperada: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  motivo_revocacion: motivo,
}), value);

export interface CoveragesRepository {
  execute(token: string, operation: string, input: Record<string, unknown>): Promise<unknown>;
}

const timestamp = z.iso.datetime({ offset: true });
const coverageResponse = z.object({
  id_permiso_temporal: z.uuid(), id_usuario_beneficiario: z.uuid(), coordinador_nombre: z.string(),
  id_pais: z.uuid(), pais_nombre: z.string(), motivo: z.string(), inicio_at: timestamp, fin_at: timestamp,
  revocado_at: timestamp.nullable(), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  condicion: z.enum(['futura','vigente','vencida','revocada']), puede_extender: z.boolean(), puede_revocar: z.boolean(),
});
const historyResponse = z.object({
  id_historial: z.uuid(), id_permiso_temporal: z.uuid(), tipo_evento: z.enum(['OTORGAR','EXTENDER','REVOCAR']),
  fin_at_anterior: timestamp.nullable(), fin_at_nuevo: timestamp.nullable(), motivo: z.string(),
  accion_por: z.uuid(), accion_por_nombre: z.string(), accion_at: timestamp,
});
const contextResponse = z.object({id_permiso_temporal:z.uuid(),id_pais:z.uuid(),inicio_at:timestamp,fin_at:timestamp});

export function parseCoverageResponse(operation: string, value: unknown): PermisoTemporalResponse | PermisoTemporalResponse[] | EventoHistorialCoberturaResponse[] | CoberturaContextoResponse[] {
  const schema = operation === 'history' ? z.array(historyResponse)
    : operation === 'list' ? z.array(coverageResponse)
    : operation === 'mine' ? z.array(contextResponse) : coverageResponse;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CoverageError('RESPUESTA_INVALIDA','El servicio devolvió datos de cobertura inválidos o incompletos.',502);
  return parsed.data;
}
