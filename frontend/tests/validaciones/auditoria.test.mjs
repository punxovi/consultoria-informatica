import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrosSchema, vacios, parametros} from '../../src/lib/auditoria/modelo.ts';
import {crearClienteAuditoria} from '../../src/lib/auditoria/cliente.ts';
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
