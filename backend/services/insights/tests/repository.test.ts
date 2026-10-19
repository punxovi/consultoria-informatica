import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseInsightsRepository } from '../src/infrastructure/supabase-insights.repository.ts';

describe('repositorio Supabase de Insights', () => {
  test('consulta en paralelo las cuatro fuentes respetando sesión y registros activos', async () => {
    const calls: string[] = [];
    const repository = createSupabaseInsightsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input); calls.push(`${url}|${new Headers(init?.headers).get('authorization')}`);
        if (url.includes('/paises?')) return Response.json([{ id_pais: 'p', codigo_iso: 'CL', nombre: 'Chile' }]);
        if (url.includes('/organizaciones?')) return Response.json([{ id_organizacion: 'o', id_pais: 'p', numero_beneficiarios: 10 }]);
        if (url.includes('/planes?')) return Response.json([{ id_plan: 'pl', id_organizacion: 'o', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31' }]);
        return Response.json([{ id_accion: 'a', id_plan: 'pl', fecha_inicio: '2026-01-01', fecha_termino: '2026-02-01', estado: 'cumplida' }]);
      },
    });
    const result = await repository.load('access-token');
    assert.equal(result.organizations.length, 1);
    assert.equal(result.actions.length, 1);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.includes('archived_at=is.null') && call.endsWith('|Bearer access-token')));
  });
  test('traduce permisos y caídas de conexión', async () => {
    const denied = createSupabaseInsightsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json({ code: '42501' }, { status: 403 }),
    });
    await assert.rejects(denied.load('token'), (error: any) => error.code === 'SIN_PERMISO');
    const offline = createSupabaseInsightsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => { throw new Error('offline'); },
    });
    await assert.rejects(offline.load('token'), (error: any) => error.code === 'SUPABASE_NO_DISPONIBLE');
  });
  test('registra la exportacion mediante la RPC autenticada y conserva destino/filtros', async () => {
    let request: { method?: string; body?: string; authorization?: string } = {};
    const repository = createSupabaseInsightsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (_input, init) => {
        request = {
          method: init?.method,
          body: typeof init?.body === 'string' ? init.body : undefined,
          authorization: new Headers(init?.headers).get('authorization') ?? undefined,
        };
        return Response.json({ ok: true }, { status: 200 });
      },
    });
    await repository.auditExport('access-token', { destination: 'externo', filters: { countryId: 'pais-1' } });
    assert.equal(request.method, 'POST');
    assert.equal(request.authorization, 'Bearer access-token');
    assert.deepEqual(JSON.parse(request.body ?? '{}'), { p_destino: 'externo', p_filtros: { countryId: 'pais-1' } });
  });
});
