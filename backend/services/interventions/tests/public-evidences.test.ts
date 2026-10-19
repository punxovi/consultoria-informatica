import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabasePublicEvidencesRepository } from '../src/infrastructure/supabase-public-evidences.repository.ts';
const id='66666666-6666-4666-8666-666666666666';
const file={bucket_id:'fge-evidencias',ruta_objeto:`44444444-4444-4444-8444-444444444444/${id}`,nombre_original:'qa.pdf',mime_type:'application/pdf',tamano_bytes:8,version:2};

test('publicación: no consulta Storage cuando no hay autorización vigente',async()=>{
  let requests=0;
  const repo=createSupabasePublicEvidencesRepository({supabaseUrl:'http://qa.local',publicationKey:'server-only',fetchImpl:async()=>{requests++;return Response.json([]);}});
  await assert.rejects(repo.download(id),{code:'PUBLICACION_NO_ENCONTRADA'});
  assert.equal(requests,1);
});
test('publicación: descarta descarga si se retira o cambia mientras obtiene el archivo',async()=>{
  for(const after of [[],[{...file,version:3}]]) {
    let reads=0;
    const repo=createSupabasePublicEvidencesRepository({supabaseUrl:'http://qa.local',publicationKey:'server-only',fetchImpl:async(url,init)=>{
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer server-only');
      if(String(url).includes('/storage/'))return new Response('%PDF-123');
      return Response.json(++reads===1?[file]:after);
    }});
    await assert.rejects(repo.download(id),{code:'PUBLICACION_NO_ENCONTRADA'});
  }
});
test('publicación: rechaza rutas y tipos inesperados de almacenamiento',async()=>{
  for(const invalid of [null,{...file,bucket_id:'otro'},{...file,ruta_objeto:'../otro'},{...file,mime_type:'text/html'},{...file,version:0}]) {
    const repo=createSupabasePublicEvidencesRepository({supabaseUrl:'http://qa.local',publicationKey:'server-only',fetchImpl:async()=>Response.json([invalid])});
    await assert.rejects(repo.download(id),{code:'RESPUESTA_INVALIDA'});
  }
});

test('publicación: las secret keys solo se envían en apikey',async()=>{
  const repo=createSupabasePublicEvidencesRepository({supabaseUrl:'http://qa.local',publicationKey:'sb_secret_test',fetchImpl:async(_url,init)=>{
    const headers=new Headers(init?.headers);
    assert.equal(headers.get('apikey'),'sb_secret_test');assert.equal(headers.has('authorization'),false);
    return Response.json([]);
  }});
  await assert.rejects(repo.download(id),{code:'PUBLICACION_NO_ENCONTRADA'});
});
