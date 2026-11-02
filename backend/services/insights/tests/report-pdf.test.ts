import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareReportDocument } from '../src/domain/report-document.ts';
import { generateReportPdf } from '../src/infrastructure/report-pdf.ts';
import { ReportStore } from '../src/application/report-store.ts';
import { createInsightsApplication } from '../src/application/insights-service.ts';
import { parseConsolidatedFilters } from '../src/domain/insights.ts';
import { reportFixture } from './fixtures/report-snapshot.ts';
const request={destination:'interno' as const,filters:reportFixture().filters};

test('PDF: recibe exclusivamente el consolidado y preserva período, valores y secciones HU22',async()=>{
  const snapshot=reportFixture(),copy=structuredClone(snapshot);
  const document=prepareReportDocument(snapshot,request);
  assert.deepEqual(snapshot,copy);
  assert.deepEqual(document.period,snapshot.period);
  assert.equal(document.sections.length,8);
  assert.equal(document.sections.find(s=>s.key==='commitments')!.rows.length,1);
  assert.equal(document.sections.find(s=>s.key==='completedActions')!.rows.length,3);
  assert.equal(document.sections.find(s=>s.key==='indicators')!.rows[0][2],'42');
  const bytes=await generateReportPdf(document);
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.subarray(-64).toString().includes('%%EOF'));
});
test('PDF: admite reportes y secciones vacías sin inventar valores',async()=>{
  const snapshot=reportFixture();
  for(const key of Object.keys(snapshot.sections))snapshot.sections[key as keyof typeof snapshot.sections]=[];
  snapshot.summary={totalBeneficiaries:0,totalDonationsAmount:0,completedActions:0};
  const doc=prepareReportDocument(snapshot,request);
  assert.ok(doc.sections.every(s=>s.rows.length===0));
  assert.ok((await generateReportPdf(doc)).length>1000);
});
test('PDF: privacidad externa elimina identidades, UUID y campos adicionales del consolidado',async()=>{
  const snapshot=reportFixture();
  Object.assign(snapshot.sections.organizations[0],{correo:'privado@example.invalid',contacto:'Persona privada'});
  snapshot.sections.organizations[0].nombre='Identidad a excluir';
  snapshot.filters.organizationId='11111111-1111-4111-8111-111111111111';
  for(const destination of ['externo','donante'] as const){
    const doc=prepareReportDocument(snapshot,{destination,filters:snapshot.filters});
    const data=JSON.stringify(doc);
    assert.ok(!data.includes('Identidad a excluir'));assert.ok(!data.includes('privado@example.invalid'));
    assert.ok(!data.includes('Persona privada'));assert.ok(!data.includes(snapshot.filters.organizationId));
    assert.ok(!data.includes('Organización solidaria'));assert.equal(doc.sections.length,8);
    assert.ok((await generateReportPdf(doc)).length>1000);
  }
});
test('PDF: rechaza metadatos de otra solicitud y datos numéricos inválidos',()=>{
  const snapshot=reportFixture();snapshot.period.start='2025-01-01';
  assert.throws(()=>prepareReportDocument(snapshot,request),{code:'REPORTE_INCONSISTENTE'});
  const other=reportFixture();other.filters.countryId='otro';
  assert.throws(()=>prepareReportDocument(other,request),{code:'REPORTE_INCONSISTENTE'});
  const invalid=reportFixture();invalid.summary.totalDonationsAmount=NaN;
  assert.throws(()=>prepareReportDocument(invalid,request),{code:'REPORTE_INCONSISTENTE'});
  const malformed=reportFixture();malformed.sections.organizations[0]=null as any;
  assert.throws(()=>prepareReportDocument(malformed,request),{code:'REPORTE_INCONSISTENTE'});
  const control=reportFixture();control.sections.organizations[0].nombre='Texto\u0000inválido';
  assert.throws(()=>prepareReportDocument(control,request),{code:'REPORTE_INCONSISTENTE'});
  const excessive=reportFixture();excessive.sections.actions=Array.from({length:20_001},()=>excessive.sections.actions[0]);
  assert.throws(()=>prepareReportDocument(excessive,request),{code:'REPORTE_DEMASIADO_GRANDE'});
});
test('PDF: caracteres que la fuente no representa producen un error controlado',async()=>{
  const doc=prepareReportDocument(reportFixture(),request);doc.sections[0].rows[0][0]='\u{1f984}';
  await assert.rejects(generateReportPdf(doc),{code:'PDF_CARACTER_NO_SOPORTADO'});
});
test('Filtros: valida calendario, orden, duplicados, UUID y listas excesivas antes de cargar datos',()=>{
  for(const query of ['fecha_inicio=2026-02-30&fecha_termino=2026-12-31','fecha_inicio=2026-12-31&fecha_termino=2026-01-01',
    'fecha_inicio=0000-01-01&fecha_termino=2026-12-31','fecha_inicio=2026-01-01&fecha_inicio=2025-01-01&fecha_termino=2026-12-31',
    'fecha_inicio=2026-01-01&fecha_termino=2026-12-31&id_pais=','fecha_inicio=2026-01-01&fecha_termino=2026-12-31&dato=otro']){
    assert.throws(()=>parseConsolidatedFilters(new URL(`http://local/?${query}`)),{code:'DATOS_INVALIDOS'});
  }
  assert.equal(parseConsolidatedFilters(new URL('http://local/?fecha_inicio=2024-02-29&fecha_termino=2024-03-01')).filters.startDate,'2024-02-29');
});
test('Cache: es inmutable, acotado, caduca y no permite descargar el reporte de otra identidad',()=>{
  let clock=0;const store=new ReportStore(()=>clock,1000);
  const doc=prepareReportDocument(reportFixture(),request);
  const download=store.put('actor-a',doc,{});doc.sections[0].rows[0][0]='Modificado después';
  assert.notEqual(store.get(download.id,'actor-a').document.sections[0].rows[0][0],'Modificado después');
  assert.throws(()=>store.get(download.id,'actor-b'),{code:'REPORTE_NO_DISPONIBLE'});
  for(let i=0;i<4;i++)store.put('actor-a',doc,{});
  assert.throws(()=>store.put('actor-a',doc,{}),{code:'REPORTES_EN_PREPARACION'});
  clock=1000;assert.throws(()=>store.get(download.id,'actor-a'),{code:'REPORTE_NO_DISPONIBLE'});
  assert.doesNotThrow(()=>store.put('actor-a',doc,{}));
});
test('Aplicación: PDF usa exactamente la vista preparada sin volver a consultar módulos y audita todos los filtros',async()=>{
  const calls:string[]=[],audits:any[]=[];let rendered:any;
  const source=reportFixture();source.filters={...source.filters,countryId:'11111111-1111-4111-8111-111111111111',indicatorIds:['22222222-2222-4222-8222-222222222222']};
  const app=createInsightsApplication({load:async()=>{throw new Error('No usar dashboard');},
    getReportActor:async(token:string)=>{calls.push('actor');return token==='sesion-a'?'actor-a':'actor-b';},
    loadConsolidated:async()=>{calls.push('consolidated');return source;},
    auditExport:async(_token:any,audit:any)=>{calls.push('audit');audits.push(audit);}},()=>new Date('2026-10-21T20:00:00Z'),{
      render:async(doc)=>{calls.push('render');rendered=doc;return Buffer.from('%PDF-1.7\nfixture\n%%EOF');}});
  const report=await app.consolidatedReport('sesion-a',{destination:'interno',filters:source.filters});
  const expected=structuredClone(report.document);source.sections.organizations[0].nombre='Datos cambiaron en origen';
  report.document.sections[0].rows[0][0]='Cliente intentó cambiar';
  const file=await app.downloadReportPdf('sesion-a',report.download.id);
  assert.deepEqual(rendered,expected);assert.equal(calls.filter(c=>c==='consolidated').length,1);
  assert.deepEqual(calls,['actor','consolidated','actor','render','audit']);
  assert.equal(file.mimeType,'application/pdf');assert.match(file.fileName,/2026-01-01_2026-12-31-interno.pdf$/);
  assert.deepEqual(audits[0].filters,source.filters);
  await assert.rejects(app.downloadReportPdf('sesion-b',report.download.id),{code:'REPORTE_NO_DISPONIBLE'});
});
test('Aplicación: ni la generación fallida ni un fallo de auditoría entregan PDF',async()=>{
  let audited=0;
  const repository={getReportActor:async()=> 'actor',load:async()=>{throw new Error('No');},
    loadConsolidated:async()=>reportFixture(),auditExport:async()=>{audited++;throw new Error('Auditoría no disponible');}};
  const broken=createInsightsApplication(repository,undefined,{render:async()=>{throw new Error('Render falló');}});
  const r=await broken.consolidatedReport('token',request);
  await assert.rejects(broken.downloadReportPdf('token',r.download.id),{code:'PDF_GENERACION_FALLIDA'});assert.equal(audited,0);
  const invalid=createInsightsApplication(repository,undefined,{render:async()=>Buffer.from('No es PDF')});
  const invalidRef=await invalid.consolidatedReport('token',request);
  await assert.rejects(invalid.downloadReportPdf('token',invalidRef.download.id),{code:'PDF_GENERACION_FALLIDA'});assert.equal(audited,0);
  const actual=createInsightsApplication(repository);
  const actualRef=await actual.consolidatedReport('token',request);
  await assert.rejects(actual.downloadReportPdf('token',actualRef.download.id),/Auditoría no disponible/);assert.equal(audited,1);
});
