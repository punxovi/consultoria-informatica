import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroFormularioSchema, resultadoFormularioSchema } from '../../src/lib/indicadores/modelo.ts';
import { crearClienteIndicadores } from '../../src/lib/indicadores/cliente.ts';
import { crearDemoIndicadores, catalogoDemo } from '../../src/lib/indicadores/demo.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';
const accion='11200000-0000-4000-8000-000000000100', iid='11200000-0000-4000-8000-000000000200', rid='11200000-0000-4000-8000-000000000300';
const indicador={id_indicador:iid,id_accion:accion,id_catalogo:catalogoDemo[0].id_indicador,meta:20,version:2,resultado:null};
const resultado={id_resultado:rid,id_indicador:iid,valor_medido:0,fecha_medicion:'2026-10-15',observaciones:'',version:1};

test('metas y resultados distinguen vacío de cero y rechazan negativos, no finitos y fechas imposibles',()=>{
  for(const v of ['',' ','-1','Infinity','NaN','1e999','9007199254740992'])assert.equal(numeroFormularioSchema.safeParse(v).success,false,v);
  assert.equal(numeroFormularioSchema.parse('0'),0);assert.equal(numeroFormularioSchema.parse('1,5'),1.5);
  assert.equal(resultadoFormularioSchema.safeParse({valor_medido:'0',fecha_medicion:'2026-02-30',observaciones:''}).success,false);
  assert.equal(resultadoFormularioSchema.safeParse({valor_medido:'0',fecha_medicion:'2024-02-29',observaciones:''}).success,true);
});
test('demo: lote atómico, sin duplicados por acción y versiones independientes para meta y resultado',async()=>{
  const s=crearDemoIndicadores(),catalogo=await s.catalogo();assert.equal(catalogo.length,5);
  const entrada={id_indicador:catalogo[0].id_indicador,meta:20};
  await assert.rejects(()=>s.asociar(accion,[entrada,{id_indicador:catalogo[1].id_indicador,meta:-1}]));
  assert.equal((await s.listar(accion)).length,0);
  const [item]=await s.asociar(accion,[entrada]);assert.equal(item.resultado,null);
  await assert.rejects(()=>s.asociar(accion,[entrada]),e=>e.status===409);
  assert.equal((await s.listar('otra')).length,0);
  const r=await s.guardarResultado(item,{valor_medido:0,fecha_medicion:'2026-10-15',observaciones:''});assert.equal(r.valor_medido,0);
  const nuevaMeta=await s.actualizarMeta(item,30);assert.equal(nuevaMeta.resultado.valor_medido,0);
  await assert.rejects(()=>s.actualizarMeta(item,40),e=>e.status===409);
  await assert.rejects(()=>s.guardarResultado(item,{valor_medido:4,fecha_medicion:'2026-10-15',observaciones:''}),e=>e.status===409);
});
test('cliente HTTP envía lote, token y versión del registro correcto',async()=>{
  const llamadas=[];
  const c=crearClienteIndicadores(createApiTransport('http://api.test',async(url,options)=>{
    llamadas.push({url,options});
    const data=url.endsWith('/catalog')?{catalogo:catalogoDemo}:url.includes('/results')?{resultado}:options.method==='PATCH'?{indicador}:{indicadores:[indicador]};
    return Response.json({ok:true,data});
  }),async()=>'jwt-prueba');
  await c.catalogo();await c.listar(accion);await c.asociar(accion,[{id_indicador:indicador.id_catalogo,meta:20}]);
  await c.actualizarMeta(indicador,30);await c.guardarResultado(indicador,{valor_medido:0,fecha_medicion:'2026-10-15',observaciones:''});
  await c.guardarResultado({...indicador,resultado},{valor_medido:4,fecha_medicion:'2026-10-15',observaciones:''});
  assert.equal(llamadas[2].options.headers.authorization,'Bearer jwt-prueba');
  assert.equal(JSON.parse(llamadas[2].options.body).indicadores.length,1);
  assert.equal(JSON.parse(llamadas[3].options.body).version_esperada,2);
  assert.equal(llamadas[4].options.method,'POST');assert.equal(JSON.parse(llamadas[5].options.body).version_esperada,1);
});
test('rechaza respuesta ajena, resultados cruzados, asociaciones duplicadas y lotes parciales',async()=>{
  for(const datos of [[{...indicador,id_accion:rid}],[{...indicador,resultado:{...resultado,id_indicador:rid}}],[indicador,indicador]]){
    const c=crearClienteIndicadores(createApiTransport('http://api.test',async()=>Response.json({ok:true,data:{indicadores:datos}})),async()=>'jwt');
    await assert.rejects(()=>c.listar(accion),e=>e.code==='RESPUESTA_INVALIDA');
  }
  const c=crearClienteIndicadores(createApiTransport('http://api.test',async()=>Response.json({ok:true,data:{indicadores:[]}})),async()=>'jwt');
  await assert.rejects(()=>c.asociar(accion,[{id_indicador:indicador.id_catalogo,meta:20}]),e=>e.code==='RESPUESTA_INVALIDA');
});
