import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createCoveragesApplication } from '../../../backend/services/organizations/src/application/coverages-service.ts';
import { createSupabaseCoveragesRepository } from '../../../backend/services/organizations/src/infrastructure/supabase-coverages.repository.ts';

test('SCRUM-152: ciclo real PostgreSQL, autorización, trazabilidad y revocación inmediata',async t=>{
  const db=await crearBaseProgramas();
  try {
    await db.exec('ALTER TABLE auth.users ADD COLUMN email text');
    for(const name of ['20261027150000_fge_scrum149_paises.sql','20261029_permisos_temporales_historial.sql','20261029100000_fge_autorizacion_territorial_caducidad.sql',
      '20261031120000_fge_administrar_coberturas.sql','20261102150000_fge_coberturas_unicas_historial.sql',
      '20261102170000_fge_coberturas_historial_esquema_existente.sql','20261107010000_fge_scrum152_coberturas_integridad.sql',
      '20261109150000_fge_scrum183_historial_coberturas_combinacion.sql'])
      await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    await db.exec("INSERT INTO public.paises(codigo_iso,nombre,zona_horaria,codigo_area_telefonica) VALUES ('NZ','Nueva Zelanda','Pacific/Auckland','+64')");
    const countries=(await db.query("SELECT * FROM public.paises WHERE codigo_iso IN ('CL','NZ') ORDER BY codigo_iso")).rows;
    const home=countries[0].id_pais, target=countries[1].id_pais;
    await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[home,usuarios.COORD]);
    const rpc=(op,data={},role='ADMIN')=>comoUsuario(db,role,async tx=>(await tx.query('SELECT public.administrar_coberturas($1,$2::jsonb) AS result',[op,JSON.stringify(data)])).rows[0].result);
    const input={id_usuario_beneficiario:usuarios.COORD,id_pais:target,inicio_at:'2026-01-01',fin_at:'2090-01-10',motivo:'Apoyo territorial QA'};
    let coverage;
    await t.test('solo ADMIN gestiona y no confía en actores o credenciales del cuerpo',async()=>{
      for(const op of ['list','history','create','extend','revoke']) await assert.rejects(rpc(op,input,'COORD'),{code:'42501'});
      await assert.rejects(rpc('create',{...input,id_usuario_otorga:usuarios.ADMIN}),{code:'22023'});
      await assert.rejects(rpc('create',{...input,password:'compartida'}),{code:'22023'});
      await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT public.administrar_coberturas('list','{}')");}),{code:'42501'});
      await db.query(`INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por)
        SELECT $1,id_rol,'global',$1 FROM public.roles WHERE codigo='COORD'`,[usuarios.ADMIN]);
      await assert.rejects(rpc('create',{...input,id_usuario_beneficiario:usuarios.ADMIN}),{code:'42501'});
    });
    await t.test('alta válida persiste actor y evento OTORGAR de forma atómica',async()=>{
      coverage=await rpc('create',input); assert.equal(coverage.version,1); assert.equal(coverage.condicion,'vigente');
      const h=await rpc('history',{id_permiso_temporal:coverage.id_permiso_temporal});
      assert.equal(h.length,1); assert.equal(h[0].tipo_evento,'OTORGAR'); assert.equal(h[0].accion_por,usuarios.ADMIN);
      assert.equal(h[0].fin_at_anterior,null); assert.equal(h[0].fin_at_nuevo,coverage.fin_at);
      assert.equal((await rpc('mine',{},'COORD')).length,1);
      assert.equal((await comoUsuario(db,'COORD',tx=>tx.query('SELECT fge_private.usuario_tiene_cobertura_pais($1) AS autorizado',[target]))).rows[0].autorizado,true);
    });
    await t.test('validación SQL estricta de fechas, versión, motivo, Coordinador y país',async()=>{
      for(const patch of [{inicio_at:'2026-02-30'},{fin_at:'infinity'},{inicio_at:'01/01/2026'},{fin_at:'0000-01-01'},
        {motivo:'x'},{id_usuario_beneficiario:randomUUID()},{id_pais:randomUUID()}])
        await assert.rejects(rpc('create',{...input,...patch}),{code:'22023'});
      await assert.rejects(rpc('create',{...input,id_pais:home}),{code:'P0163'});
      for(const op of ['extend','revoke']) for(const version of [undefined,null,0,-1,1.5,'1',9007199254740992]) {
        const data={id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:version,nueva_fin_at:'2090-01-15',motivo_revocacion:'Revocación QA'};
        await assert.rejects(rpc(op,data),{code:'22023'});
      }
      await assert.rejects(rpc('extend',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:1,nueva_fin_at:'2090-01-10'}),{code:'22023'});
      await assert.rejects(rpc('extend',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:1,nueva_fin_at:'2090-01-15',motivo:'x'}),{code:'22023'});
    });
    await t.test('control de solapamientos tanto al crear como al extender',async()=>{
      await assert.rejects(rpc('create',input),{code:'P0164'});
      await rpc('create',{...input,inicio_at:'2090-01-20',fin_at:'2090-01-30'});
      await assert.rejects(rpc('extend',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:1,nueva_fin_at:'2090-01-25'}),{code:'P0164'});
      coverage=await rpc('extend',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:1,nueva_fin_at:'2090-01-15',motivo:'Extensión QA válida'});
      assert.equal(coverage.version,2);
      const h=await rpc('history',{id_permiso_temporal:coverage.id_permiso_temporal});
      assert.equal(h.length,3); const e=h.find(x=>x.tipo_evento==='EXTENDER');
      assert.equal(e.fin_at_anterior,h.find(x=>x.tipo_evento==='OTORGAR'&&x.id_permiso_temporal===coverage.id_permiso_temporal).fin_at_nuevo); assert.equal(e.fin_at_nuevo,coverage.fin_at);
      await assert.rejects(rpc('revoke',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:1,motivo_revocacion:'Obsoleta QA'}),{code:'P0161'});
    });
    await t.test('un fallo al insertar el evento revierte también el cambio de cobertura',async()=>{
      await db.exec("ALTER TABLE public.permisos_temporales_historial ADD CONSTRAINT qa_evento CHECK(tipo_evento<>'EXTENDER') NOT VALID");
      await assert.rejects(rpc('extend',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:2,nueva_fin_at:'2090-01-16'}),{code:'23514'});
      const actual=(await db.query('SELECT version,fin_at FROM public.permisos_temporales WHERE id_permiso_temporal=$1',[coverage.id_permiso_temporal])).rows[0];
      assert.equal(actual.version,2); assert.equal(actual.fin_at.toISOString(),new Date(coverage.fin_at).toISOString());
      await db.exec('ALTER TABLE public.permisos_temporales_historial DROP CONSTRAINT qa_evento');
    });
    await t.test('revocación conserva fin y antecedente y retira autorización en la siguiente consulta',async()=>{
      const previous=coverage.fin_at;
      coverage=await rpc('revoke',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:2,motivo_revocacion:'Fin anticipado QA'});
      assert.equal(coverage.condicion,'revocada'); assert.equal(coverage.fin_at,previous); assert.equal(coverage.version,3);
      assert.equal((await rpc('mine',{},'COORD')).length,0);
      assert.equal((await comoUsuario(db,'COORD',tx=>tx.query('SELECT fge_private.usuario_tiene_cobertura_pais($1) AS autorizado',[target]))).rows[0].autorizado,false);
      const h=await rpc('history',{id_permiso_temporal:coverage.id_permiso_temporal}); assert.equal(h.length,4);
      const e=h.find(x=>x.tipo_evento==='REVOCAR'); assert.equal(e.fin_at_anterior,previous); assert.equal(e.fin_at_nuevo,previous);
      await assert.rejects(rpc('extend',{id_permiso_temporal:coverage.id_permiso_temporal,version_esperada:3,nueva_fin_at:'2090-01-16'}),{code:'P0162'});
    });
    await t.test('historial inmutable, sin acceso directo ni fuga de contexto propio',async()=>{
      for(const sql of ['SELECT * FROM public.permisos_temporales_historial', 'DELETE FROM public.permisos_temporales_historial','SELECT * FROM public.permisos_temporales'])
        await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query(sql)),{code:'42501'});
      await assert.rejects(db.exec('UPDATE public.permisos_temporales_historial SET motivo=motivo'),{code:'42501'});
      await assert.rejects(db.exec('TRUNCATE public.permisos_temporales_historial'),{code:'42501'});
      await assert.rejects(rpc('mine',{id_usuario_beneficiario:usuarios.ADMIN},'COORD'),{code:'22023'});
      for(const op of ['extend','revoke','history']) await assert.rejects(rpc(op,{id_permiso_temporal:randomUUID(),version_esperada:1,nueva_fin_at:'2090-02-01',motivo_revocacion:'No existe QA'}),{code:op==='history'?'22023':'P0160'});
      await assert.rejects(rpc('history',{id_permiso_temporal:randomUUID()}),{code:'P0160'});
    });
    await t.test('vencidos, perfiles inactivos y consultas sin resultados tienen comportamiento definido',async()=>{
      const old=await rpc('create',{...input,inicio_at:'2010-01-01',fin_at:'2010-01-10'});
      assert.equal(old.condicion,'vencida');
      await assert.rejects(rpc('revoke',{id_permiso_temporal:old.id_permiso_temporal,version_esperada:1,motivo_revocacion:'Vencida QA'}),{code:'P0162'});
      await db.query('UPDATE public.perfiles SET activo=false WHERE id_usuario=$1',[usuarios.COORD]);
      await assert.rejects(rpc('create',{...input,inicio_at:'2091-01-01',fin_at:'2091-01-10'}),{code:'22023'});
      assert.deepEqual(await rpc('mine',{},'COORD'),[]);
      await db.query('UPDATE public.perfiles SET activo=true WHERE id_usuario=$1',[usuarios.COORD]);
    });
    await t.test('HTTP + repositorio + SQL rechazan suplantación, recursos inexistentes y errores de versión',async()=>{
      const repo=createSupabaseCoveragesRepository({url:'https://qa.invalid',anonKey:'public',fetchImpl:async(_url,init)=>{
        const token=new Headers(init.headers).get('authorization');
        if(!['Bearer admin','Bearer coord'].includes(token)) return Response.json({code:'42501'},{status:401});
        const body=JSON.parse(init.body);
        try {return Response.json(await rpc(body.p_operacion,body.p_datos,token==='Bearer admin'?'ADMIN':'COORD'));}
        catch(e) {return Response.json({code:e.code},{status:e.code==='42501'?403:400});}
      }});
      const server=createOrganizationsServer(undefined,undefined,createCoveragesApplication(repo));
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const base=`http://127.0.0.1:${server.address().port}/v1/organizations/temporary-coverages`;
      try {
        let response=await fetch(base,{headers:{'x-user-id':usuarios.ADMIN}}); assert.equal(response.status,401);
        response=await fetch(base,{headers:{authorization:'Bearer coord','x-user-id':usuarios.ADMIN}}); assert.equal(response.status,403);
        response=await fetch(base,{headers:{authorization:'Bearer expired'}}); assert.equal(response.status,401); assert.equal((await response.json()).error.code,'SESION_INVALIDA');
        response=await fetch(`${base}/${randomUUID()}/history`,{headers:{authorization:'Bearer admin'}}); assert.equal(response.status,404);
        assert.equal((await response.json()).error.code,'COBERTURA_NO_ENCONTRADA');
        response=await fetch(`${base}/${coverage.id_permiso_temporal}/history`,{headers:{authorization:'Bearer admin'}}); assert.equal(response.status,200); assert.equal((await response.json()).data.history.length,5);
        response=await fetch(`${base}/%ZZ/history`,{headers:{authorization:'Bearer admin'}}); assert.equal(response.status,400);
        response=await fetch(`${base}/${coverage.id_permiso_temporal}/extend`,{method:'PATCH',headers:{authorization:'Bearer admin','content-type':'application/json'},body:JSON.stringify({nueva_fin_at:'2090-02-01'})}); assert.equal(response.status,400);
      } finally {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
    });
    await t.test('repositorio consume historial real y soporta nombres físicos alternativos',async()=>{
      await db.exec('ALTER TABLE public.permisos_temporales_historial RENAME COLUMN id_historial TO id; ALTER TABLE public.permisos_temporales_historial RENAME COLUMN accion_at TO created_at');
      const repo=createSupabaseCoveragesRepository({url:'https://qa.invalid',anonKey:'public',fetchImpl:async(url,init)=>{
        assert.ok(String(url).endsWith('/rpc/administrar_coberturas')); assert.equal(new Headers(init.headers).get('authorization'),'Bearer qa-admin');
        const body=JSON.parse(init.body); return Response.json(await rpc(body.p_operacion,body.p_datos));
      }});
      const h=await repo.execute('qa-admin','history',{id_permiso_temporal:coverage.id_permiso_temporal});
      assert.equal(h.length,5); assert.ok(h.every(e=>e.id_historial&&e.accion_at));
    });
    await t.test('SCRUM-183: el historial conserva coberturas reemplazadas de la misma combinación',async()=>{
      const anterior=await rpc('create',{...input,inicio_at:'2091-01-01',fin_at:'2091-01-10',motivo:'Cobertura anterior QA'});
      await rpc('revoke',{id_permiso_temporal:anterior.id_permiso_temporal,version_esperada:1,motivo_revocacion:'Reemplazo QA'});
      const reemplazo=await rpc('create',{...input,inicio_at:'2091-02-01',fin_at:'2091-02-10',motivo:'Cobertura reemplazo QA'});
      const listado=await rpc('list');
      assert.equal(listado.filter(x=>x.id_usuario_beneficiario===usuarios.COORD&&x.id_pais===target).length,1);
      const historial=await rpc('history',{id_permiso_temporal:reemplazo.id_permiso_temporal});
      assert.ok(historial.some(x=>x.id_permiso_temporal===anterior.id_permiso_temporal));
      assert.ok(historial.some(x=>x.id_permiso_temporal===reemplazo.id_permiso_temporal));
      assert.equal(historial.find(x=>x.id_permiso_temporal===anterior.id_permiso_temporal).accion_por,usuarios.ADMIN);
    });
    await t.test('script de verificación remoto ejecuta el ciclo completo y revierte fixtures',async()=>{
      await db.exec(await readFile(new URL('../../../supabase/checks/coberturas-scrum152.sql',import.meta.url),'utf8'));
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.paises WHERE nombre LIKE 'QA SCRUM152 %'")).rows[0].n,0);
    });
  } finally {await db.close();}
});
