import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuthAuditSynchronizer} from '../src/infrastructure/auth-audit.ts';
test('sincronización Auth: drena lotes acotados y propaga fallos sin anunciar éxito',async()=>{
 let calls=0;
 const sync=createAuthAuditSynchronizer({supabaseUrl:'https://qa.invalid',auditKey:'private',fetchImpl:async(_input,init)=>{
  calls++;assert.equal(new Headers(init?.headers).get('authorization'),'Bearer private');
  assert.deepEqual(JSON.parse(String(init?.body)),{p_limite:500,p_usuario:'qa-user'});return Response.json(calls===1?500:1);
 }});
 await sync('qa-user');assert.equal(calls,2);
 for(const body of [null,{},-1,501]) await assert.rejects(createAuthAuditSynchronizer({supabaseUrl:'https://qa.invalid',auditKey:'private',fetchImpl:async()=>Response.json(body)})(),{code:'AUDITORIA_NO_DISPONIBLE'});
 await assert.rejects(createAuthAuditSynchronizer({supabaseUrl:'https://qa.invalid'})(),{code:'AUDITORIA_NO_DISPONIBLE'});
});
