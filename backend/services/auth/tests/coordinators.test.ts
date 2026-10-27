import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { createCoordinatorApplication } from '../src/application/coordinators-service.ts';
import { CoordinatorError, parseCoordinatorCreate, parseCoordinatorEdit, parseCoordinatorVersion, type CoordinatorRepository } from '../src/domain/coordinators.ts';
import { createSupabaseCoordinatorRepository } from '../src/infrastructure/supabase-coordinators.repository.ts';
import { createAuthServer } from '../src/server.ts';
import { createGatewayServer } from '../../../gateway/src/server.ts';

const id = '14500000-0000-4000-8000-000000000001';
const country = '14500000-0000-4000-8000-000000000002';
const input = { nombre: ' Persona ', correo: ' QA@EXAMPLE.INVALID ', id_pais: country };
test('coordinadores: normaliza alta y rechaza país ausente, tipos, extras y versiones inválidas', () => {
  assert.deepEqual(parseCoordinatorCreate(input), { nombre: 'Persona', correo: 'qa@example.invalid', id_pais: country });
  for (const bad of [null, {}, { ...input, id_pais: null }, { ...input, id_pais: 'inexistente' }, { ...input, nombre: '' }, { ...input, correo: 'mal' }, { ...input, activo: true }]) assert.throws(() => parseCoordinatorCreate(bad));
  assert.throws(() => parseCoordinatorCreate({ nombre: 'Nombre', correo: 'qa@example.invalid' }), e => e instanceof CoordinatorError && e.code === 'PAIS_PRINCIPAL_INVALIDO' && Boolean(e.fields?.id_pais));
  for (const version of [0, -1, 1.1, '1', null, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseCoordinatorVersion({ version_esperada: version }));
  for (const cambios of [{}, { correo: 'otro@example.invalid' }, { activo: false }, { id_pais: null }, { nombre: 'a\n' }]) assert.throws(() => parseCoordinatorEdit({ version_esperada: 1, cambios }));
  assert.deepEqual(parseCoordinatorEdit({ version_esperada: 2, cambios: { id_pais: country } }), { version_esperada: 2, cambios: { id_pais: country } });
});

test('coordinadores: creación recuperable, sin duplicar identidad y con fallo de correo identificable', async () => {
  let provisioned = 0;
  const repo: CoordinatorRepository = {
    assertProvisioningConfigured() {},
    async execute(_t, op) { return op === 'prepare' ? { id_solicitud: id, id_usuario: provisioned ? id : null } : { id_usuario: id }; },
    async provision() { provisioned++; return id; },
    async sendAccess() { return false; },
  };
  const app = createCoordinatorApplication(repo);
  assert.equal((await app.create('admin', parseCoordinatorCreate(input))).acceso, 'recuperacion_pendiente');
  await app.create('admin', parseCoordinatorCreate(input));
  assert.equal(provisioned, 1);
});

test('coordinadores: RPC usa JWT del actor y Auth Admin solo usa credencial del servidor', async () => {
  const calls: Array<{ url: string; headers: Headers; body: any }> = [];
  const repo = createSupabaseCoordinatorRepository({ url: 'https://project.example', anonKey: 'public-test-key', adminKey: 'private-test-key', redirectUrl: 'http://localhost/password', fetchImpl: async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(String(url).includes('/admin/users') ? { id } : { authorized: true }), { status: 200 });
  } });
  await repo.execute('actor-token', 'authorize', {});
  await repo.provision(parseCoordinatorCreate(input), id);
  await repo.sendAccess('qa@example.invalid');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer actor-token');
  assert.equal(calls[0].headers.get('apikey'), 'public-test-key');
  assert.equal(calls[1].headers.get('authorization'), 'Bearer private-test-key');
  assert.equal(calls[1].body.app_metadata.fge_coordinator_request, id);
  assert.ok(calls[1].body.password.length >= 48);
  assert.equal(calls[2].headers.get('apikey'), 'public-test-key');
  assert.ok(calls[2].url.includes('/recover?redirect_to='));
});

