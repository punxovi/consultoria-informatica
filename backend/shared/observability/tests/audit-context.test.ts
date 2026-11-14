import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { auditRequestContext, createAuditedServer, withAuditFetch } from '../src/audit-context.ts';
test('IP: descarta cabeceras de clientes no confiables y Gateway usa su conexión',()=>{
 const req={socket:{remoteAddress:'203.0.113.8'},headers:{'x-fge-ip-origen':'198.51.100.9'}} as unknown as IncomingMessage;
 assert.equal(auditRequestContext(req).ip,'203.0.113.8');
 const local={socket:{remoteAddress:'::ffff:127.0.0.1'},headers:req.headers} as unknown as IncomingMessage;
 assert.equal(auditRequestContext(local,false).ip,'127.0.0.1');
});
test('HTTP concurrente no mezcla IP/requestId ni filtra contexto a otro origen',async()=>{
 const captured:Record<string,string>[]=[];
 const server=createAuditedServer(async(req,res)=>{
  const transport=withAuditFetch(async(_input,init)=>{captured.push(Object.fromEntries(new Headers(init?.headers).entries()));return Response.json(null);},'https://qa.invalid');
  await new Promise(resolve=>setTimeout(resolve,req.headers['x-request-id']==='a'?20:1));
  await transport('https://qa.invalid/rest/v1/paises',{headers:{authorization:'Bearer test'}});
  await transport('https://other.invalid/',{headers:{accept:'application/json'}});
  res.end('ok');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('Sin puerto');
 try {
  await Promise.all([['a','203.0.113.1'],['b','203.0.113.2']].map(([id,ip])=>fetch(`http://127.0.0.1:${address.port}`,{headers:{'x-request-id':id,'x-fge-ip-origen':ip}})));
  for(const [id,ip] of [['a','203.0.113.1'],['b','203.0.113.2']])assert.equal(captured.find(h=>h['x-fge-request-id']===id)?.['x-fge-ip-origen'],ip);
  assert.equal(captured.filter(h=>!h['x-fge-request-id']).length,2);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
