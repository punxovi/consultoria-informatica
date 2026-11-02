import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camposCompromisoSchema, guardarCompromisoSchema, vencido, hoyLocal } from '../../src/lib/compromisos/modelo.ts';
import { crearClienteCompromisos } from '../../src/lib/compromisos/cliente.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';
import { crearDemoActas } from '../../src/lib/actas-reunion/demo.ts';
import { crearDemoCompromisos } from '../../src/lib/compromisos/demo.ts';
const campos = { descripcion:'Entregar documentos', responsable_nombre:'Ana', responsable_contacto:'ana@example.test', fecha_limite:'2026-10-15', observaciones:'' };
const entrada = { ...campos, id_acta:'11111111-1111-4111-8111-111111111111', estado:'pendiente' };
const registro = { ...entrada, id_compromiso:'22222222-2222-4222-8222-222222222222', id_organizacion:'33333333-3333-4333-8333-333333333333', version:1, created_at:'2026-10-07T12:00:00Z', updated_at:'2026-10-07T12:00:00Z', cumplido_at:null };

test('HU17 exige contacto y fecha válida; vencido es una condición, no un estado', () => {
  assert.ok(camposCompromisoSchema.safeParse(campos).success);
  for (const campo of ['descripcion','responsable_nombre','responsable_contacto','fecha_limite']) assert.equal(camposCompromisoSchema.safeParse({...campos,[campo]:''}).success,false);
  assert.equal(camposCompromisoSchema.safeParse({...campos,fecha_limite:'2026-02-30'}).success,false);
  assert.equal(guardarCompromisoSchema.safeParse({...entrada,estado:'vencido'}).success,false);
  assert.equal(vencido({...entrada,fecha_limite:'2026-10-06'},'2026-10-07'),true);
  assert.equal(vencido({...entrada,fecha_limite:'2026-10-07'},'2026-10-07'),false);
  assert.equal(vencido({...entrada,estado:'cumplido'},'2026-10-20'),false);
  assert.equal(hoyLocal(new Date(2026,9,7,23,59)), '2026-10-07');
});

test('cliente transmite token, estado inicial Pendiente y versión esperada al editar', async () => {
  const llamadas=[];
  const cliente=crearClienteCompromisos(createApiTransport('http://api.test',async(url,options)=>{
    llamadas.push({url,options});
    return Response.json({ok:true,data:url.endsWith('/origins')?{puede_gestionar:true,actas:[{id_plan:'44444444-4444-4444-8444-444444444444',id_accion:null,id_acta:'11111111-1111-4111-8111-111111111111',nombre:'Acta 1'}]}:options.method==='GET'&&url.endsWith('/commitments')?{compromisos:[registro]}:{compromiso:registro}});
  }),async()=>'token-qa');
  assert.equal((await cliente.listar('33333333-3333-4333-8333-333333333333')).length,1);
  assert.equal((await cliente.actas('33333333-3333-4333-8333-333333333333')).length,1);
  await cliente.obtener('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222');
  await cliente.crear('33333333-3333-4333-8333-333333333333',{...entrada,estado:'cumplido'});
  await cliente.actualizar('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',1,entrada);
  assert.equal(llamadas[3].options.headers.authorization,'Bearer token-qa');
  assert.equal(JSON.parse(llamadas[3].options.body).estado,'pendiente');
  assert.equal(JSON.parse(llamadas[4].options.body).version_esperada,1);
  assert.equal(llamadas[4].options.method,'PATCH');
  assert.equal(JSON.parse(llamadas[4].options.body).cambios.id_acta,undefined);
  assert.equal(JSON.parse(llamadas[4].options.body).cambios.descripcion,campos.descripcion);
});

test('normaliza nulos históricos y rechaza una fecha de cumplimiento incoherente',async()=>{
  const c=crearClienteCompromisos(createApiTransport('http://api.test',async()=>Response.json({ok:true,data:{compromiso:{...registro,responsable_contacto:null,observaciones:null,created_by:null}}})),async()=> 'qa');
  const historico=await c.obtener(registro.id_organizacion,registro.id_compromiso);
  assert.equal(historico.responsable_contacto,'');assert.equal(historico.observaciones,'');
  const inconsistente=crearClienteCompromisos(createApiTransport('http://api.test',async()=>Response.json({ok:true,data:{compromiso:{...registro,estado:'cumplido'}}})),async()=> 'qa');
  await assert.rejects(inconsistente.obtener(registro.id_organizacion,registro.id_compromiso),{code:'RESPUESTA_INVALIDA'});
});

test('ruta pendiente, respuestas ajenas y conflictos no se interpretan como éxito', async () => {
  for(const [payload,status] of [[{ok:false,error:{code:'RUTA_NO_ENCONTRADA',message:'Pendiente'}},404],[{ok:true,data:{compromiso:{...registro,id_organizacion:'otra'}}},200],[{ok:false,error:{code:'CONFLICTO',message:'Recargar'}},409]]) {
    const c=crearClienteCompromisos(createApiTransport('http://api.test',async()=>Response.json(payload,{status})),async()=>'qa');
    await assert.rejects(()=>c.obtener('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222'));
  }
});

test('acta y compromisos comparten demo; valida lote completo antes de guardar y controla organización/versiones',async()=>{
  const org=crypto.randomUUID(), actas=crearDemoActas(), compromisos=crearDemoCompromisos();
  const actaCampos={id_plan:'',id_accion:'',fecha_reunion:'2026-10-07',asistentes:['Ana'],asistentes_externos:'',objetivo:'Reunión',observaciones:''};
  await assert.rejects(()=>actas.crear(org,{campos:actaCampos,compromisos:[campos,{...campos,responsable_contacto:''}]}));
  assert.equal((await actas.obtener(org)).length,0);
  const acta=await actas.crear(org,{campos:actaCampos,compromisos:[campos,{...campos,descripcion:'Segundo acuerdo'}]});
  const lista=await compromisos.listar(org);
  assert.equal(lista.length,2); assert.ok(lista.every(c=>c.id_acta===acta.id_acta&&c.estado==='pendiente'));
  assert.equal((await compromisos.listar('otra')).length,0);
  const actualizado=await compromisos.actualizar(org,lista[0].id_compromiso,1,{...entrada,id_acta:acta.id_acta,estado:'cumplido'});
  assert.ok(actualizado.cumplido_at); assert.equal(actualizado.version,2);
  await assert.rejects(()=>compromisos.actualizar(org,lista[0].id_compromiso,1,{...entrada,id_acta:acta.id_acta}),e=>e.status===409);
});
