import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteDiagnostico } from '../../src/lib/diagnostico-organizacion/cliente.ts';
import { camposDiagnosticoSchema } from '../../src/lib/diagnostico-organizacion/modelo.ts';
import { crearDiagnosticoZodSchema, actualizarDiagnosticoZodSchema } from '../../../backend/services/organizations/src/domain/diagnosticos.schema.ts';

const id = '17600000-0000-4000-8000-000000000001';
const campos = {
  mision: 'Comunidad', vision: 'Bienestar', tiene_espacio_fisico: false,
  caracteristicas_infraestructura: 'Sin sede', espacios_disponibles: 'Espacio compartido',
  recursos_existentes: 'Materiales', danos_detectados: 'Sin daños', necesidades_prioritarias: 'Sede',
  observaciones: 'Visita', raciones: null, periodo_raciones: null,
};
const registro = { ...campos, id_organizacion: id, id_diagnostico: id, fecha_diagnostico: '2026-10-09',
  created_at: '2026-10-09T12:00:00+00:00', updated_at: '2026-10-09T12:00:00+00:00', version: 1 };

test('frontend y backend aceptan el mismo diagnóstico y rechazan campos inválidos', () => {
  for (const schema of [camposDiagnosticoSchema, crearDiagnosticoZodSchema]) {
    assert.equal(schema.parse({ ...campos, mision: '  Comunidad  ' }).mision, 'Comunidad');
    assert.equal(schema.safeParse({ ...campos, raciones: 0, periodo_raciones: 'diaria' }).success, true);
    for (const cambios of [
      { mision: '' }, { vision: 'x'.repeat(501) }, { observaciones: 'x'.repeat(1001) },
      { raciones: -1 }, { raciones: 1.5 }, { raciones: 2147483648 }, { raciones: '3' },
      { raciones: 3 }, { periodo_raciones: 'mensual' }, { tiene_espacio_fisico: 'si' },
      { titulo: 'Obsoleto' }, { id_organizacion: id },
    ]) assert.equal(schema.safeParse({ ...campos, ...cambios }).success, false, JSON.stringify(cambios));
  }
  for (const version_esperada of [undefined, 0, -1, 1.5, '1']) {
    assert.equal(actualizarDiagnosticoZodSchema.safeParse({ version_esperada, cambios: campos }).success, false);
  }
});

test('el cliente exige respuestas completas y pertenecientes a la organización consultada', async () => {
  for (const data of [undefined, {}, { diagnosticos: null }, { diagnosticos: [registro, registro] },
    { diagnosticos: [{ ...registro, id_organizacion: 'otra' }] },
    { diagnosticos: [{ ...registro, version: 0 }] },
    { diagnosticos: [{ ...registro, mision: null }] },
    { diagnosticos: [{ ...registro, fecha_diagnostico: 'ayer' }] },
  ]) {
    const cliente = crearClienteDiagnostico({ request: async () => ({ ok: true, data }) }, async () => 'token');
    await assert.rejects(cliente.obtener(id), { code: 'RESPUESTA_INVALIDA' });
  }
  const cliente = crearClienteDiagnostico({ request: async () => ({ ok: true, data: { diagnosticos: [registro] } }) }, async () => 'token');
  assert.equal((await cliente.obtener(id)).mision, campos.mision);
});

test('sin sesión el cliente no envía solicitudes ni guarda un diagnóstico', async () => {
  let solicitudes = 0;
  const cliente = crearClienteDiagnostico({ request: async () => { solicitudes++; } }, async () => { throw new Error('Sesión expirada'); });
  await assert.rejects(cliente.obtener(id), /Sesión expirada/);
  await assert.rejects(cliente.crear(id, { campos }), /Sesión expirada/);
  await assert.rejects(cliente.actualizar(id, id, 1, { campos }), /Sesión expirada/);
  assert.equal(solicitudes, 0);
});
