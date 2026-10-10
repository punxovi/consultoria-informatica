import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario } from '../helpers/programas-db.mjs';

test('preparación histórica conserva acta, participantes y asociaciones sin datos inventados',async()=>{
  const db=await crearBaseProgramas();
  try {
    const pais=(await db.query("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile') RETURNING id_pais")).rows[0].id_pais;
    const org=(await db.query(`INSERT INTO public.organizaciones(id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
      VALUES($1,'Histórica','Representante','912345678','qa@example.invalid','Región','Ciudad','Calle','Comunidad','Descripción','centro_comunitario',25) RETURNING id_organizacion`,[pais])).rows[0].id_organizacion;
    const programa=(await db.query("INSERT INTO public.programas(nombre,descripcion,objetivo_general,objetivos_especificos,componentes_linea_accion,resultados_esperados) VALUES ('Programa','Descripción','Objetivo','Objetivos','Componente','Resultado') RETURNING id_programa")).rows[0].id_programa;
    const plan=(await db.query(`INSERT INTO public.planes(id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino,periodo_anual)
      VALUES($1,$2,'Plan','Necesidad','Objetivo','Objetivos','Resultado','QA','2026-01-01','2026-12-31',2026) RETURNING id_plan`,[org,programa])).rows[0].id_plan;
    const accion=(await db.query("INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino) VALUES($1,'Acción','QA','2026-01-01','2026-12-31') RETURNING id_accion",[plan])).rows[0].id_accion;
    const id=(await db.query("INSERT INTO public.actas(id_accion,objetivo,fecha,notas) VALUES($1,'Acta histórica','2026-10-01T15:00:00Z','Notas originales') RETURNING id_acta",[accion])).rows[0].id_acta;
    await db.query("INSERT INTO public.acta_participantes(id_acta,nombre_registrado) VALUES($1,'Participante original')",[id]);
    const sql=await readFile(new URL('../../../supabase/preparar-actas-legacy.sql',import.meta.url),'utf8');
    const preflight=await readFile(new URL('../../../supabase/preflight-actas-integracion.sql',import.meta.url),'utf8');
    await db.exec(preflight);
    await db.exec(sql); await db.exec(sql);
    const acta=(await db.query('SELECT * FROM public.actas WHERE id_acta=$1',[id])).rows[0];
    assert.equal(acta.id_organizacion,org); assert.equal(acta.id_plan,plan); assert.equal(acta.id_accion,accion);
    assert.equal(acta.observaciones,'Notas originales'); assert.deepEqual(acta.asistentes,['Participante original']);
    assert.equal(new Date(acta.fecha_reunion).toISOString(),'2026-10-01T15:00:00.000Z');
    assert.equal((await db.query('SELECT count(*) FROM public.acta_participantes')).rows[0].count,1);
    await db.exec(preflight);
    for(const nombre of ['20261002120000_fge_reforzar_rls_planes_acciones.sql','20261010120000_fge_actas_integracion.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/'+nombre,import.meta.url),'utf8'));
    }
    await comoUsuario(db,'ADMIN',async tx=>{
      assert.equal((await tx.query('SELECT * FROM public.actas WHERE id_acta=$1',[id])).rows[0].objetivo,'Acta histórica');
      assert.equal((await tx.query('SELECT public.catalogo_actas($1) AS datos',[org])).rows[0].datos.planes[0].id_plan,plan);
    });
  } finally { await db.close(); }
});
