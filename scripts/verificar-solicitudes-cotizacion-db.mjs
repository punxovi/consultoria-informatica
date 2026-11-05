import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function verifyQuotes(db,f){
  let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const id=n=>`16300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const user=async uid=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('SET ROLE authenticated');};
  const anonymous=async()=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub','',false)");await db.exec('SET ROLE anon');};
  const create=data=>scalar('SELECT public.registrar_solicitud_cotizacion($1::jsonb)',[JSON.stringify(data)]);
  const manage=(op,data={})=>scalar('SELECT public.gestionar_solicitudes_cotizacion($1,$2::jsonb)',[op,JSON.stringify(data)]);
  const denied=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);checks++;};
  const coordAR=id(1),productCL=id(2),productCL2=id(3),missing=id(99);
  await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[f.admin]);
  await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'coord-ar@example.invalid','{\"full_name\":\"Coordinador AR QA\"}')",[coordAR]);
  await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por) SELECT $1,id_rol,'pais',$2,$3 FROM public.roles WHERE codigo='COORD'",[coordAR,f.ar,f.admin]);
  await db.query('INSERT INTO fge_private.cuentas_coordinadores VALUES($1,$2,$2,$3)',[coordAR,f.ar,f.admin]);
  await db.query("INSERT INTO public.productos(id_producto,id_organizacion,nombre,descripcion,unidad_medida,publicado) VALUES($1,$3,'Producto CL','Descripción','unidad',true),($2,$3,'Segundo CL','Descripción','kg',true)",[productCL,productCL2,f.orgCL]);
  const input={nombre:'Ana María',apellido:'Pérez López',correo:'ana@example.invalid',mensaje:'Antecedentes de prueba',items:[{id_producto:productCL,cantidad:2.5},{id_producto:productCL2,cantidad:1},{id_producto:f.service,cantidad:3}]};
  await anonymous();
  const group=await create(input);check(group.estado,'solicitada');check(group.solicitudes.length,2);
  check(Object.keys(group).sort(),['id_envio','id_solicitud','solicitudes','estado'].sort());
  check(JSON.stringify(group).includes('correo'),false);check(JSON.stringify(group).includes('coordinador'),false);
  await denied(db.query('SELECT * FROM public.solicitudes_cotizacion'),'42501');
  await denied(db.query('SELECT * FROM public.solicitud_cotizacion_destinatarios'),'42501');
  await denied(manage('list'),'42501');
  for(const field of ['nombre','apellido','correo','items']){const bad={...input};delete bad[field];await denied(create(bad),'22023');}
  for(const bad of [{...input,nombre:' '},{...input,correo:'incorrecto'},{...input,items:[]},{...input,items:[input.items[0],input.items[0]]},
    {...input,items:[{id_producto:productCL,cantidad:0}]},{...input,items:[{id_producto:productCL,cantidad:-1}]},
    {...input,items:[{id_producto:productCL,cantidad:'1'}]},{...input,id_coordinador:f.coord},{...input,estado:'cerrada'},
    {...input,nombre_solicitante:'Nombre inventado'},{...input,telefono:10},{...input,mensaje:'x'.repeat(2001)},
    {...input,items:[{id_producto:productCL,cantidad:1,precio:20}]}])await denied(create(bad),'22023');
  await denied(create({...input,items:[{id_producto:missing,cantidad:1}]}),'P0166');
  await user(f.coord);
  let inbox=await manage('list');check(inbox.requests.length,1);
  let clQuote=inbox.requests[0];check(clQuote.id_pais,f.cl);check(clQuote.id_coordinador,f.coord);check(clQuote.items.length,2);
  check(clQuote.nombre,'Ana María');check(clQuote.apellido,'Pérez López');check(clQuote.nombre_solicitante,'Ana María Pérez López');
  check(clQuote.solo_informativa,false);check(clQuote.estados_permitidos.includes('en_gestion'),true);
  const clId=clQuote.id_solicitud;
  await user(coordAR);let arQuote=(await manage('list')).requests[0];check(arQuote.id_pais,f.ar);check(arQuote.items.length,1);
  check(arQuote.id_coordinador,coordAR);check(arQuote.id_envio,clQuote.id_envio);
  await denied(manage('get',{id_solicitud:clId}),'P0168');
  await denied(manage('update',{id_solicitud:clId,version_esperada:1,estado:'cerrada'}),'P0168');
  await user(f.coord);
  clQuote=await manage('update',{id_solicitud:clId,version_esperada:1,estado:'en_gestion'});check(clQuote.version,2);check(clQuote.estado,'en_gestion');
  await denied(manage('update',{id_solicitud:clId,version_esperada:1,estado:'cotizada'}),'40001');
  await denied(manage('update',{id_solicitud:clId,version_esperada:2,estado:'pagada'}),'22023');
  await denied(manage('get',{id_solicitud:missing}),'P0168');
  check((await manage('list',{estado:'rechazada'})).requests,[]);
  check((await manage('list',{id_pais:f.ar})).requests,[]);
  await denied(manage('list',{limit:0}),'22023');await denied(manage('list',{id_pais:missing}),'P0169');
  await user(f.admin);check((await manage('list')).requests.length,3); // incluye la solicitud histórica anterior a SCRUM-163
  const first=await manage('list',{limit:1}),second=await manage('list',{limit:1,offset:1});check(first.hasMore,true);check(first.requests[0].id_solicitud===second.requests[0].id_solicitud,false);
  for(const uid of[f.guest,f.noRole]){await user(uid);await denied(manage('list'),'42501');check(await scalar('SELECT count(*)::int FROM public.solicitudes_cotizacion'),0);}
  await db.exec('RESET ROLE');await db.query('UPDATE public.perfiles SET activo=false WHERE id_usuario=$1',[coordAR]);
  await anonymous();const fallback=await create({...input,items:[{id_producto:f.service,cantidad:1}]});check(fallback.solicitudes.length,1);
  await user(f.coord);const notice=await manage('get',{id_solicitud:fallback.id_solicitud});
  check(notice.id_pais,f.ar);check(notice.id_coordinador,null);check(notice.sin_coordinador_al_recibir,true);check(notice.solo_informativa,true);check(notice.estados_permitidos,[]);
  await denied(manage('update',{id_solicitud:notice.id_solicitud,version_esperada:1,estado:'en_gestion'}),'42501');
  await user(f.admin);check((await manage('update',{id_solicitud:notice.id_solicitud,version_esperada:1,estado:'en_gestion'})).estado,'en_gestion');
  await db.exec('RESET ROLE');
  await db.query('UPDATE public.productos SET nombre=$1,publicado=false WHERE id_producto=$2',['Nombre nuevo',productCL]);
  await db.query('UPDATE public.organizaciones SET nombre=$1 WHERE id_organizacion=$2',['Organización renombrada',f.orgCL]);
  await user(f.coord);clQuote=await manage('get',{id_solicitud:clId});check(clQuote.items.some(i=>i.nombre_producto==='Producto CL'),true);check(clQuote.items.some(i=>i.organizacion.nombre==='Organización CL QA'),true);
  await db.exec('RESET ROLE');const before=await scalar('SELECT count(*)::int FROM public.solicitudes_cotizacion');
  await anonymous();await denied(create(input),'P0166');
  await db.exec('RESET ROLE');check(await scalar('SELECT count(*)::int FROM public.solicitudes_cotizacion'),before); // no alta parcial
  await denied(db.query('UPDATE public.solicitudes_cotizacion SET id_pais=$1 WHERE id_solicitud=$2',[f.ar,clId]),'23514');
  check(await scalar("SELECT count(*)::int>0 FROM fge_private.historial_cambios WHERE tabla_afectada='solicitud_cotizacion_destinatarios'"),true);
  const remote=await db.exec(await readFile(new URL('../supabase/tests/database/042_scrum163_verificacion_remota.sql',import.meta.url),'utf8'));
  check(remote.flatMap(r=>r.rows).find(r=>r.resultado)?.resultado?.resultado,'OK');
  check(await scalar("SELECT count(*)::int FROM public.productos WHERE nombre='Producto QA SCRUM-163'"),0);
  return{checks,engine:'PostgreSQL/PGlite',remoteSupabaseModified:false};
}
