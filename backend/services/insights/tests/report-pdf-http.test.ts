import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { createInsightsApplication } from '../src/application/insights-service.ts';
import { createInsightsServer } from '../src/server.ts';
import { createGatewayServer } from '../../../gateway/src/server.ts';
import { ReportStore } from '../src/application/report-store.ts';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { reportFixture } from './fixtures/report-snapshot.ts';

async function listen(server:Server):Promise<URL>{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No server');
  return new URL(`http://127.0.0.1:${address.port}`);
}
async function environment(failure?:'audit'|'render'|'session'){
  let loads=0,audits=0,clock=Date.parse('2026-10-21T20:00:00Z');
  const repository={load:async()=>{throw new Error('No se debe consultar Dashboard');},
    getReportActor:async(token:string)=>{if(failure==='session')throw new ServiceError('SIN_PERMISO','Sesión inválida.',401);return token==='other-user'?'actor-b':'actor-a';},
    loadConsolidated:async(_token:string,filters:any)=>{loads++;const s=reportFixture();s.filters=filters;s.period={start:filters.startDate,end:filters.endDate};return s;},
    auditExport:async()=>{if(failure==='audit')throw new ServiceError('ERROR_BASE_DATOS','Auditoría no disponible.',502);audits++;}};
  const application=createInsightsApplication(repository,()=>new Date(clock),{store:new ReportStore(()=>clock),
    ...(failure==='render'?{render:async()=>{throw new ServiceError('PDF_PREPARACION_FALLIDA','Recurso PDF no disponible.',500);}}:{})});
  const service=createInsightsServer(application),target=await listen(service);
  const gateway=createGatewayServer({targets:{auth:target,organizations:target,programs:target,interventions:target,insights:target}});
  const url=await listen(gateway);
  return {url,loads:()=>loads,audits:()=>audits,expire:()=>{clock+=300_000;},
    close:async()=>{await Promise.all([gateway,service].map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))));}};
}
const path='/api/v1/reports/consolidated?fecha_inicio=2026-01-01&fecha_termino=2026-12-31';
const headers={authorization:'Bearer user-a',origin:'http://127.0.0.1:4321'};

test('HTTP/Gateway: prepara vista y entrega PDF binario válido con nombre, tamaño y control de caché',async()=>{
  const env=await environment();try{
    const prepared=await fetch(new URL(path,env.url),{headers});assert.equal(prepared.status,200);
    const {report}= (await prepared.json()).data;assert.equal(env.loads(),1);assert.equal(env.audits(),0);
    assert.equal(report.document.sections.length,8);assert.ok(report.snapshot);
    const response=await fetch(new URL(report.download.url,env.url),{headers});
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');
    assert.match(response.headers.get('content-disposition')!,/attachment; filename="reporte-fge-2026-01-01_2026-12-31-interno.pdf"/);
    assert.match(response.headers.get('cache-control')!,/no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.subarray(-64).toString().includes('%%EOF'));
    assert.equal(Number(response.headers.get('content-length')),bytes.length);assert.equal(env.loads(),1);assert.equal(env.audits(),1);
    assert.match(response.headers.get('access-control-expose-headers')!,/content-disposition/);
  }finally{await env.close();}
});
test('HTTP: descarga no acepta cambiar filtros, otra identidad ni referencias caducadas',async()=>{
  const env=await environment();try{
    const {report}=(await(await fetch(new URL(path,env.url),{headers})).json()).data;
    for(const [url,options,status] of [
      [report.download.url+'?id_pais=otro',{headers},400],
      [report.download.url,{headers:{authorization:'Bearer other-user'}},404],
      [report.download.url,{},401],
      ['/api/v1/reports/invalido/pdf',{headers},400],
    ] as const)assert.equal((await fetch(new URL(url,env.url),options)).status,status);
    // El actor puede renovar su token sin perder el snapshot preparado.
    assert.equal((await fetch(new URL(report.download.url,env.url),{headers:{authorization:'Bearer renewed-token'}})).status,200);
    env.expire();assert.equal((await fetch(new URL(report.download.url,env.url),{headers})).status,404);
    assert.equal(env.loads(),1);
  }finally{await env.close();}
});
test('HTTP: los destinos externos solo exponen datos agregados también en la vista previa',async()=>{
  const env=await environment();try{
    const r=await fetch(new URL(path+'&destino=externo&id_organizacion=11111111-1111-4111-8111-111111111111',env.url),{headers});
    assert.equal(r.status,200);const {report}=(await r.json()).data;
    assert.equal(report.privacyProfile,'agregado_hu22');assert.equal('snapshot' in report,false);
    assert.ok(!JSON.stringify(report).includes('Organización solidaria'));
    assert.ok(!JSON.stringify(report.document).includes('11111111-1111-4111-8111-111111111111'));
  }finally{await env.close();}
});
for(const failure of ['audit','render','session'] as const)test(`HTTP: error controlado de ${failure} no entrega un archivo`,async()=>{
  const env=await environment(failure);try{
    const response=await fetch(new URL(path,env.url),{headers});
    if(failure==='session'){assert.equal(response.status,401);assert.equal(env.loads(),0);return;}
    const {report}=(await response.json()).data;
    const result=await fetch(new URL(report.download.url,env.url),{headers});
    assert.equal(result.status,failure==='audit'?502:500);assert.match(result.headers.get('content-type')!,/application\/json/);
    assert.equal(result.headers.has('content-disposition'),false);assert.equal((await result.json()).ok,false);
    assert.equal(env.audits(),0);
  }finally{await env.close();}
});
