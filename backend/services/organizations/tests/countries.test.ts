import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { createCountriesApplication } from '../src/application/countries-service.ts';
import { CountryError, parseCountryCreate, parseCountryUpdate, parseCountryId } from '../src/domain/countries.ts';
import { createSupabaseCountriesRepository } from '../src/infrastructure/supabase-countries.repository.ts';
import { createOrganizationsServer } from '../src/server.ts';
import { createGatewayServer } from '../../../gateway/src/server.ts';

const id = '14900000-0000-4000-8000-000000000001';
const data = { nombre: ' Chile ', codigo_iso: 'cl', codigo_area_telefonica: '+56', zona_horaria: 'America/Santiago' };

test('países: alta exige campos, normaliza texto y valida prefijo y zona IANA', () => {
  assert.deepEqual(parseCountryCreate(data), { ...data, nombre: 'Chile', codigo_iso: 'CL' });
  for (const field of Object.keys(data)) {
    const bad: Record<string, unknown> = { ...data }; delete bad[field];
    assert.throws(() => parseCountryCreate(bad), error => error instanceof CountryError && Boolean(error.fields?.[field]));
  }
  for (const bad of [null, [], {}, { ...data, nombre: '' }, { ...data, nombre: 'A\u0001B' }, { ...data, nombre: 'x'.repeat(121) },
    { ...data, codigo_iso: 'CHL' }, { ...data, codigo_area_telefonica: 56 }, { ...data, codigo_area_telefonica: '56' },
    { ...data, codigo_area_telefonica: '+056' }, { ...data, codigo_area_telefonica: '+1234' },
    { ...data, zona_horaria: 'America/NoExiste' }, { ...data, zona_horaria: '-03:00' }, { ...data, zona_horaria: 'CST' },
    { ...data, id_pais: id }, { ...data, parent_id: id }]) assert.throws(() => parseCountryCreate(bad));
  assert.equal(parseCountryCreate({ ...data, zona_horaria: 'UTC' }).zona_horaria, 'UTC');
});

test('países: edición parcial con versión segura, sin cambios de identificador ni archivo', () => {
  assert.deepEqual(parseCountryUpdate({ version_esperada: 1, cambios: { nombre: ' Nuevo ' } }), { version_esperada: 1, cambios: { nombre: 'Nuevo' } });
  for (const version of [0, -1, 1.2, '1', null, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseCountryUpdate({ version_esperada: version, cambios: { nombre: 'Nuevo' } }));
  for (const cambios of [{}, { id_pais: id }, { archived_at: null }, { codigo_area_telefonica: null }, { zona_horaria: false }]) assert.throws(() => parseCountryUpdate({ version_esperada: 1, cambios }));
  assert.equal(parseCountryId(id), id);
  assert.throws(() => parseCountryId('no-uuid'));
});

test('países: persistencia usa clave pública y JWT, controla errores sin filtrar detalles', async () => {
  let calls = 0;
  const repo = createSupabaseCountriesRepository({ url: 'https://project.example/', anonKey: 'public-key', fetchImpl: async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://project.example/rest/v1/rpc/administrar_paises');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), 'public-key'); assert.equal(headers.get('authorization'), 'Bearer actor-token');
    assert.deepEqual(JSON.parse(String(init?.body)), { p_operacion: 'authorize', p_datos: {} });
    return new Response(JSON.stringify({ authorized: true }));
  } });
  await repo.execute('actor-token', 'authorize', {}); assert.equal(calls, 1);
  for (const [provider, status, code] of [['42501',403,'SIN_PERMISO'], ['P0149',404,'PAIS_NO_ENCONTRADO'], ['P0150',409,'CONFLICTO_VERSION'], ['23505',409,'PAIS_DUPLICADO'], ['P0151',400,'ZONA_HORARIA_INVALIDA'], ['PGRST202',503,'MIGRACION_PAISES_PENDIENTE']]) {
    const failing = createSupabaseCountriesRepository({ url: 'https://project.example', anonKey: 'key', fetchImpl: async () => new Response(JSON.stringify({ code: provider, message: 'private-provider-details' }), { status: 400 }) });
    await assert.rejects(failing.execute('token', 'list', {}), error => error instanceof CountryError && error.code === code && error.status === status && !JSON.stringify(error).includes('private-provider-details'));
  }
});