test('coordinadores: errores remotos consistentes, sin revelar detalles sensibles', async () => {
  for (const [provider, status, code] of [['P0145', 400, 'PAIS_PRINCIPAL_INVALIDO'], ['P0146', 404, 'COORDINADOR_NO_ENCONTRADO'], ['P0147', 409, 'CONFLICTO_VERSION'], ['P0148', 409, 'CORREO_EN_USO'], ['PGRST202', 503, 'MIGRACION_COORDINADORES_PENDIENTE']]) {
    const repo = createSupabaseCoordinatorRepository({ url: 'https://project.example', anonKey: 'key', redirectUrl: '', fetchImpl: async () => new Response(JSON.stringify({ code: provider, message: 'sensitive' }), { status: 400 }) });
    await assert.rejects(repo.execute('token', 'list', {}), e => e instanceof CoordinatorError && e.code === code && e.status === status && !JSON.stringify(e).includes('sensitive'));
  }
  const missing = createSupabaseCoordinatorRepository({ url: '', anonKey: '', redirectUrl: '' });
  assert.throws(() => missing.assertProvisioningConfigured(), e => e instanceof CoordinatorError && e.code === 'CONFIGURACION_CUENTAS');
});

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return `http://127.0.0.1:${address.port}`;
};
test('coordinadores HTTP por Gateway: seis operaciones, errores y autorización antes de modificar', async () => {
  let c = { id_usuario: id, nombre: 'Persona', correo: 'qa@example.invalid', id_pais: country, activo: true, version: 1 };
  let mutations = 0;
  const repo: CoordinatorRepository = {
    assertProvisioningConfigured() {},
    async provision() { return id; },
    async sendAccess() { return true; },
    async execute(token, op, data) {
      if (token !== 'admin') throw new CoordinatorError('SIN_PERMISO', 'Sin permiso.', 403);
      if (op === 'authorize') return { authorized: true };
      if (op === 'prepare') return { id_solicitud: id };
      if (op === 'list') return [c];
      if (data.id_usuario !== id) throw new CoordinatorError('COORDINADOR_NO_ENCONTRADO', 'No existe.', 404);
      if (op === 'get') return c;
      if (data.version_esperada !== c.version) throw new CoordinatorError('CONFLICTO_VERSION', 'Recarga.', 409);
      mutations++;
      c = { ...c, ...(data.cambios as object ?? {}), activo: op === 'deactivate' ? false : op === 'activate' ? true : c.activo, version: c.version + 1 };
      return c;
    },
  };
  const auth = createAuthServer({ coordinators: createCoordinatorApplication(repo) });
  const authUrl = await listen(auth);
  const gateway = createGatewayServer({ targets: { auth: new URL(authUrl) } });
  const base = await listen(gateway);
  async function request(path = '', method = 'GET', body?: unknown, token = 'admin') {
    const response = await fetch(`${base}/api/v1/coordinators${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  try {
    assert.equal((await request('', 'GET', undefined, '')).status, 401);
    assert.equal((await request('', 'POST', input, 'coord')).status, 403);
    assert.equal(mutations, 0);
    const created = await request('', 'POST', input);
    assert.equal(created.status, 201); assert.equal(created.body.data.coordinator.id_usuario, id);
    assert.equal((await request()).body.data.coordinators.length, 1);
    assert.equal((await request(`/${id}`)).cache, 'no-store');
    const bad = await request('', 'POST', { nombre: 'Nombre', correo: 'qa@example.invalid' });
    assert.equal(bad.status, 400); assert.ok(bad.body.error.fields.id_pais);
    assert.equal((await request('/14500000-0000-4000-8000-000000000099')).status, 404);
    assert.equal((await request(`/${id}`, 'PATCH', { version_esperada: 2, cambios: { nombre: 'Nuevo' } })).status, 409);
    assert.equal((await request(`/${id}`, 'PATCH', { version_esperada: 1, cambios: { nombre: 'Nuevo' } })).body.data.coordinator.nombre, 'Nuevo');
    assert.equal((await request(`/${id}/deactivate`, 'POST', { version_esperada: 2 })).body.data.coordinator.activo, false);
    assert.equal((await request(`/${id}/activate`, 'POST', { version_esperada: 3 })).body.data.coordinator.activo, true);
    assert.equal((await request(`/${id}`, 'DELETE')).status, 405);
    assert.equal((await request('?rol=ADMIN')).status, 400);
  } finally {
    await new Promise<void>(resolve => gateway.close(() => resolve()));
    await new Promise<void>(resolve => auth.close(() => resolve()));
  }
});
