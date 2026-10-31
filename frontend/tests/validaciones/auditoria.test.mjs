import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrosSchema, vacios, parametros} from '../../src/lib/auditoria/modelo.ts';
import {crearClienteAuditoria} from '../../src/lib/auditoria/cliente.ts';
import {ApiError} from '../../src/lib/api/transporte.ts';
test('filtros opcionales, fechas reales y rango ordenado',()=>{
  assert.equal(filtrosSchema.safeParse(vacios).success,true);
  assert.equal(filtrosSchema.safeParse({...vacios,desde:'2026-02-30'}).success,false);
  assert.equal(filtrosSchema.safeParse({...vacios,desde:'2026-10-28',hasta:'2026-10-01'}).success,false);
  assert.equal(filtrosSchema.safeParse({...vacios,hasta:'2026-10-28'}).success,true);
});
test('cada filtro puede enviarse solo y se codifica sin inyectar parámetros',()=>{
  for(const [key,value] of Object.entries({usuario:'Ana & limit=999',pais:'Chile',desde:'2026-01-01',hasta:'2026-10-28',operacion:'UPDATE',entidad:'perfiles'})){
    const p=new URLSearchParams(parametros({...vacios,[key]:value})); assert.equal(p.get(key),value); assert.equal(p.get('limit'),'50'); assert.equal([...p.keys()].length,2);
  }
});
test('cliente solo GET autenticado y rechaza respuesta inválida',async()=>{
  let calls=0;
  const client=crearClienteAuditoria('http://api',async()=>'token',async(url,options)=>{
    calls++; assert.equal(options.method,'GET'); assert.equal(options.headers.authorization,'Bearer token');
    return new Response(JSON.stringify({ok:true,data:{events:[{id:'incompleto'}],nextCursor:null}}));
  });
  await assert.rejects(client.consultar(vacios),{code:'RESPUESTA_INVALIDA'}); assert.equal(calls,1);
  await assert.rejects(client.consultar({...vacios,desde:'x'})); assert.equal(calls,1);
});
test('cliente conserva filtros, cursor y la página recibida del Gateway',async()=>{
  let request;
  const client=crearClienteAuditoria('http://api/',async()=>'token',async(url,options)=>{
    request={url,options};
    return new Response(JSON.stringify({ok:true,data:{events:[{
      id:'1',usuario:'Ana',rol:'ADMIN',fecha_hora:'2026-10-31T12:00:00.000Z',pais:'Chile',ip:null,
      operacion:'UPDATE',entidad:'organizaciones',referencia:'id: 1',
    }],nextCursor:'siguiente'}}));
  });
  const page=await client.consultar({...vacios,usuario:'Ana & Pérez'},'cursor-qa');
  const query=new URL(request.url).searchParams;
  assert.equal(query.get('usuario'),'Ana & Pérez'); assert.equal(query.get('cursor'),'cursor-qa');
  assert.equal(request.options.headers.authorization,'Bearer token');
  assert.equal(page.events[0].usuario,'Ana'); assert.equal(page.nextCursor,'siguiente');
});
test('explica una migración de auditoría pendiente',async()=>{
  const {mensajeError}=await import('../../src/lib/auditoria/cliente.ts');
  assert.match(mensajeError(new ApiError('MIGRACION_AUDITORIA_PENDIENTE','x',503)),/migración de consulta/);
});