test('países: red, JSON inválido, sesión y respuestas inconsistentes son errores controlados', async () => {
  const options = { url: 'https://project.example', anonKey: 'key' };
  for (const [fetchImpl, code] of [
    [async () => { throw new Error('network'); }, 'PAISES_NO_DISPONIBLES'],
    [async () => new Response('bad-json'), 'RESPUESTA_INVALIDA'],
    [async () => new Response('{}', { status: 401 }), 'SESION_INVALIDA'],
    [async () => new Response('{}'), 'RESPUESTA_INVALIDA'],
  ] as const) await assert.rejects(createSupabaseCountriesRepository({ ...options, fetchImpl }).execute('token', 'list', {}), error => error instanceof CountryError && error.code === code);
  await assert.rejects(createSupabaseCountriesRepository({ url: '', anonKey: '' }).execute('token', 'list', {}), error => error instanceof CountryError && error.code === 'CONFIGURACION_SUPABASE');
});

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return `http://127.0.0.1:${address.port}`;
};
test('países HTTP por Gateway: cuatro operaciones, permisos y errores del contrato', async () => {
  let country = { ...parseCountryCreate(data), id_pais: id, version: 1 };
  let mutations = 0;
  const app = createCountriesApplication({ async execute(token, op, input) {
    if (token !== 'admin') throw new CountryError('SIN_PERMISO', 'Administrador requerido.', 403);
    if (op === 'authorize') return { authorized: true };
    if (op === 'list') return [country];
    if (op === 'create') { mutations++; return country; }
    if (input.id_pais !== id) throw new CountryError('PAIS_NO_ENCONTRADO', 'No existe.', 404);
    if (op === 'get') return country;
    if (input.version_esperada !== country.version) throw new CountryError('CONFLICTO_VERSION', 'Recarga.', 409);
    mutations++;
    country = { ...country, ...(input.cambios as object), version: country.version + 1 };
    return country;
  } });
  const service = createOrganizationsServer(undefined, app);
  const serviceUrl = await listen(service);
  const gateway = createGatewayServer({ targets: { organizations: new URL(serviceUrl) } });
  const base = await listen(gateway);
  async function request(path = '', method = 'GET', body?: unknown, token = 'admin') {
    const response = await fetch(`${base}/api/v1/countries${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  try {
    assert.equal((await request('', 'GET', undefined, '')).status, 401);
    for (const [path, method, body] of [['','GET',undefined], [`/${id}`,'GET',undefined], ['','POST',data], [`/${id}`,'PATCH',{ version_esperada: 1, cambios: { nombre: 'No' } }]] as const) {
      assert.equal((await request(path, method, body, 'coord')).status, 403);
    }
    assert.equal(mutations, 0);
    assert.equal((await request()).body.data.countries.length, 1);
    assert.equal((await request(`/${id}`)).cache, 'no-store');
    const created = await request('', 'POST', data);
    assert.equal(created.status, 201); assert.equal(created.body.data.country.id_pais, id);
    const invalid = await request('', 'POST', { nombre: 'Nombre', codigo_iso: 'CL' });
    assert.equal(invalid.status, 400); assert.ok(invalid.body.error.fields.codigo_area_telefonica); assert.ok(invalid.body.error.fields.zona_horaria);
    assert.equal((await request('/invalido')).status, 400);
    assert.equal((await request('/14900000-0000-4000-8000-000000000099')).status, 404);
    assert.equal((await request(`/${id}`, 'PATCH', { version_esperada: 2, cambios: { nombre: 'Nuevo' } })).status, 409);
    const updated = await request(`/${id}`, 'PATCH', { version_esperada: 1, cambios: { nombre: 'Nuevo' } });
    assert.equal(updated.body.data.country.nombre, 'Nuevo'); assert.equal(updated.body.data.country.id_pais, id);
    assert.equal((await request(`/${id}`, 'DELETE')).status, 405);
    assert.equal((await request('?rol=ADMIN')).status, 400);
  } finally {
    await new Promise<void>(resolve => gateway.close(() => resolve()));
    await new Promise<void>(resolve => service.close(() => resolve()));
  }
});
