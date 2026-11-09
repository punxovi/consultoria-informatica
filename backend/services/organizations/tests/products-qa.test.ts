import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductCreate,parseProductUpdate } from '../src/domain/products.ts';
import { createPublicCatalogApplication } from '../src/application/public-catalog-service.ts';

test('productos: alta estricta y PATCH sin valores ficticios ni campos omitidos',()=>{
  const base={id_organizacion:'16200000-0000-4000-8000-000000000001',nombre:'Bolso',descripcion:'Artesanal',unidad_medida:'unidad'};
  assert.equal(parseProductCreate({...base,publicado:false}).nombre,'Bolso');
  for(const value of [[],null,{...base,nombre:null},{...base,id_organizacion:'------------------------------------'},{...base,stock:1},{...base,publicado:true}]) assert.throws(()=>parseProductCreate(value),{code:'DATOS_INVALIDOS'});
  assert.deepEqual(parseProductUpdate({version_esperada:1,cambios:{nombre:' Nuevo ',categoria:null}}),{version:1,changes:{nombre:'Nuevo',categoria:null}});
  for(const value of [{version_esperada:1,cambios:{descripcion:null}},{version_esperada:1,cambios:[]},{version_esperada:1,cambios:{nombre:'x',stock:1}},{version_esperada:Number.MAX_SAFE_INTEGER,cambios:{nombre:'x'}}])assert.throws(()=>parseProductUpdate(value),{code:'DATOS_INVALIDOS'});
});

test('catálogo: fallback sin imágenes mantiene filtros en la consulta, antes de max-rows',async()=>{
  const country='16200000-0000-4000-8000-000000000002',org='16200000-0000-4000-8000-000000000001';
  let calls=0;
  const app=createPublicCatalogApplication({supabaseUrl:'https://qa.invalid',anonKey:'qa',fetchImpl:async input=>{
    const url=new URL(String(input));
    assert.equal(url.searchParams.get('organizacion->pais->>id_pais'),'eq.'+country);
    assert.equal(url.searchParams.get('organizacion->>id_organizacion'),'eq.'+org);
    if(++calls===1)return Response.json({code:'42703'},{status:400});
    return Response.json([]);
  }});
  assert.deepEqual(await app.list({id_pais:country,id_organizacion:org}),[]);assert.equal(calls,2);
  await assert.rejects(app.list({id_pais:'not-a-uuid'}),{code:'DATOS_INVALIDOS'});assert.equal(calls,2);
});
