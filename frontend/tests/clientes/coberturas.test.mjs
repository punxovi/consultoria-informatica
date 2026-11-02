import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../src/lib/api/transporte.ts';
import { crearClienteCoberturas, mensajeErrorCoberturas } from '../../src/lib/coberturas/cliente.ts';

const coverage = {
  id_permiso_temporal: '11111111-1111-4111-8111-111111111111',
  id_usuario_beneficiario: '22222222-2222-4222-8222-222222222222',
  coordinador_nombre: 'Coordinadora QA',
  id_pais: '33333333-3333-4333-8333-333333333333',
  pais_nombre: 'Chile', motivo: 'Cobertura de prueba',
  inicio_at: '2026-11-01T03:00:00.000Z', fin_at: '2026-11-10T03:00:00.000Z',
  revocado_at: null, version: 1, condicion: 'vigente', puede_extender: true, puede_revocar: true,
};
const ok = (data, status = 200) => Response.json({ ok: true, code: 'OK', message: 'ok', data }, { status });

function clienteCon(respuestas) {
  const llamadas = [];
  const cliente = crearClienteCoberturas('http://gateway.test/', async () => 'token-admin', async (url, init) => {
    llamadas.push({ url, init });
    return respuestas.shift();
  });
  return { cliente, llamadas };
}

test('Coberturas: listado y operaciones usan HTTP, Gateway, Bearer y versión esperada', async () => {
  const { cliente, llamadas } = clienteCon([
    ok({ coverages: [coverage] }), ok({ coverage }, 201), ok({ coverage: { ...coverage, version: 2 } }), ok({ coverage: { ...coverage, version: 3, revocado_at: '2026-11-05T12:00:00.000Z', condicion: 'revocada', puede_extender: false, puede_revocar: false } }),
  ]);
  assert.equal((await cliente.listar())[0].puedeExtender, true);
  await cliente.crear({ id_usuario_beneficiario: coverage.id_usuario_beneficiario, id_pais: coverage.id_pais, motivo: coverage.motivo, fecha_inicio: '2026-11-01', fecha_termino: '2026-11-10' });
  await cliente.extender(coverage.id_permiso_temporal, 1, '2026-11-15');
  await cliente.revocar(coverage.id_permiso_temporal, 2, 'Cambio de planificación');
  assert.equal(llamadas[0].url, 'http://gateway.test/api/v1/organizations/temporary-coverages');
  assert.equal(new Headers(llamadas[0].init.headers).get('authorization'), 'Bearer token-admin');
  assert.deepEqual(JSON.parse(String(llamadas[1].init.body)), {
    id_usuario_beneficiario: coverage.id_usuario_beneficiario, id_pais: coverage.id_pais,
    inicio_at: '2026-11-01', fin_at: '2026-11-10', motivo: coverage.motivo,
  });
  assert.deepEqual(JSON.parse(String(llamadas[2].init.body)), { version_esperada: 1, nueva_fin_at: '2026-11-15' });
  assert.deepEqual(JSON.parse(String(llamadas[3].init.body)), { version_esperada: 2, motivo_revocacion: 'Cambio de planificación' });
});

test('Coberturas: rechaza respuestas inválidas y muestra errores utilizables', async () => {
  const { cliente } = clienteCon([ok({ coverages: [{ ...coverage, puede_extender: 'sí' }] })]);
  await assert.rejects(cliente.listar(), (error) => error instanceof ApiError && error.code === 'RESPUESTA_INVALIDA');
  assert.match(mensajeErrorCoberturas(new ApiError('ERROR', 'x', 401), 'guardar'), /sesión expiró/i);
  assert.match(mensajeErrorCoberturas(new ApiError('ERROR', 'x', 403), 'guardar'), /Administrador/i);
  assert.match(mensajeErrorCoberturas(new ApiError('MIGRACION_COBERTURAS_PENDIENTE', 'x', 503), 'guardar'), /migración pendiente/i);
});
