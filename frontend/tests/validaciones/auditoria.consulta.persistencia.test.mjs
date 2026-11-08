import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';
import { instalarAuditoriaRF62 } from '../helpers/auditoria-db.mjs';
import { createSupabaseAuditRepository } from '../../../backend/services/organizations/src/infrastructure/supabase-audit.repository.ts';
import { createAuditApplication } from '../../../backend/services/organizations/src/application/audit-service.ts';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';

test('Consulta de auditoría: filtros, seguridad, paginación y medición RNF14', async t => {
 const db=await crearBaseProgramas();
 const servers=[];
 const listen=async server=>{
   servers.push(server); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   return 'http://127.0.0.1:'+server.address().port;
 };
 try {
  await instalarAuditoriaRF62(db);
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261107022000_fge_consulta_auditoria_segura.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261107230000_fge_auditoria_cursor_zona_horaria.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261107233000_fge_auditoria_filtro_que_hizo.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO public.paises(codigo_iso,nombre,zona_horaria) VALUES ('CL','Chile','America/Santiago'),('AR','Argentina','America/Argentina/Buenos_Aires')");
  const countries=(await db.query("SELECT id_pais FROM public.paises WHERE codigo_iso IN ('CL','AR') ORDER BY codigo_iso")).rows;
  const ar=countries[0].id_pais,cl=countries[1].id_pais;
  await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[ar,usuarios.COORD]);
  await db.query("UPDATE auth.users SET email='actor@example.invalid' WHERE id=$1",[usuarios.COORD]);
  await db.query(`INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,fecha_hora,id_usuario,id_pais,actor_sql,ip_origen)
    SELECT CASE WHEN n%2=0 THEN 'reportes' ELSE 'paises' END,
    jsonb_build_object('id_pais',CASE WHEN n%3=0 THEN $1::uuid ELSE $2::uuid END,'filtros',jsonb_build_object('privado','NO_EXPONER')),
    CASE WHEN n%2=0 THEN 'INSERT' ELSE 'UPDATE' END,
    '2026-10-31T12:00:00.123456Z'::timestamptz-(n%5)*interval '1 day',
    CASE WHEN n%4=0 THEN $3::uuid ELSE $4::uuid END,
    CASE WHEN n%3=0 THEN $1::uuid ELSE $2::uuid END,'qa','203.0.113.8'
    FROM generate_series(1,20000) n`,[cl,ar,usuarios.COORD,usuarios.ADMIN]);
  await db.exec('ANALYZE fge_private.historial_cambios');
  const rpc=(f,role='ADMIN')=>comoUsuario(db,role,async tx=>(await tx.query('SELECT public.consultar_eventos_auditoria($1::jsonb) AS j',[JSON.stringify(f)])).rows[0].j);
  const combined={id_usuario:usuarios.COORD,id_pais:cl,usuario:'actor@example.invalid',pais:'CL',desde:'2026-10-31',hasta:'2026-10-31',operacion:'INSERT',entidad:'reportes'};
  await t.test('intersección real de filtros y país del evento prevalece sobre la asignación',async()=>{
    const result=await rpc({...combined,limit:5});
    assert.equal(result.events.length,5);
    for(const e of result.events){
      assert.equal(e.pais,'Chile');assert.equal(e.operacion,'INSERT');assert.equal(e.entidad,'reportes');
      assert.ok(e.fecha_hora.startsWith('2026-10-31'));assert.ok(e.referencia.includes(cl));
      assert.equal('correo' in e,false);assert.equal(JSON.stringify(e).includes('NO_EXPONER'),false);
    }
    assert.deepEqual(await rpc({...combined,pais:'Argentina'}),{events:[],next_cursor:null});
    assert.deepEqual(await rpc({...combined,usuario:'%'}),{events:[],next_cursor:null});
  });
  await t.test('recorre todas las filas con tiempos iguales sin saltos, repeticiones ni cursor final',async()=>{
    const expected=(await db.query(`SELECT id_historial_cambio::text AS id FROM fge_private.historial_cambios
      WHERE id_usuario=$1 AND id_pais=$2 AND tabla_afectada='reportes'
        AND fecha_hora >= '2026-10-31T00:00:00Z' AND fecha_hora < '2026-11-01T00:00:00Z'
      ORDER BY fecha_hora DESC,id_historial_cambio DESC`,[usuarios.COORD,cl])).rows.map(x=>x.id);
    let cursor={},all=[];
    for(let i=0;i<100;i++){
      const p=await rpc({...combined,limit:7,...cursor});all.push(...p.events.map(x=>x.id));
      if(!p.next_cursor)break;
      assert.equal(p.next_cursor.id,p.events.at(-1).id);
      cursor={cursor_id:p.next_cursor.id,cursor_fecha:p.next_cursor.fecha_hora};
    }
    assert.deepEqual(all,expected);
  });
  await t.test('RPC rechaza UUID, calendario, límites y cursores inválidos; solo ADMIN activo global',async()=>{
    for(const f of [{id_usuario:'no-uuid'},{id_pais:123},{desde:'infinity'},{desde:'2026-02-30'},{desde:'01/02/2026'},
      {desde:'0000-01-01'},{desde:'2026-11-01',hasta:'2026-10-31'},{limit:101},{cursor_id:'9223372036854775808',cursor_fecha:'2026-10-31T00:00:00Z'},
      {cursor_id:'1'},{cursor_id:'1',cursor_fecha:'infinity'},{entidad:'%'},{operacion:'%'}])
      await assert.rejects(rpc(f),{code:'22023'});
    await assert.rejects(rpc({},'COORD'),{code:'42501'});
    await db.query('UPDATE public.perfiles SET activo=false WHERE id_usuario=$1',[usuarios.ADMIN]);
    await assert.rejects(rpc({}),{code:'42501'});
    await db.query('UPDATE public.perfiles SET activo=true WHERE id_usuario=$1',[usuarios.ADMIN]);
    await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT public.consultar_eventos_auditoria('{}')");}),{code:'42501'});
  });
  await t.test('script de verificación remoto revierte sus fixtures',async()=>{
    await db.exec(await readFile(new URL('../../../supabase/checks/consulta-auditoria.sql',import.meta.url),'utf8'));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM fge_private.historial_cambios WHERE tabla_afectada='qa_consulta_auditoria'")).rows[0].n,0);
  });
  await t.test('RNF14 local: 100 solicitudes HTTP Gateway → repositorio → PostgreSQL',async()=>{
    const repository=createSupabaseAuditRepository({url:'https://qa.invalid',anonKey:'public',fetchImpl:async(_url,init)=>{
      const token=new Headers(init.headers).get('authorization');
      try{return Response.json(await rpc(JSON.parse(init.body).p_filtros,token==='Bearer qa-admin'?'ADMIN':'COORD'));}
      catch(e){return Response.json({code:e.code},{status:e.code==='42501'?403:400});}
    }});
    const organizations=await listen(createOrganizationsServer(undefined,undefined,undefined,createAuditApplication(repository)));
    const gateway=await listen(createGatewayServer({targets:{organizations:new URL(organizations)}}));
    const base=gateway+'/api/v1/audit/events';
    const headers={authorization:'Bearer qa-admin'};
    const query=new URLSearchParams({...combined,limit:'20'});
    const first=await fetch(base+'?'+query,{headers});
    assert.equal(first.status,200);
    const cursor=(await first.json()).data.nextCursor;
    assert.ok(cursor);
    assert.equal((await fetch(base,{headers:{authorization:'Bearer qa-coord'}})).status,403);
    assert.equal((await fetch(base+'?id_pais=no-uuid',{headers})).status,400);
    const urls=[base+'?limit=50',base+'?'+query,base+'?'+new URLSearchParams({...Object.fromEntries(query),cursor}),base+'?usuario=sin-resultados-qa'];
    for(const url of urls)assert.equal((await fetch(url,{headers})).status,200);
    const elapsed=[];
    for(let i=0;i<100;i++){
      const start=performance.now();const response=await fetch(urls[i%4],{headers});
      assert.equal(response.status,200);assert.ok((await response.json()).ok);
      elapsed.push(performance.now()-start);
    }
    elapsed.sort((a,b)=>a-b);
    const p95=elapsed[94],within=elapsed.filter(n=>n<=1500).length;
    console.log(JSON.stringify({RNF14_local:{rows:20000,requests:100,p95_ms:Number(p95.toFixed(2)),within_1500:within,max_ms:Number(elapsed.at(-1).toFixed(2))}}));
    assert.ok(within>=95,'RNF14 local no cumplido: p95='+p95);
  });
 }finally{
   for(const s of servers.reverse()){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}
   await db.close();
 }
});
