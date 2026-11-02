import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseInterventionsRepositories } from '../src/infrastructure/supabase-interventions.repository.ts';

const planId = '33333333-3333-4333-8333-333333333333';
const plan = {
  id_plan: planId, nombre: 'Plan QA', organizacion: { id: '1', id_pais: '2', nombre: 'Org' },
  programa: { id: '3', nombre: 'Programa' },
};
const action = { id_accion: '44444444-4444-4444-8444-444444444444', nombre: 'Acción', plan: { id_plan: planId } };
const orgId = '11111111-1111-4111-8111-111111111111';
const minuteId = '55555555-5555-4555-8555-555555555555';
const minute = {
  id_acta: minuteId, id_organizacion: orgId, id_plan: planId, id_accion: action.id_accion,
  objetivo: 'Revisar avances', fecha_reunion: '2026-10-08T00:00:00Z',
  asistentes: ['Coordinador'], asistentes_externos: '', observaciones: null,
  created_at: '', updated_at: '', created_by: null, updated_by: null, archived_at: null, version: 1,
};

describe('repositorio Supabase de Intervenciones', () => {
  test('consulta Planes y Acciones con relaciones y token', async () => {
    const calls: string[] = [];
    const repositories = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        calls.push(`${String(input)}|${new Headers(init?.headers).get('authorization')}`);
        return Response.json(String(input).includes('/acciones?') ? [action] : [plan]);
      },
    });
    assert.equal((await repositories.plans.list('token', { includeArchived: false }))[0].nombre, 'Plan QA');
    assert.equal((await repositories.actions.list('token', { planId, includeArchived: false }))[0].nombre, 'Acción');
    assert.ok(calls.every((call) => call.endsWith('|Bearer token')));
  });
  test('crea y actualiza conservando filtros de versión', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const repositories = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input); calls.push({ url, method: init?.method });
        return Response.json(url.includes('/acciones?') ? [action] : [plan]);
      },
    });
    await repositories.plans.update('token', planId, { expectedVersion: 2, changes: { nombre: 'Editado' } });
    await repositories.actions.create('token', { id_plan: planId, nombre: 'Acción', responsable_nombre: 'R', fecha_inicio: '2026-01-01', fecha_termino: '2026-02-01', estado: 'no_iniciada' });
    assert.match(calls[0].url, /version=eq\.2/);
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[1].method, 'POST');
  });
  test('filtra por período y archiva mediante las RPC seguras', async () => {
    const calls: Array<{ url: string; method?: string; body?: string | null }> = [];
    const repositories = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input); calls.push({ url, method: init?.method, body: init?.body?.toString() });
        return url.includes('/rpc/') ? Response.json(planId) : Response.json([plan]);
      },
    });
    await repositories.plans.list('token', { annualPeriod: 2026, includeArchived: false });
    await repositories.plans.archive('token', planId, 3);
    await repositories.actions.archive('token', action.id_accion, 4);
    assert.match(calls[0].url, /periodo_anual=eq\.2026/);
    assert.match(calls[1].url, /rpc\/archivar_plan_seguro/);
    assert.equal(calls[1].body, JSON.stringify({ p_id: planId, p_version: 3 }));
    assert.match(calls[2].url, /rpc\/archivar_accion_seguro/);
  });
  test('traduce relaciones y permisos a errores estables', async () => {
    const foreignKey = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json({ code: '23503', message: 'acciones_id_plan_fkey' }, { status: 409 }),
    });
    await assert.rejects(foreignKey.actions.create('token', {} as never), (error: any) => error.code === 'PLAN_NO_EXISTE');
    const denied = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json({ code: '42501', message: 'denied' }, { status: 403 }),
    });
    await assert.rejects(denied.plans.list('token', { includeArchived: false }), (error: any) => error.code === 'SIN_PERMISO');
  });
  test('lista, consulta, crea y actualiza Actas validando sus relaciones', async () => {
    const calls: Array<{ url: string; method?: string; body?: string | null }> = [];
    const repositories = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, method: init?.method, body: init?.body?.toString() });
        if (url.includes('/organizaciones?')) return Response.json([{ id_organizacion: orgId }]);
        if (url.includes('/planes?')) return Response.json([{ id_plan: planId }]);
        if (url.includes('/acciones?')) return Response.json([{ id_accion: action.id_accion }]);
        return Response.json([minute]);
      },
    });
    const filters = { organizationId: orgId, includeArchived: false };
    assert.equal((await repositories.meetingMinutes.list('token', filters))[0].id_acta, minuteId);
    const detail = await repositories.meetingMinutes.getById('token', minuteId);
    assert.equal(detail.objetivo, 'Revisar avances');
    assert.equal(detail.fecha_reunion, '2026-10-08');
    await repositories.meetingMinutes.create('token', {
      id_organizacion: orgId, id_plan: planId, id_accion: action.id_accion,
      objetivo: 'Revisar avances', fecha_reunion: '2026-10-08', asistentes: ['Coordinador'],
      asistentes_externos: '', observaciones: null,
    });
    await repositories.meetingMinutes.update('token', minuteId, {
      expectedVersion: 1, changes: { objetivo: 'Actualizado' },
    });
    assert.ok(calls.some(({ url }) => url.includes('/organizaciones?') && url.includes(`eq.${orgId}`)));
    assert.ok(calls.some(({ url }) => url.includes('/planes?') && url.includes(`id_organizacion=eq.${orgId}`)));
    assert.ok(calls.some(({ url }) => url.includes('/acciones?') && url.includes(`id_plan=eq.${planId}`)));
    assert.ok(calls.some(({ url, method }) => url.includes('/actas?') && method === 'POST'));
    assert.ok(calls.some(({ url, method }) => url.includes('version=eq.1') && method === 'PATCH'));
  });
  test('rechaza Organización ausente y traduce permisos y fallos de BD de Actas', async () => {
    const missing = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json([]),
    });
    await assert.rejects(missing.meetingMinutes.create('token', {
      id_organizacion: orgId, id_plan: planId, id_accion: null, objetivo: 'QA',
      fecha_reunion: '2026-10-08', asistentes: ['QA'], asistentes_externos: '', observaciones: null,
    }), (error: any) => error.code === 'ORGANIZACION_NO_EXISTE' && error.status === 409);

    const denied = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json({ code: '42501', message: 'denied' }, { status: 403 }),
    });
    await assert.rejects(
      denied.meetingMinutes.list('token', { includeArchived: false }),
      (error: any) => error.code === 'SIN_PERMISO' && error.status === 403,
    );
    const failed = createSupabaseInterventionsRepositories({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json({ code: 'XX000', message: 'internal' }, { status: 500 }),
    });
    await assert.rejects(
      failed.meetingMinutes.list('token', { includeArchived: false }),
      (error: any) => error.code === 'ERROR_BASE_DATOS' && error.status === 502,
    );
  });
});
