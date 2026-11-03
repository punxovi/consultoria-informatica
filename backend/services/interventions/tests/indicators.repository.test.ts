import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readSupabaseConnection } from '../../../shared/config/src/supabase.ts';
import { createSupabaseIndicatorsRepository } from '../src/infrastructure/supabase-indicators.repository.ts';

const action = '11111111-1111-4111-8111-111111111111';
const indicator = '22222222-2222-4222-8222-222222222222';

test('el arranque carga el archivo de entorno desde cualquier directorio y conserva variables del proceso', () => {
  const directory = mkdtempSync(join(tmpdir(), 'scrum182-'));
  try {
    const envFile = join(directory, '.env');
    writeFileSync(envFile, 'SCRUM182_FILE_VALUE=loaded\nSCRUM182_PROCESS_VALUE=file\n');
    const module = new URL('../../../shared/config/src/supabase.ts', import.meta.url).href;
    const script = `import {loadBackendEnvironment} from ${JSON.stringify(module)};
      loadBackendEnvironment(new URL(${JSON.stringify(pathToFileURL(envFile).href)}));
      if(process.env.SCRUM182_FILE_VALUE!=='loaded'||process.env.SCRUM182_PROCESS_VALUE!=='process')process.exit(1);`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
      cwd: directory, env: { ...process.env, SCRUM182_PROCESS_VALUE: 'process' }, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Indicadores acepta la misma configuración pública que Acciones y prioriza las variables del Backend', () => {
  assert.deepEqual(readSupabaseConnection({ PUBLIC_SUPABASE_URL: ' https://public.supabase.co ', PUBLIC_SUPABASE_ANON_KEY: ' public ' }), {
    supabaseUrl: 'https://public.supabase.co', anonKey: 'public',
  });
  assert.deepEqual(readSupabaseConnection({ SUPABASE_URL: 'https://backend.supabase.co', SUPABASE_ANON_KEY: 'backend', PUBLIC_SUPABASE_URL: 'https://public.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'public' }), {
    supabaseUrl: 'https://backend.supabase.co', anonKey: 'backend',
  });
  assert.equal(readSupabaseConnection({ SUPABASE_ANON_KEY: ' ', PUBLIC_SUPABASE_ANON_KEY: 'public' }).anonKey, 'public');
});

test('catálogo, asociaciones, metas y resultados conservan el JWT y los identificadores', async () => {
  const calls: Array<{ name: string; body: any }> = [];
  const repository = createSupabaseIndicatorsRepository({
    supabaseUrl: 'https://example.supabase.co/', anonKey: 'public-key',
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('apikey'), 'public-key');
      assert.equal(headers.get('authorization'), 'Bearer user-jwt');
      const name = String(url).split('/').at(-1)!;
      calls.push({ name, body: JSON.parse(String(init?.body)) });
      return Response.json(['consultar_catalogo_indicadores', 'listar_indicadores_accion', 'asociar_indicadores_accion'].includes(name) ? [] : { id_indicador: indicator });
    },
  });
  await repository.catalog('user-jwt');
  await repository.list('user-jwt', action);
  await repository.associate('user-jwt', action, { indicadores: [{ id_indicador: indicator, meta: 20 }] });
  await repository.updateGoal('user-jwt', indicator, { version_esperada: 1, cambios: { meta: 30 } });
  await repository.createResult('user-jwt', { id_indicador: indicator, valor_medido: 0, fecha_medicion: '2026-11-02' });
  await repository.updateResult('user-jwt', indicator, { version_esperada: 1, cambios: { valor_medido: 25, fecha_medicion: '2026-11-02' } });
  assert.equal(calls.length, 6);
  assert.equal(calls[1].body.p_accion, action);
  assert.equal(calls[2].body.p_indicadores[0].id_indicador, indicator);
  assert.equal(calls[3].body.p_meta, 30);
  assert.equal(calls[4].body.p_valor, 0);
  assert.equal(calls[4].body.p_indicador, indicator);
  assert.equal(calls[5].body.p_id, indicator);
  assert.equal(calls[5].body.p_version, 1);
});

for (const [code, status, expected] of [
  ['42501', 403, 'SIN_PERMISO'], ['P0002', 404, 'NO_ENCONTRADO'],
  ['PGRST202', 404, 'MIGRACION_PENDIENTE'], ['42P01', 404, 'MIGRACION_PENDIENTE'],
  ['23514', 400, 'DATOS_INVALIDOS'], ['40001', 409, 'CONFLICTO_CONCURRENCIA'],
  ['PGRST301', 401, 'SESION_REQUERIDA'], ['23505', 409, 'INDICADOR_YA_ASOCIADO'],
] as const) {
  test(`error ${code} produce ${expected}`, async () => {
    const repository = createSupabaseIndicatorsRepository({ supabaseUrl: 'https://example.supabase.co', anonKey: 'public', fetchImpl: async () => Response.json({ code }, { status }) });
    await assert.rejects(repository.catalog('jwt'), { code: expected });
  });
}

test('configuración inválida se rechaza antes de conectar y sin exponer valores', async () => {
  for (const supabaseUrl of ['', 'invalid-secret-url', 'ftp://example.test', 'https://user:secret@example.test']) {
    const repository = createSupabaseIndicatorsRepository({ supabaseUrl, anonKey: 'secret', fetchImpl: async () => { throw new Error('No debe conectar'); } });
    await assert.rejects(repository.catalog('jwt'), (error: any) => error.code === 'SERVICIO_NO_CONFIGURADO' && !error.message.includes('secret'));
  }
});

test('distingue clave inválida de sesión vencida y desconexión', async () => {
  const repository = createSupabaseIndicatorsRepository({ supabaseUrl: 'https://example.supabase.co', anonKey: 'public', fetchImpl: async () => Response.json({ message: 'Invalid API key' }, { status: 401 }) });
  await assert.rejects(repository.catalog('jwt'), { code: 'CREDENCIALES_SUPABASE_INVALIDAS' });
  const offline = createSupabaseIndicatorsRepository({ supabaseUrl: 'https://example.supabase.co', anonKey: 'public', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.catalog('jwt'), { code: 'SUPABASE_NO_DISPONIBLE' });
});
