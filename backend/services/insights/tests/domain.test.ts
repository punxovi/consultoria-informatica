import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildSnapshot,
  parseInsightFilters,
  parseReportRequest,
  prepareReport,
  type RawInsights,
} from '../src/domain/insights.ts';

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

describe('calculo de Dashboard y privacidad de Reportes', () => {
  test('calcula metricas globales, progreso y serie mensual', () => {
    const result = buildSnapshot(raw, {}, new Date('2026-10-01T12:00:00.000Z'));
    assert.deepEqual(result.metrics, { organizations: 2, activePlans: 1, beneficiaries: 30, activeAlerts: 2 });
    assert.deepEqual(result.progress, { total: 3, completed: 1, overdue: 1, percentage: 33 });
    assert.equal(result.monthlyActions.length, 9);
    assert.deepEqual(result.monthlyActions.at(-1), { key: '2026-10', label: 'Oct', completed: 0, pending: 1 });
  });
  test('filtra todas las relaciones por pais', () => {
    const result = buildSnapshot(raw, { countryId: countryA }, new Date('2026-10-01T12:00:00.000Z'));
    assert.equal(result.metrics.organizations, 1);
    assert.equal(result.metrics.beneficiaries, 10);
    assert.equal(result.progress.total, 2);
    assert.equal(result.metrics.activeAlerts, 1);
  });
  test('filtra por año de gestión en el Backend y devuelve los doce meses del período', () => {
    const result = buildSnapshot(raw, { year: 2026 }, new Date('2026-10-01T12:00:00.000Z'));
    assert.equal(result.metrics.organizations, 1);
    assert.equal(result.metrics.activePlans, 1);
    assert.equal(result.metrics.beneficiaries, 10);
    assert.equal(result.progress.total, 2);
    assert.equal(result.progress.percentage, 50);
    assert.equal(result.monthlyActions.length, 12);
    assert.equal(result.monthlyActions[0].key, '2026-01');
    assert.equal(result.monthlyActions.at(-1)?.key, '2026-12');
    assert.deepEqual(result.pendingActions.map((action) => action.id_accion), ['a2']);
  });
  test('valida filtros de pais y propiedades adicionales', () => {
    assert.equal(parseInsightFilters(new URL(`http://local/v1/dashboard?id_pais=${countryA}`)).countryId, countryA);
    assert.deepEqual(parseInsightFilters(new URL(`http://local/v1/dashboard?id_pais=${countryA}&anio=2026`)), { countryId: countryA, year: 2026 });
    assert.equal(parseInsightFilters(new URL('http://local/v1/dashboard?anio=2025')).year, 2025);
    assert.throws(() => parseInsightFilters(new URL('http://local/v1/dashboard?id_pais=invalido')), /UUID/);
    assert.throws(() => parseInsightFilters(new URL('http://local/v1/dashboard?anio=20x6')), /año/);
    assert.throws(() => parseInsightFilters(new URL('http://local/v1/dashboard?otro=1')), /no/);
  });
  test('prepara una salida externa agregada sin identificadores ni datos restringidos', () => {
    const snapshot = buildSnapshot(raw, { countryId: countryA }, new Date('2026-10-01T12:00:00.000Z'));
    const report = prepareReport(snapshot, { destination: 'externo', filters: { countryId: countryA } });
    assert.equal(report.destination, 'externo');
    assert.equal(report.privacyProfile, 'agregado_hu22');
    assert.equal(report.scope, 'pais_filtrado');
    assert.equal('countries' in report, false);
    assert.equal('selectedCountryId' in report, false);
    assert.equal('organizations' in report, false);
    assert.equal('id_organizacion' in report, false);
    assert.deepEqual(report.metrics, { organizations: 1, activePlans: 1, beneficiaries: 10, activeAlerts: 1 });
  });
  test('valida el destino del reporte antes de preparar la exportacion', () => {
    assert.deepEqual(
      parseReportRequest(new URL(`http://local/v1/reports/overview?destino=donante&id_pais=${countryA}`)),
      { destination: 'donante', filters: { countryId: countryA } },
    );
    assert.throws(() => parseReportRequest(new URL('http://local/v1/reports/overview?destino=publico')), /destino/);
    assert.throws(() => parseReportRequest(new URL('http://local/v1/reports/overview?token=secreto')), /no/);
  });
});
