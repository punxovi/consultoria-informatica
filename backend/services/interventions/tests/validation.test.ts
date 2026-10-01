import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseActionFields, parseActionFilters, parseActionUpdate } from '../src/domain/actions.ts';
import { parsePlanFields, parsePlanFilters, parsePlanUpdate } from '../src/domain/plans.ts';

const orgId = '11111111-1111-4111-8111-111111111111';
const programId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const plan = {
  id_organizacion: orgId, id_programa: programId, nombre: 'Plan QA', situacion_necesidad: 'Necesidad',
  objetivo_general: 'Objetivo', objetivos_especificos: 'Objetivos', resultado_esperado: 'Resultado',
  responsable_nombre: 'Responsable', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31',
};
const action = {
  id_plan: planId, nombre: 'Acción QA', responsable_nombre: 'Responsable',
  fecha_inicio: '2026-02-01', fecha_termino: '2026-03-01', resultado_esperado: 'Resultado',
};

describe('validaciones de Planes y Acciones', () => {
  test('valida el plan completo, fechas y actualización', () => {
    assert.equal(parsePlanFields(plan).nombre, 'Plan QA');
    assert.equal(parsePlanUpdate({ cambios: { nombre: 'Editado' }, version_esperada: 2 }).expectedVersion, 2);
    assert.throws(() => parsePlanFields({ ...plan, fecha_termino: '2025-01-01' }), /no puede ser anterior/);
  });
  test('valida filtros estrictos de planes', () => {
    const filters = parsePlanFilters(new URL(`http://local/v1/plans?id_organizacion=${orgId}&incluir_archivados=true`));
    assert.equal(filters.organizationId, orgId);
    assert.equal(filters.includeArchived, true);
    assert.throws(() => parsePlanFilters(new URL('http://local/v1/plans?otro=1')), /no está permitido/);
  });
  test('aplica estado inicial y reglas de cancelación a acciones', () => {
    assert.equal(parseActionFields(action).estado, 'no_iniciada');
    assert.throws(() => parseActionFields({ ...action, estado: 'cancelada' }), /indicar el motivo/);
    assert.equal(parseActionUpdate({ cambios: { estado: 'cumplida' } }).changes.estado, 'cumplida');
  });
  test('valida estado y plan en filtros de acciones', () => {
    const filters = parseActionFilters(new URL(`http://local/v1/actions?id_plan=${planId}&estado=atrasada`));
    assert.equal(filters.planId, planId);
    assert.equal(filters.state, 'atrasada');
    assert.throws(() => parseActionFilters(new URL('http://local/v1/actions?estado=desconocido')), /no es válido/);
  });
});
