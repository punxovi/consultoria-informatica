import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseInterventionsRepositories } from '../src/infrastructure/supabase-interventions.repository.ts';

const planId = '33333333-3333-4333-8333-333333333333';
const plan = {
  id_plan: planId, nombre: 'Plan QA', organizacion: { id: '1', id_pais: '2', nombre: 'Org' },
  programa: { id: '3', nombre: 'Programa' },
};
const action = { id_accion: '44444444-4444-4444-8444-444444444444', nombre: 'Acción', plan: { id_plan: planId } };

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
});
