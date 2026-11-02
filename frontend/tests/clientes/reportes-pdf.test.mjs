import assert from 'node:assert/strict';
import {test} from 'node:test';
import {crearClienteReportesPdf} from '../../src/lib/reportes/pdf.ts';
const id='13900000-0000-4000-8000-000000000001';
const download={id,url:`/api/v1/reports/${id}/pdf`,fileName:'reporte-fge-2026-01-01_2026-12-31-interno.pdf',mimeType:'application/pdf',expiresAt:'2026-10-21T20:05:00Z'};
const filters={fecha_inicio:'2026-01-01',fecha_termino:'2026-12-31'};
test('Reportes PDF: conserva filtros, usa referencia preparada y descarga con sesión sin consultas adicionales',async()=>{
  const calls=[];
  const client=crearClienteReportesPdf('http://gateway.test',async()=> 'test-session',async(url,options)=>{
    calls.push({url,options});
    if(url.includes('consolidated'))return Response.json({ok:true,data:{report:{document:{sections:[]},download}}});
    return new Response('%PDF-1.3\nQA\n%%EOF',{headers:{'content-type':'application/pdf'}});
  });
  const report=await client.preparar(filters);const file=await client.descargar(report.download);
  assert.equal(calls.length,2);assert.match(calls[0].url,/fecha_inicio=2026-01-01&fecha_termino=2026-12-31/);
  assert.equal(calls[1].url,'http://gateway.test'+download.url);
  assert.equal(calls[1].options.headers.authorization,'Bearer test-session');
  assert.equal(file.fileName,download.fileName);assert.equal(file.blob.type,'application/pdf');assert.ok(file.blob.size>5);
});
test('Reportes PDF: rechaza referencias que intentan sacar la sesión del Gateway',async()=>{
  let called=false;const client=crearClienteReportesPdf('http://gateway.test',async()=> 'test-session',async()=>{called=true;throw new Error('No debe llamar');});
  for(const reference of [{...download,url:'https://externo.invalid/pdf'},{...download,url:download.url+'?filtro=otro'},
    {...download,id:'otro'},{...download,fileName:'../archivo.pdf'}])await assert.rejects(client.descargar(reference),{code:'RESPUESTA_INVALIDA'});
  assert.equal(called,false);
});
test('Reportes PDF: controla caducidad, permisos y errores de generación del Backend',async()=>{
  for(const [status,code] of [[404,'REPORTE_NO_DISPONIBLE'],[401,'SIN_PERMISO'],[500,'PDF_GENERACION_FALLIDA']]){
    const client=crearClienteReportesPdf('http://gateway.test',async()=> 'test-session',async()=>Response.json({ok:false,error:{code,message:'No disponible',requestId:'qa'}},{status}));
    await assert.rejects(client.descargar(download),error=>error.code===code&&error.status===status&&error.requestId==='qa');
  }
});
test('Reportes PDF: no prepara archivos corruptos o descargas interrumpidas',async()=>{
  for(const response of [new Response('no es un pdf',{headers:{'content-type':'application/pdf'}}),
    new Response('%PDF-1.3 incompleto',{headers:{'content-type':'application/pdf'}}),
    new Response('{}',{headers:{'content-type':'application/json'}})]){
    const client=crearClienteReportesPdf('http://gateway.test',async()=> 'test-session',async()=>response);
    await assert.rejects(client.descargar(download),{code:'RESPUESTA_INVALIDA'});
  }
  const offline=crearClienteReportesPdf('http://gateway.test',async()=> 'test-session',async()=>{throw new Error('Red caída');});
  await assert.rejects(offline.descargar(download),{code:'PDF_DESCARGA_FALLIDA'});
});
