import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseInsightsRepository } from '../src/infrastructure/supabase-insights.repository.ts';

describe('repositorio Supabase de Insights', () => {
  test('valida identidad de descarga en Auth sin volver a consultar módulos',async()=>{
    const calls:string[]=[];
    const repository=createSupabaseInsightsRepository({supabaseUrl:'https://supabase.invalid',anonKey:'test-public',
      fetchImpl:async(input,init)=>{calls.push(String(input));assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-session');return Response.json({id:'actor-1'});}});
    assert.equal(await repository.getReportActor('test-session'),'actor-1');
    assert.deepEqual(calls,['https://supabase.invalid/auth/v1/user']);
    const denied=createSupabaseInsightsRepository({supabaseUrl:'https://supabase.invalid',anonKey:'test-public',fetchImpl:async()=>Response.json({},{status:401})});
    await assert.rejects(denied.getReportActor('expired'),{code:'SIN_PERMISO',status:401});
    const invalid=createSupabaseInsightsRepository({supabaseUrl:'https://supabase.invalid',anonKey:'test-public',fetchImpl:async()=>Response.json({})});
    await assert.rejects(invalid.getReportActor('test'),{code:'RESPUESTA_INVALIDA'});
  });
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
  test('consulta una RPC autenticada y valida el consolidado completo', async () => {
    const filters = { startDate: '2026-01-01', endDate: '2026-12-31' };
    const snapshot = { generatedAt: '2026-11-06T12:00:00Z', period: {start: filters.startDate, end: filters.endDate}, filters,
      sections: {organizations: [], plans: [], actions: [], commitments: [], donations: [], indicators: [], results: []},
      summary: {totalBeneficiaries: 0, totalDonationsAmount: 0, completedActions: 0} };
    const repository = createSupabaseInsightsRepository({supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        assert.equal(String(input), 'https://example.supabase.co/rest/v1/rpc/consultar_reporte_consolidado');
        assert.equal(init?.method, 'POST');
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access-token');
        assert.deepEqual(JSON.parse(String(init?.body)), {p_filtros: filters});
        return Response.json(snapshot);
      }});
    assert.deepEqual(await repository.loadConsolidated('access-token', filters), snapshot);
    for (const [code, expected] of [['54000','REPORTE_DEMASIADO_GRANDE'],['PGRST202','MIGRACION_PENDIENTE'],['22023','DATOS_INVALIDOS'],['42501','SIN_PERMISO']]) {
      const failing = createSupabaseInsightsRepository({supabaseUrl:'https://example.supabase.co',anonKey:'anon',fetchImpl:async()=>Response.json({code},{status:400})});
      await assert.rejects(failing.loadConsolidated('token',filters), {code:expected});
    }
    const malformed = createSupabaseInsightsRepository({supabaseUrl:'https://example.supabase.co',anonKey:'anon',fetchImpl:async()=>Response.json([])});
    await assert.rejects(malformed.loadConsolidated('token',filters), {code:'RESPUESTA_INVALIDA'});
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
