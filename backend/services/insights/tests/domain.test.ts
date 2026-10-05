import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSnapshot, parseInsightFilters, type RawInsights } from '../src/domain/insights.ts';

const countryA = '11111111-1111-4111-8111-111111111111';
const countryB = '22222222-2222-4222-8222-222222222222';
const raw: RawInsights = {
  countries: [
    { id_pais: countryA, codigo_iso: 'CL', nombre: 'Chile' },
    { id_pais: countryB, codigo_iso: 'AR', nombre: 'Argentina' },
  ],
  organizations: [
    { id_organizacion: 'o1', id_pais: countryA, numero_beneficiarios: 10 },
    { id_organizacion: 'o2', id_pais: countryB, numero_beneficiarios: 20 },
  ],
  plans: [
    { id_plan: 'p1', id_organizacion: 'o1', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31' },
    { id_plan: 'p2', id_organizacion: 'o2', fecha_inicio: '2025-01-01', fecha_termino: '2025-12-31' },
  ],
  actions: [
    { id_accion: 'a1', id_plan: 'p1', fecha_inicio: '2026-08-01', fecha_termino: '2026-09-10', estado: 'cumplida' },
    { id_accion: 'a2', id_plan: 'p1', fecha_inicio: '2026-09-01', fecha_termino: '2026-10-10', estado: 'atrasada' },
    { id_accion: 'a3', id_plan: 'p2', fecha_inicio: '2025-01-01', fecha_termino: '2025-02-01', estado: 'cancelada' },
  ],
};

describe('cálculo de Dashboard', () => {
  test('calcula métricas globales, progreso y serie mensual', () => {
    const result = buildSnapshot(raw, {}, new Date('2026-10-01T12:00:00.000Z'));
    assert.deepEqual(result.metrics, { organizations: 2, activePlans: 1, beneficiaries: 30, activeAlerts: 2 });
    assert.deepEqual(result.progress, { total: 3, completed: 1, overdue: 1, percentage: 33 });
    assert.equal(result.monthlyActions.length, 9);
    assert.deepEqual(result.monthlyActions.at(-1), { key: '2026-10', label: 'Oct', completed: 0, pending: 1 });
  });
  test('filtra todas las relaciones por país', () => {
    const result = buildSnapshot(raw, { countryId: countryA }, new Date('2026-10-01T12:00:00.000Z'));
    assert.equal(result.metrics.organizations, 1);
    assert.equal(result.metrics.beneficiaries, 10);
    assert.equal(result.progress.total, 2);
    assert.equal(result.metrics.activeAlerts, 1);
  });
  test('valida filtros de país y propiedades adicionales', () => {
    assert.equal(parseInsightFilters(new URL(`http://local/v1/dashboard?id_pais=${countryA}`)).countryId, countryA);
    assert.throws(() => parseInsightFilters(new URL('http://local/v1/dashboard?id_pais=invalido')), /UUID válido/);
    assert.throws(() => parseInsightFilters(new URL('http://local/v1/dashboard?otro=1')), /no está permitido/);
  });
});
