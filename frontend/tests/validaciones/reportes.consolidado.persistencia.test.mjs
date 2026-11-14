import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';
import { createSupabaseInsightsRepository } from '../../../backend/services/insights/src/infrastructure/supabase-insights.repository.ts';

// Datos realmente persistidos en PostgreSQL: no se simulan las consultas del informe.
test('HU22: consolidación persistida, fechas, programa, RLS y más de 1000 registros', async t => {
  const db = await crearBaseProgramas();
  try {
    for (const name of [
      '20260916221136_organizaciones_datos_parciales_20260916.sql',
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql','20261004185001_fge_permisos_organizaciones.sql',
      '20261008121000_fge_actas_reunion.sql','20261010120000_fge_actas_integracion.sql',
      '20261015120000_fge_tabla_indicadores.sql','20261015120100_fge_tabla_resultados.sql','20261015130000_fge_sprint6_rls.sql',
      '20261019120000_fge_donaciones_respaldos.sql','20261019130000_fge_scrum134_donaciones_rls.sql',
      '20261020120000_fge_scrum130_donaciones_recursos.sql','20261021120000_fge_scrum131_autorizacion_donaciones.sql',
      '20261023150000_fge_paises_catalogo_dashboard.sql',
      '20261102120000_fge_consulta_transversal_coordinadores.sql',
      '20261106200000_fge_hu22_reporte_consolidado.sql',
    ]) await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina') ON CONFLICT DO NOTHING");
    const orgs = (await db.query(`INSERT INTO public.organizaciones(id_pais,nombre,nombre_representante,telefono,publico_objetivo,descripcion_breve,numero_beneficiarios)
      SELECT id_pais,'Org '||codigo_iso,'QA','123','Comunidad','QA',10 FROM public.paises WHERE codigo_iso IN ('CL','AR') RETURNING *`)).rows;
    const cl=orgs.find(o=>o.nombre==='Org CL'), ar=orgs.find(o=>o.nombre==='Org AR');
    const programs=(await db.query(`INSERT INTO public.programas(nombre,descripcion,objetivo_general,objetivos_especificos,componentes_linea_accion,resultados_esperados)
      VALUES ('Programa A','QA','QA','QA','QA','QA'),('Programa B','QA','QA','QA','QA','QA') RETURNING id_programa`)).rows;
    const fixtures=[];
    for (const [org,program,year] of [[cl,programs[0],2026],[cl,programs[1],2026],[ar,programs[0],2026],[cl,programs[0],2025]]) {
      const plan=(await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.planes(id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino,periodo_anual)
        VALUES($1,$2,'Plan','QA','QA','QA','QA','QA',$3,$4,$5) RETURNING *`,[org.id_organizacion,program.id_programa,year+'-01-01',year+'-12-31',year]))).rows[0];
      const action=(await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino,estado)
        VALUES($1,'Acción','QA',$2,$3,'cumplida') RETURNING *`,[plan.id_plan,year+'-01-01',year+'-12-31']))).rows[0];
      const acta=(await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.actas(id_organizacion,id_plan,id_accion,objetivo,fecha_reunion,asistentes)
        VALUES($1,$2,$3,'QA',$4,ARRAY['QA']) RETURNING id_acta`,[org.id_organizacion,plan.id_plan,action.id_accion,year+'-02-01T12:00:00Z']))).rows[0];
      await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.compromisos(id_acta,descripcion,responsable_nombre,fecha_limite) VALUES($1,'QA','QA',$2)`,[acta.id_acta,year+'-06-30']));
      const indicator=(await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.indicadores(id_accion,nombre,unidad_medida) VALUES($1,'QA','personas') RETURNING id_indicador`,[action.id_accion]))).rows[0];
      for (const [date,value] of [[year+'-06-01',5],[year+'-06-30',10],[year+'-07-01',99]])
        await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.resultados(id_indicador,valor_medido,fecha_medicion) VALUES($1,$2,$3)`,[indicator.id_indicador,value,date]));
      fixtures.push({org,plan,action,indicator});
    }
    await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.indicadores(id_accion,nombre,unidad_medida) VALUES($1,'Sin medición','personas')`,[fixtures[0].action.id_accion]));
    await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.donaciones(id_organizacion,id_programa,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,monto,moneda)
      SELECT $1,$2,'2026-06-30','recibida','QA','QA','dinero',1,'CLP' FROM generate_series(1,1001)`,[cl.id_organizacion,programs[0].id_programa]));
    await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[cl.id_pais,usuarios.COORD]);
    const filters={startDate:'2026-06-01',endDate:'2026-06-30'};
    const query=(f={},role='ADMIN')=>comoUsuario(db,role,async tx=>(await tx.query('SELECT public.consultar_reporte_consolidado($1::jsonb) AS reporte',[JSON.stringify({...filters,...f})])).rows[0].reporte);
    await t.test('consolida sin fanout ni truncamiento y usa última medición dentro del rango',async()=>{
      const r=await query({organizationId:cl.id_organizacion});
      assert.equal(r.sections.organizations.length,1); assert.equal(r.summary.totalBeneficiaries,10);
      assert.equal(r.sections.plans.length,2); assert.equal(r.sections.actions.length,2); assert.equal(r.sections.commitments.length,2);
      assert.equal(r.sections.donations.length,1001); assert.equal(r.summary.totalDonationsAmount,1001);
      assert.equal(r.sections.results.length,4); assert.equal(r.summary.completedActions,2);
      assert.equal(r.sections.indicators.find(i=>i.id_indicador===fixtures[0].indicator.id_indicador).valor_obtenido,10);
      assert.equal(r.sections.indicators.find(i=>i.nombre==='Sin medición').valor_obtenido,null);
    });
    await t.test('programa no incorpora planes/acciones/compromisos de otro programa',async()=>{
      const r=await query({organizationId:cl.id_organizacion,programId:programs[0].id_programa});
      assert.deepEqual(r.sections.plans.map(p=>p.id_plan),[fixtures[0].plan.id_plan]);
      assert.equal(r.sections.actions.length,1); assert.equal(r.sections.commitments.length,1); assert.equal(r.sections.results.length,2);
      assert.equal((await query({organizationId:cl.id_organizacion,programId:programs[1].id_programa})).sections.donations.length,0);
    });
    await t.test('alcance territorial INVIT y consulta transversal COORD respetan permisos vigentes',async()=>{
      assert.equal((await query({},'COORD')).sections.organizations.length,2);
      await db.query("UPDATE public.asignaciones_roles SET id_rol=(SELECT id_rol FROM public.roles WHERE codigo='INVIT') WHERE id_usuario=$1",[usuarios.COORD]);
      const r=await query({},'COORD'); assert.deepEqual(r.sections.organizations.map(o=>o.id_organizacion),[cl.id_organizacion]);
      assert.equal(r.sections.commitments.length,2); assert.equal(r.sections.results.length,4);
      const empty=await query({organizationId:ar.id_organizacion},'COORD');
      assert.ok(Object.values(empty.sections).every(a=>a.length===0)); assert.equal(empty.summary.totalBeneficiaries,0);
      assert.equal((await query({countryId:ar.id_pais})).sections.organizations.length,1);
      assert.equal((await query({countryId:ar.id_pais,organizationId:cl.id_organizacion})).sections.organizations.length,0);
    });
    await t.test('indicadores y resultados filtran únicamente sus secciones',async()=>{
      const r=await query({indicatorIds:[fixtures[0].indicator.id_indicador]});
      assert.equal(r.sections.indicators.length,1); assert.equal(r.sections.results.length,2); assert.equal(r.sections.donations.length,1001);
      const id=r.sections.results[0].id_resultado;
      const selected=await query({resultIds:[id]}); assert.equal(selected.sections.results.length,1); assert.equal(selected.sections.indicators.length,1);
    });
    await t.test('repositorio procesa la respuesta real SQL y conserva identidad y filtros',async()=>{
      const repo=createSupabaseInsightsRepository({supabaseUrl:'https://qa.invalid',anonKey:'public',fetchImpl:async(url,init)=>{
        assert.ok(String(url).endsWith('/rpc/consultar_reporte_consolidado'));
        assert.equal(new Headers(init.headers).get('authorization'),'Bearer qa-admin');
        return Response.json(await query(JSON.parse(init.body).p_filtros));
      }});
      const r=await repo.loadConsolidated('qa-admin',{...filters,organizationId:cl.id_organizacion});
      assert.equal(r.sections.donations.length,1001); assert.equal(r.summary.totalBeneficiaries,10);
    });
    await t.test('archivados y límites UTC de cumplimiento no contaminan el período',async()=>{
      await db.query(`UPDATE public.compromisos SET estado='cumplido',cumplido_at='2026-06-30T23:59:59Z' WHERE id_acta IN (SELECT id_acta FROM public.actas WHERE id_plan=$1)`,[fixtures[0].plan.id_plan]);
      assert.equal((await query({organizationId:cl.id_organizacion})).sections.commitments.length,2);
      await db.query(`UPDATE public.compromisos SET cumplido_at='2026-07-01T00:00:00Z' WHERE id_acta IN (SELECT id_acta FROM public.actas WHERE id_plan=$1)`,[fixtures[0].plan.id_plan]);
      assert.equal((await query({organizationId:cl.id_organizacion})).sections.commitments.length,1);
      await db.query('UPDATE public.resultados SET archived_at=now() WHERE id_indicador=$1',[fixtures[0].indicator.id_indicador]);
      const r=await query({organizationId:cl.id_organizacion});
      assert.equal(r.sections.results.length,2);
      assert.equal(r.sections.indicators.find(i=>i.id_indicador===fixtures[0].indicator.id_indicador).valor_obtenido,null);
    });
    await t.test('exceso de filas falla explícitamente en lugar de devolver un informe parcial',async()=>{
      await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.donaciones(id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,monto,moneda)
        SELECT $1,'2026-06-01','recibida','QA','QA','dinero',1,'CLP' FROM generate_series(1,20001)`,[cl.id_organizacion]));
      await assert.rejects(query(),{code:'54000'});
    });
    await t.test('rechaza fechas, filtros inválidos y ejecución anónima',async()=>{
      for (const f of [{startDate:'2026-02-30'},{startDate:'2026-07-01'},{endDate:null},{countryId:'invalid'},{indicatorIds:[]},{desconocido:true}])
        await assert.rejects(query(f));
      await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT public.consultar_reporte_consolidado($1::jsonb)',[JSON.stringify(filters)]);}),{code:'42501'});
    });
  } finally { await db.close(); }
});
