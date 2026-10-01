import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseProgramsRepository } from '../src/infrastructure/supabase-programs.repository.ts';

const id = '22222222-2222-4222-8222-222222222222';
const baseProgram = {
  id_programa: id, nombre: 'Programa QA', descripcion: 'Descripción', objetivo_general: 'Objetivo',
  objetivos_especificos: 'Objetivos', componentes_linea_accion: '', resultados_esperados: '',
  created_at: '', updated_at: '', created_by: null, updated_by: null, archived_at: null, version: 1,
};
const baseLine = {
  id_linea_accion: '33333333-3333-4333-8333-333333333333', id_programa: id,
  linea_accion: 'Línea', resultado_esperado: 'Resultado', created_at: '', updated_at: '',
  created_by: null, updated_by: null, archived_at: null, version: 1,
};

describe('repositorio Supabase de Programas', () => {
  test('lista programas y adjunta sus líneas con el token recibido', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const repository = createSupabaseProgramsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, authorization: new Headers(init?.headers).get('authorization') });
        return Response.json(url.includes('programa_lineas_accion') ? [baseLine] : [baseProgram]);
      },
    });
    const programs = await repository.list('access-token');
    assert.equal(programs[0].lineas_accion[0].linea_accion, 'Línea');
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.authorization === 'Bearer access-token'));
  });

  test('crea mediante la función transaccional con el contrato esperado', async () => {
    let sentBody = '';
    const repository = createSupabaseProgramsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        assert.match(String(input), /rpc\/guardar_programa_completo$/);
        sentBody = String(init?.body);
        return Response.json({ ...baseProgram, lineas_accion: [baseLine] });
      },
    });
    const created = await repository.create('token', {
      nombre: 'Programa QA', descripcion: 'Descripción', objetivo_general: 'Objetivo',
      objetivos_especificos: 'Objetivos', lineas_accion: [{ linea_accion: 'Línea', resultado_esperado: 'Resultado' }],
    });
    assert.equal(created.id_programa, id);
    assert.deepEqual(JSON.parse(sentBody).p_id_programa, null);
  });

  test('traduce permisos de Supabase a un error estable', async () => {
    const repository = createSupabaseProgramsRepository({
      supabaseUrl: 'https://example.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json({ code: '42501', message: 'denied' }, { status: 403 }),
    });
    await assert.rejects(repository.list('token'), (error: any) => error.code === 'SIN_PERMISO' && error.status === 403);
  });
});
