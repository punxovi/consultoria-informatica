import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createAuditApplication } from '../src/application/audit-service.ts';
import { AuditError, parseAuditQuery } from '../src/domain/audit.ts';
import { createSupabaseAuditRepository } from '../src/infrastructure/supabase-audit.repository.ts';
import { createOrganizationsServer } from '../src/server.ts';

const event = {
  id: '12', usuario: 'Administradora QA', rol: 'ADMIN', fecha_hora: '2026-10-31T12:00:00.000Z',
  pais: 'Chile', ip: '127.0.0.1', operacion: 'UPDATE', entidad: 'organizaciones', referencia: 'id_organizacion: qa',
};

test('consulta auditoría: valida tipos, rango y cursor opaco', () => {
  const filters = parseAuditQuery(new URLSearchParams({ usuario: 'Ana', desde: '2026-10-01', hasta: '2026-10-31', limit: '50' }));
  assert.equal(filters.usuario, 'Ana');
  assert.equal(filters.limit, 50);
  assert.throws(() => parseAuditQuery(new URLSearchParams({ desde: '2026-10-31', hasta: '2026-10-01' })),
    error => error instanceof AuditError && error.fields?.hasta?.length === 1);
  assert.throws(() => parseAuditQuery(new URLSearchParams({ extra: 'no' })),
    error => error instanceof AuditError && error.status === 400);
  assert.throws(() => parseAuditQuery(new URLSearchParams({ cursor: 'invalido' })),
    error => error instanceof AuditError && error.fields?.cursor?.length === 1);
});

test('repositorio auditoría: conserva los datos para describir el evento en lenguaje claro', async () => {
  const claro = { ...event, correo: 'admin@fge.test', nombre_usuario: 'Administradora QA', nombre_registro: 'Cooperativa QA',
    campos_modificados: ['telefono'], cambio_estado: null, accion_especial: null };
  const repository = createSupabaseAuditRepository({
    url: 'https://project.example', anonKey: 'public-key',
    fetchImpl: async () => Response.json({ events: [claro], next_cursor: null }),
  });
  assert.deepEqual((await repository.list('jwt', { limit: 50 })).events, [claro]);
});

test('repositorio auditoría: usa RPC, JWT y cursor estable', async () => {
  let call: { url: string; init?: RequestInit } | undefined;
  const repository = createSupabaseAuditRepository({
    url: 'https://project.example/', anonKey: 'public-key',
    fetchImpl: async (url, init) => {
      call = { url: String(url), init };
      return Response.json({ events: [event], next_cursor: { fecha_hora: event.fecha_hora, id: event.id } });
    },
  });
  const page = await repository.list('jwt-qa', { usuario: 'Ana', limit: 50 });
  assert.equal(call?.url, 'https://project.example/rest/v1/rpc/consultar_eventos_auditoria');
  assert.equal(new Headers(call?.init?.headers).get('authorization'), 'Bearer jwt-qa');
  assert.deepEqual(JSON.parse(String(call?.init?.body)), { p_filtros: {
    usuario: 'Ana', pais: null, desde: null, hasta: null, operacion: null, entidad: null,
    limit: 50, cursor_fecha: null, cursor_id: null,
  } });
  assert.deepEqual(page.events, [event]);
  assert.ok(page.nextCursor);

  const denied = createSupabaseAuditRepository({
    url: 'https://project.example', anonKey: 'public-key',
    fetchImpl: async () => Response.json({ code: '42501' }, { status: 403 }),
  });
  await assert.rejects(denied.list('jwt', { limit: 50 }), error =>
    error instanceof AuditError && error.code === 'SIN_PERMISO' && error.status === 403);
});

let server: Server;
let baseUrl: string;
const application = createAuditApplication({
  async list(token, filters) {
    if (token !== 'admin') throw new AuditError('SIN_PERMISO', 'Sin permiso.', 403);
    if (filters.entidad === 'invalida') throw new AuditError('DATOS_INVALIDOS', 'Filtro inválido.', 400, { entidad: ['La entidad no se puede consultar.'] });
    return { events: [event], nextCursor: null };
  },
});

before(async () => {
  server = createOrganizationsServer(undefined, undefined, undefined, application);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>(resolve => server.close(() => resolve())));

describe('ruta HTTP de auditoría', () => {
  test('protege sesión y devuelve el sobre común sin datos internos', async () => {
    const unauthenticated = await fetch(`${baseUrl}/v1/audit/events`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, 'SESION_REQUERIDA');

    const response = await fetch(`${baseUrl}/v1/audit/events?usuario=Ana&limit=50`, {
      headers: { authorization: 'Bearer admin' },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.code, 'AUDITORIA_CONSULTADA');
    assert.deepEqual(body.data.events, [event]);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  test('rechaza método y comunica los filtros inválidos por campo', async () => {
    const method = await fetch(`${baseUrl}/v1/audit/events`, {
      method: 'POST', headers: { authorization: 'Bearer admin' },
    });
    assert.equal(method.status, 405);

    const invalid = await fetch(`${baseUrl}/v1/audit/events?entidad=invalida&limit=50`, {
      headers: { authorization: 'Bearer admin' },
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.fields.entidad[0], 'La entidad no se puede consultar.');
  });
});
