import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthServer } from '../src/server.ts';
import { createGuestApplication } from '../../guests/src/application/guests-service.ts';
import { createSupabaseGuestRepository } from '../../guests/src/infrastructure/supabase-guests.repository.ts';
import { parseGuestCreate } from '../../guests/src/domain/guests.ts';

test('Invitados: envío fallido no es éxito y reintento usa enlace Auth, sin exponer tokens', async () => {
  const calls: string[]=[];
  let sends=0;
  const repo=createSupabaseGuestRepository({url:'https://qa.invalid',anonKey:'qa-anon',fetchImpl:async (input,init)=>{
    calls.push(String(input));
    if(String(input).includes('/otp?')) {
      assert.deepEqual(JSON.parse(String(init?.body)),{email:'guest@example.invalid',create_user:true});
      return ++sends === 1 ? Response.json({},{status:500}) : Response.json({});
    }
    return Response.json({correo:'guest@example.invalid',estado:'aprobado',version:sends+2});
  }});
  const app=createGuestApplication(repo);
  await assert.rejects(app.approve('admin','id',{version_esperada:1}),{code:'ENVIO_ENLACE_FALLIDO',status:502});
  assert.equal((await app.approve('admin','id',{version_esperada:2})).estado,'aprobado');
  assert.equal(calls.filter(c=>c.includes('/otp?')).length,2);
  assert.ok(calls.every(c=>!c.includes('/recover')));
  const link=new URL(calls.find(c=>c.includes('/otp?'))!).searchParams.get('redirect_to');
  assert.match(link!,/\/invitado\/acceso$/);
});

test('Invitados: HTTP de Auth valida entrada, exige sesión y consume sin permisos de Administrador', async()=>{
  const calls: string[]=[];
  const app=createGuestApplication({execute:async(token,op)=>{
    calls.push(op);
    if(op==='consume') {assert.equal(token,'guest-jwt');return {estado:'aprobado',utilizado_en:'2026-11-06'};}
    return {id_invitado:'id',estado:'pendiente'};
  },sendGuestAccessLink:async()=>true});
  const server=createAuthServer({guests:app});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const port=(server.address() as {port:number}).port;
  try {
    const base=`http://127.0.0.1:${port}/v1/guests`;
    assert.equal((await fetch(base+'/consume',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
    assert.equal((await fetch(base+'/request',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
    const consumed=await fetch(base+'/consume',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer guest-jwt'},body:'{}'});
    assert.equal(consumed.status,200);
    assert.deepEqual(calls,['consume']);
    assert.deepEqual(parseGuestCreate({nombre:'Persona',correo:'guest@example.invalid'}),{nombre:'Persona',correo:'guest@example.invalid',institucion:undefined,motivo:undefined});
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
