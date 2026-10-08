import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createMeetingMinuteSchema,
  parseCreateMeetingMinute,
  parseMeetingMinuteFilters,
  parseUpdateMeetingMinute,
  updateMeetingMinuteSchema,
} from '../src/domain/meeting-minutes.ts';

const orgId = '11111111-1111-4111-8111-111111111111';
const planId = '33333333-3333-4333-8333-333333333333';
const actionId = '44444444-4444-4444-8444-444444444444';
const valid = {
  id_organizacion: orgId,
  id_plan: planId,
  id_accion: actionId,
  objetivo: '  Revisar avances del plan  ',
  fecha_reunion: '2026-10-08',
  asistentes: ['Coordinador', 'Representante'],
  asistentes_externos: ' Invitado ',
  observaciones: ' Acuerdos ',
};

describe('schemas Zod de Actas de Reunión', () => {
  test('crea y exporta un schema estricto con normalización', () => {
    assert.equal(createMeetingMinuteSchema.parse(valid).objetivo, 'Revisar avances del plan');
    assert.equal(parseCreateMeetingMinute(valid).asistentes_externos, 'Invitado');
    assert.equal(parseCreateMeetingMinute({ ...valid, id_accion: undefined }).id_accion, null);
    assert.throws(() => parseCreateMeetingMinute({ ...valid, campo_extra: true }), /no reconocidas|Unrecognized|campo/i);
  });

  test('rechaza obligatorios, tipos, formatos y restricciones', () => {
    assert.throws(() => parseCreateMeetingMinute({ ...valid, objetivo: ' ' }), /obligatorio/);
    assert.throws(() => parseCreateMeetingMinute({ ...valid, fecha_reunion: '2026-02-30' }), /fecha válida/);
    assert.throws(() => parseCreateMeetingMinute({ ...valid, asistentes: [] }), /al menos un asistente/);
    assert.throws(() => parseCreateMeetingMinute({ ...valid, asistentes: ['Ana', 'ana'] }), /no pueden repetirse/);
    assert.throws(() => parseCreateMeetingMinute({ ...valid, asistentes_externos: 'J' }), /al menos 3 caracteres/);
    assert.equal(parseCreateMeetingMinute({ ...valid, asistentes_externos: '' }).asistentes_externos, '');
    assert.throws(() => parseCreateMeetingMinute({ ...valid, id_organizacion: 'no-uuid' }), /UUID válido/);
  });

  test('actualiza parcialmente y exige versión positiva', () => {
    assert.equal(updateMeetingMinuteSchema.parse({
      version_esperada: 2, cambios: { observaciones: '' },
    }).cambios.observaciones, null);
    assert.equal(parseUpdateMeetingMinute({
      version_esperada: 3, cambios: { objetivo: 'Editado' },
    }).expectedVersion, 3);
    assert.throws(() => parseUpdateMeetingMinute({ version_esperada: 0, cambios: { objetivo: 'X' } }), /mayor que cero/);
    assert.throws(() => parseUpdateMeetingMinute({ version_esperada: 1, cambios: {} }), /al menos un campo/);
    assert.throws(() => parseUpdateMeetingMinute({
      version_esperada: 1, cambios: { asistentes_externos: 'J' },
    }), /al menos 3 caracteres/);
    assert.throws(() => parseUpdateMeetingMinute({ version_esperada: 1, cambios: { id_organizacion: orgId } }), /no reconocidas|Unrecognized|campo/i);
  });

  test('valida filtros y rechaza parámetros desconocidos', () => {
    const filters = parseMeetingMinuteFilters(new URL(
      `http://local/v1/meeting-minutes?id_organizacion=${orgId}&id_plan=${planId}&incluir_archivadas=true`,
    ));
    assert.equal(filters.organizationId, orgId);
    assert.equal(filters.planId, planId);
    assert.equal(filters.includeArchived, true);
    assert.throws(() => parseMeetingMinuteFilters(new URL('http://local/v1/meeting-minutes?otro=1')), /no está permitido/);
  });
});
