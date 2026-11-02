import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInsightsApplication } from '../src/application/insights-service.ts';
import type { RawInsights, ReportAudit } from '../src/domain/insights.ts';

const raw: RawInsights = {
  countries: [{ id_pais: '11111111-1111-4111-8111-111111111111', codigo_iso: 'CL', nombre: 'Chile' }],
  organizations: [{ id_organizacion: 'org-1', id_pais: '11111111-1111-4111-8111-111111111111', numero_beneficiarios: 7 }],
  plans: [{ id_plan: 'plan-1', id_organizacion: 'org-1', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31' }],
  actions: [{ id_accion: 'action-1', id_plan: 'plan-1', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', estado: 'cumplida' }],
};

test('prepara reportes externos antes de entregarlos y audita destino/filtros', async () => {
  const audits: ReportAudit[] = [];
  const application = createInsightsApplication({
    async load() { return raw; },
    async auditExport(_token, audit) { audits.push(audit); },
  }, () => new Date('2026-10-19T12:00:00.000Z'));

  const report = await application.reportOverview('jwt', {}, 'donante');
  assert.equal(report.destination, 'donante');
  assert.equal(report.privacyProfile, 'agregado_hu22');
  assert.equal('organizations' in report, false);
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0], { destination: 'donante', filters: { countryId: null } });
});

test('no entrega el reporte si la auditoria no puede registrarse', async () => {
  const application = createInsightsApplication({
    async load() { return raw; },
    async auditExport() { throw new Error('auditoria no disponible'); },
  });
  await assert.rejects(application.reportOverview('jwt', {}, 'externo'), /auditoria no disponible/);
});
