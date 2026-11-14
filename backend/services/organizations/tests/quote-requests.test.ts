import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { parseQuote,publicQuoteSchema,quoteUpdateSchema,quoteFilters } from '../src/domain/quote-requests.ts';
import { createQuoteRepository } from '../src/infrastructure/supabase-quote-requests.repository.ts';
import { createPublicCatalogApplication } from '../src/application/public-catalog-service.ts';
import { createQuoteRequestsApplication } from '../src/application/quote-requests-service.ts';
import { createOrganizationsServer } from '../src/server.ts';
import { createGatewayServer } from '../../../gateway/src/server.ts';
const id=(n:number)=>`16300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={nombre:' Ana María ',apellido:' Pérez López ',correo:'ana@example.org',telefono:'+56 912345678',items:[{id_producto:id(1),cantidad:2.5}]};
const confirmation={id_solicitud:id(2),estado:'solicitada',id_envio:id(3),solicitudes:[{id_solicitud:id(2),estado:'solicitada'},{id_solicitud:id(4),estado:'solicitada'}]};
const requestData={id_solicitud:id(2),nombre:'Ana María',apellido:'Pérez López',nombre_solicitante:'Ana María Pérez López',correo:'ana@example.org',telefono:null,mensaje:null,
  id_envio:id(3),id_pais:id(5),id_coordinador:id(6),sin_coordinador_al_recibir:false,solo_informativa:false,
  estado:'solicitada',version:1,created_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z',estados_permitidos:['en_gestion','cotizada','cerrada','rechazada'],
  items:[{id_producto:id(1),nombre:'Producto',nombre_producto:'Producto',unidad_medida:'unidad',cantidad:2.5,organizacion:{id_organizacion:id(7),nombre:'Organización',pais:{id_pais:id(5),nombre:'Chile'}}}]};
test('cotizaciones: valida nombres independientes, cantidades estrictas, duplicados y campos internos',()=>{
  const parsed=parseQuote(publicQuoteSchema,input);assert.equal(parsed.nombre_solicitante,'Ana María Pérez López');
  for(const field of['nombre','apellido','correo','telefono','items']){const bad:Record<string,unknown>={...input};delete bad[field];assert.throws(()=>parseQuote(publicQuoteSchema,bad));}
  for(const telefono of ['', '   ', null, 123])assert.throws(()=>parseQuote(publicQuoteSchema,{...input,telefono}));
  for(const bad of[{...input,nombre:''},{...input,correo:'bad'},{...input,items:[]},{...input,items:[...input.items,...input.items]},
    {...input,items:[{id_producto:id(1),cantidad:'2'}]},{...input,items:[{id_producto:'bad',cantidad:1}]},{...input,id_coordinador:id(6)},{...input,estado:'cerrada'},
    {...input,items:[{id_producto:id(1),cantidad:NaN}]},{...input,items:[{id_producto:id(1),cantidad:Infinity}]},{...input,items:[{id_producto:id(1),cantidad:0}]}])assert.throws(()=>parseQuote(publicQuoteSchema,bad));
  for(const bad of[{estado:'pagada',version_esperada:1},{estado:'en_gestion',version_esperada:'1'},{estado:'en_gestion',version_esperada:0},{estado:'en_gestion',version_esperada:1,id_coordinador:id(6)}])assert.throws(()=>parseQuote(quoteUpdateSchema,bad));
  assert.equal(quoteFilters(new URL('http://qa/?limit=5')).limit,5);
  for(const query of['limit=0','estado=pagada','limit=5&limit=10','id_pais=','stock=1'])assert.throws(()=>quoteFilters(new URL('http://qa/?'+query)));
});
test('cotizaciones: envío público no transmite JWT ni expone datos privados de la confirmación',async()=>{
  const repo=createQuoteRepository({supabaseUrl:'https://qa.invalid',anonKey:'public',fetchImpl:async(url,init)=>{
    assert.equal(new Headers(init?.headers).has('authorization'),false);assert.equal(new Headers(init?.headers).get('apikey'),'public');assert.ok(String(url).endsWith('registrar_solicitud_cotizacion'));
    assert.equal(JSON.parse(String(init?.body)).p_datos.nombre,'Ana María');
    return Response.json({...confirmation,correo:'private-contact',coordinador:'private-user'});
  }});
  assert.deepEqual(await repo.execute('create',parseQuote(publicQuoteSchema,input),undefined,true),confirmation);
});
test('cotizaciones: controla errores de persistencia, permisos, sesión, versión y contrato',async()=>{
  const options={supabaseUrl:'https://qa.invalid',anonKey:'public'};
  for(const [code,expected]of[['42501','SIN_PERMISO'],['40001','CONFLICTO_CONCURRENCIA'],['P0166','PRODUCTO_NO_DISPONIBLE'],['P0167','RESPONSABLE_NO_DISPONIBLE'],['P0168','SOLICITUD_NO_ENCONTRADA'],['22023','DATOS_INVALIDOS'],['PGRST202','MIGRACION_PENDIENTE']]){
    const repo=createQuoteRepository({...options,fetchImpl:async()=>Response.json({code,message:'internal-provider-detail'},{status:400})});await assert.rejects(repo.execute('get',{},'jwt'),{code:expected});
  }
  const offline=createQuoteRepository({...options,fetchImpl:async()=>{throw new Error('network');}});await assert.rejects(offline.execute('list',{},'jwt'),{code:'SUPABASE_NO_DISPONIBLE'});
  const malformed=createQuoteRepository({...options,fetchImpl:async()=>new Response('bad-json')});await assert.rejects(malformed.execute('list',{},'jwt'),{code:'RESPUESTA_INVALIDA'});
  const expired=createQuoteRepository({...options,fetchImpl:async()=>Response.json({},{status:401})});await assert.rejects(expired.execute('list',{},'jwt'),{code:'SESION_INVALIDA'});
  await assert.rejects(createQuoteRepository({supabaseUrl:'',anonKey:''}).execute('create',{},undefined,true),{code:'CONFIGURACION_SUPABASE'});
});
async function listen(server:Server){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();if(!a||typeof a==='string')throw new Error('No address');return new URL(`http://127.0.0.1:${a.port}`);}
test('cotizaciones por Gateway: público anónimo, bandeja, detalle, estado y errores consistentes',async()=>{
  let current={...requestData};let creates=0;
  const options={supabaseUrl:'https://qa.invalid',anonKey:'public',fetchImpl:async(url:RequestInfo|URL,init?:RequestInit)=>{
    const data=JSON.parse(String(init?.body));
    if(String(url).endsWith('registrar_solicitud_cotizacion')){creates++;assert.equal(new Headers(init?.headers).has('authorization'),false);return Response.json(confirmation);}
    const token=new Headers(init?.headers).get('authorization');
    if(token!=='Bearer coord'&&token!=='Bearer admin')return Response.json({code:'42501'},{status:403});
    const op=data.p_operacion,body=data.p_datos;
    if(op==='list')return Response.json({requests:[current],limit:body.limit,offset:body.offset,hasMore:false});
    if(body.id_solicitud!==current.id_solicitud)return Response.json({code:'P0168'},{status:404});
    if(op==='update'){
      if(body.version_esperada!==current.version)return Response.json({code:'40001'},{status:409});
      current={...current,estado:body.estado,version:current.version+1};
    }
    return Response.json(current);
  }};
  const service=createOrganizationsServer(undefined,undefined,undefined,undefined,createPublicCatalogApplication(options),undefined,createQuoteRequestsApplication(options));
  const gateway=createGatewayServer({targets:{organizations:await listen(service)}});const base=(await listen(gateway)).href.replace(/\/$/,'')+'/api/v1';
  const call=async(path:string,method='GET',body?:unknown,token?:string)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
  try{
    assert.equal((await call('/public/quote-requests','POST',{})).status,400);assert.equal(creates,0);
    const publicResponse=await call('/public/quote-requests','POST',input,'ignored-session');assert.equal(publicResponse.status,201);assert.equal(publicResponse.body.data.quote.solicitudes.length,2);
    assert.equal((await call('/quote-requests')).status,401);assert.equal((await call('/quote-requests','GET',undefined,'guest')).status,403);
    assert.equal((await call('/quote-requests?limit=0','GET',undefined,'coord')).status,400);
    const inbox=await call('/quote-requests','GET',undefined,'coord');assert.equal(inbox.status,200);assert.equal(inbox.body.data.requests.length,1);
    assert.equal((await call(`/quote-requests/${id(2)}`,'GET',undefined,'coord')).status,200);
    assert.equal((await call(`/quote-requests/${id(99)}`,'GET',undefined,'coord')).status,404);
    assert.equal((await call(`/quote-requests/${id(2)}`,'PATCH',{version_esperada:1,estado:'en_gestion'},'coord')).status,200);
    assert.equal((await call(`/quote-requests/${id(2)}/status`,'PATCH',{version_esperada:2,estado:'cotizada'},'coord')).status,200);
    assert.equal((await call(`/quote-requests/${id(2)}/status`,'PATCH',{version_esperada:1,estado:'cerrada'},'coord')).status,409);
    assert.equal((await call(`/quote-requests/${id(2)}`,'PATCH',{version_esperada:3,estado:'pagada'},'coord')).status,400);
    assert.equal((await call('/quote-requests/bad','GET',undefined,'coord')).status,400);
    assert.equal((await call('/public/quote-requests','GET')).status,404);
  }finally{gateway.closeAllConnections();service.closeAllConnections();await Promise.all([new Promise<void>(r=>gateway.close(()=>r())),new Promise<void>(r=>service.close(()=>r()))]);}
});
