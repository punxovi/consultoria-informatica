import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createCoveragesApplication } from '../src/application/coverages-service.ts';
import { createOrganizationsServer } from '../src/server.ts';
import { createSupabaseCoveragesRepository } from '../src/infrastructure/supabase-coverages.repository.ts';
import { CoverageError } from '../src/domain/coverages-api.ts';

const coverage = {
  id_permiso_temporal: '11111111-1111-4111-8111-111111111111',
  id_usuario_beneficiario: '22222222-2222-4222-8222-222222222222',
  coordinador_nombre: 'Coordinadora QA',
  id_pais: '33333333-3333-4333-8333-333333333333',
  pais_nombre: 'Chile',
  motivo: 'Cobertura de prueba',
  inicio_at: '2026-11-01T03:00:00.000Z',
  fin_at: '2026-11-10T03:00:00.000Z',
  revocado_at: null,
  version: 1,
  condicion: 'vigente',
  puede_extender: true,
  puede_revocar: true,
};

test('repositorio de coberturas: usa RPC, JWT y traduce la autorización', async () => {
  let llamada: { url: string; init?: RequestInit } | undefined;
  const repository = createSupabaseCoveragesRepository({
    url: 'https://project.example/',
    anonKey: 'public-key',
    fetchImpl: async (url, init) => {
      llamada = { url: String(url), init };
      return Response.json([coverage]);
    },
  });
  assert.deepEqual(await repository.execute('jwt-qa', 'list', {}), [coverage]);
  assert.equal(llamada?.url, 'https://project.example/rest/v1/rpc/administrar_coberturas');
  assert.equal(new Headers(llamada?.init?.headers).get('authorization'), 'Bearer jwt-qa');
  assert.deepEqual(JSON.parse(String(llamada?.init?.body)), { p_operacion: 'list', p_datos: {} });

  const denegado = createSupabaseCoveragesRepository({
    url: 'https://project.example', anonKey: 'public-key',
    fetchImpl: async () => Response.json({ code: '42501' }, { status: 403 }),
  });
  await assert.rejects(denegado.execute('jwt', 'list', {}), (error) =>
    error instanceof CoverageError && error.code === 'SIN_PERMISO' && error.status === 403);
});

let server: Server;
let baseUrl: string;
const app = createCoveragesApplication({
  async execute(_token, operation, input) {
    if (operation === 'list') return [coverage];
    if (operation === 'mine') return [{
      id_permiso_temporal: coverage.id_permiso_temporal,
      id_pais: coverage.id_pais,
      inicio_at: coverage.inicio_at,
      fin_at: coverage.fin_at,
    }];
    return { ...coverage, version: Number(input.version_esperada ?? 1) + (operation === 'create' ? 0 : 1) };
  },
});

before(async () => {
  server = createOrganizationsServer(undefined, undefined, app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

describe('rutas HTTP de coberturas', () => {
  const headers = { authorization: 'Bearer sesion-qa', 'content-type': 'application/json' };

  test('exige sesión y conserva el sobre de respuesta del servicio', async () => {
    const sinSesion = await fetch(`${baseUrl}/v1/organizations/temporary-coverages`);
    assert.equal(sinSesion.status, 401);
    assert.equal((await sinSesion.json()).error.code, 'SESION_REQUERIDA');

    const listado = await fetch(`${baseUrl}/v1/organizations/temporary-coverages`, { headers });
    assert.equal(listado.status, 200);
    const body = await listado.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.coverages, [coverage]);
  });

  test('valida, crea, extiende, revoca y limita /mine al contrato correspondiente', async () => {
    const invalida = await fetch(`${baseUrl}/v1/organizations/temporary-coverages`, {
      method: 'POST', headers, body: JSON.stringify({}),
    });
    assert.equal(invalida.status, 400);
    assert.equal((await invalida.json()).error.code, 'DATOS_INVALIDOS');

    const creada = await fetch(`${baseUrl}/v1/organizations/temporary-coverages`, {
      method: 'POST', headers,
      body: JSON.stringify({
        id_usuario_beneficiario: coverage.id_usuario_beneficiario,
        id_pais: coverage.id_pais,
        inicio_at: '2026-11-01', fin_at: '2026-11-10', motivo: coverage.motivo,
      }),
    });
    assert.equal(creada.status, 201);
    assert.equal((await creada.json()).data.coverage.id_permiso_temporal, coverage.id_permiso_temporal);

    const extendida = await fetch(`${baseUrl}/v1/organizations/temporary-coverages/${coverage.id_permiso_temporal}/extend`, {
      method: 'PATCH', headers, body: JSON.stringify({ version_esperada: 1, nueva_fin_at: '2026-11-15' }),
    });
    assert.equal(extendida.status, 200);
    assert.equal((await extendida.json()).code, 'COBERTURA_EXTENDIDA');

    const revocada = await fetch(`${baseUrl}/v1/organizations/temporary-coverages/${coverage.id_permiso_temporal}/revoke`, {
      method: 'PATCH', headers, body: JSON.stringify({ version_esperada: 1, motivo_revocacion: 'Cambio de planificación' }),
    });
    assert.equal(revocada.status, 200);
    assert.equal((await revocada.json()).code, 'COBERTURA_REVOCADA');

    const propias = await fetch(`${baseUrl}/v1/organizations/temporary-coverages/mine`, { headers });
    assert.equal(propias.status, 200);
    assert.equal((await propias.json()).data.coverages[0].id_pais, coverage.id_pais);
  });
});
