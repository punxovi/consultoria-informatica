// QA reproducible con datos ficticios. No consulta Supabase ni utiliza una sesión.
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateReportPdf } from '../backend/services/insights/src/infrastructure/report-pdf.ts';
import { prepareReportDocument } from '../backend/services/insights/src/domain/report-document.ts';
import { reportFixture } from '../backend/services/insights/tests/fixtures/report-snapshot.ts';
if(!process.argv[2])throw new Error('Indica una carpeta de salida para los PDF de QA.');
const directory=resolve(process.argv[2]);await mkdir(directory,{recursive:true});
const sample=reportFixture();sample.sections.results=[];
sample.sections.commitments[0].acuerdo+=' Se mantuvo la coordinación con las organizaciones y sus equipos. '.repeat(90);
const reference=reportFixture(true);
const documents=[
  ['reporte-interno-ejemplo.pdf',prepareReportDocument(sample,{destination:'interno',filters:sample.filters})],
  ['reporte-externo-ejemplo.pdf',prepareReportDocument(sample,{destination:'externo',filters:sample.filters})],
  ['reporte-referencia-2000-acciones.pdf',prepareReportDocument(reference,{destination:'interno',filters:reference.filters})],
];
for(const [name,document] of documents)await writeFile(join(directory,name),await generateReportPdf(document));
const measurements=[];let bytes=0;
for(let i=0;i<20;i++){
  const start=performance.now();const result=await generateReportPdf(documents[2][1]);
  measurements.push(performance.now()-start);bytes=result.length;
}
measurements.sort((a,b)=>a-b);
const p95=measurements[Math.ceil(.95*measurements.length)-1];
const estimate=p95+bytes*8/5_000_000*1000;
const metrics={reference:{countries:3,organizations:50,plans:300,actions:2000},runs:20,
  renderP95Ms:Number(p95.toFixed(2)),pdfBytes:bytes,estimatedRenderAndTransferAt5MbpsMs:Number(estimate.toFixed(2)),
  networkActuallyMeasured:false,includesRemoteAuthAndAudit:false,
  generationUnder3Seconds:p95<3000,estimatedUnder3Seconds:estimate<3000};
await writeFile(join(directory,'metricas.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
if(!metrics.generationUnder3Seconds)process.exitCode=1;
