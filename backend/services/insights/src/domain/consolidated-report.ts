import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ConsolidatedReportFilters, ConsolidatedReportSnapshot } from './insights.ts';

const date = z.iso.date().refine(value => !value.startsWith('0000-'));
export const consolidatedFiltersSchema = z.strictObject({
  startDate: date, endDate: date,
  countryId: z.uuid().optional(), organizationId: z.uuid().optional(), programId: z.uuid().optional(),
  indicatorIds: z.array(z.uuid()).min(1).max(100).optional(),
  resultIds: z.array(z.uuid()).min(1).max(100).optional(),
}).refine(value => value.startDate <= value.endDate);
const name = z.string();
const organization = z.object({ id_organizacion: z.uuid(), nombre: name, numero_beneficiarios: z.number().int().nonnegative(), pais: name });
const plan = z.object({ id_plan: z.uuid(), nombre: name, organizacion: name, programa: name, fecha_inicio: date, fecha_termino: date });
const action = z.object({ id_accion: z.uuid(), nombre: name, estado: z.enum(['no_iniciada','en_desarrollo','atrasada','cancelada','cumplida']), fecha_inicio: date, fecha_termino: date, plan: name });
const commitment = z.object({ id_compromiso: z.uuid(), acuerdo: name, estado: z.enum(['pendiente','cumplido']), fecha_cumplimiento: z.iso.datetime({ offset: true }).nullable(), organizacion: name });
const donation = z.object({ id_donacion: z.uuid(), fecha: date, tipo_aporte: z.enum(['dinero','recurso']), monto: z.number().finite().nullable(), cantidad: z.number().finite().nullable(), organizacion: name });
const indicator = z.object({ id_indicador: z.uuid(), nombre: name, valor_obtenido: z.number().finite().nullable(), organizacion: name });
const result = z.object({ id_resultado: z.uuid(), descripcion: name, fecha_obtencion: date, organizacion: name });
const snapshotSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }), period: z.object({ start: date, end: date }),
  filters: consolidatedFiltersSchema,
  sections: z.object({ organizations: z.array(organization), plans: z.array(plan), actions: z.array(action),
    commitments: z.array(commitment), donations: z.array(donation), indicators: z.array(indicator), results: z.array(result) }),
  summary: z.object({ totalBeneficiaries: z.number().int().nonnegative(), totalDonationsAmount: z.number().finite(), completedActions: z.number().int().nonnegative() }),
});

export function validateConsolidatedFilters(value: unknown): ConsolidatedReportFilters {
  const parsed = consolidatedFiltersSchema.safeParse(value);
  if (!parsed.success) throw new ServiceError('DATOS_INVALIDOS','El rango y los filtros del consolidado no son válidos.',400);
  return parsed.data;
}

export function parseConsolidatedSnapshot(value: unknown, filters: ConsolidatedReportFilters): ConsolidatedReportSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  const invalid = () => new ServiceError('RESPUESTA_INVALIDA','La base de datos devolvió un consolidado inválido o incompleto.',502);
  if (!parsed.success) throw invalid();
  const snapshot = parsed.data;
  const normalized = (f: ConsolidatedReportFilters) => JSON.stringify([f.startDate,f.endDate,f.countryId ?? null,f.organizationId ?? null,f.programId ?? null,f.indicatorIds ?? [],f.resultIds ?? []]);
  if (normalized(snapshot.filters) !== normalized(filters) || snapshot.period.start !== filters.startDate || snapshot.period.end !== filters.endDate) throw invalid();
  const groups = [snapshot.sections.organizations.map(r => r.id_organizacion),snapshot.sections.plans.map(r => r.id_plan),
    snapshot.sections.actions.map(r => r.id_accion),snapshot.sections.commitments.map(r => r.id_compromiso),
    snapshot.sections.donations.map(r => r.id_donacion),snapshot.sections.indicators.map(r => r.id_indicador),snapshot.sections.results.map(r => r.id_resultado)];
  if (groups.some(ids => new Set(ids).size !== ids.length)) throw invalid();
  if (snapshot.summary.totalBeneficiaries !== snapshot.sections.organizations.reduce((sum,r) => sum+r.numero_beneficiarios,0)
    || snapshot.summary.completedActions !== snapshot.sections.actions.filter(r => r.estado === 'cumplida').length) throw invalid();
  return snapshot;
}
