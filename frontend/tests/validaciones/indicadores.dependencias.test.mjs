import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario } from '../helpers/programas-db.mjs';

test('SCRUM-118 detecta la dependencia RLS faltante antes de instalar o cargar el catálogo', async () => {
  const db = await crearBaseProgramas();
  const migration = await readFile(new URL('../../../supabase/migrations/20261017120000_fge_indicadores_integracion.sql',import.meta.url),'utf8');
  const seed = await readFile(new URL('../../../supabase/seeds/indicadores_desarrollo.sql',import.meta.url),'utf8');
  try {
    for (const sql of [migration,seed]) {
      await assert.rejects(db.exec(sql),e=>e.code==='55000'&&e.message.includes('20261015130000_fge_sprint6_rls.sql'));
      await db.exec('ROLLBACK');
    }
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='indicadores' AND column_name='id_catalogo'")).rows[0].n,0);
    for (const name of ['20261002120000_fge_reforzar_rls_planes_acciones.sql','20261015130000_fge_sprint6_rls.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    }
    await db.exec(migration);
    await db.exec(seed);
    const initial=(await comoUsuario(db,'COORD',tx=>tx.query('SELECT public.consultar_catalogo_indicadores() AS catalogo'))).rows[0].catalogo;
    assert.equal(initial.length,5);
    await db.exec(seed);
    assert.deepEqual((await comoUsuario(db,'COORD',tx=>tx.query('SELECT public.consultar_catalogo_indicadores() AS catalogo'))).rows[0].catalogo,initial);
    await assert.rejects(comoUsuario(db,'COORD',tx=>tx.query("INSERT INTO public.indicadores(nombre,unidad_medida) VALUES('No autorizado','unidad')")),{code:'42501'});
  } finally {await db.close();}
});
