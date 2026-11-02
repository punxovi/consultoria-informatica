import {
  buildSnapshot,
  prepareReport,
  type InsightFilters,
  type InsightsRepository,
  type ReportDestination,
  type ConsolidatedReportRequest,
} from '../domain/insights.ts';
import { ReportStore } from './report-store.ts';
import { prepareReportDocument, pdfFileName, type ReportDocument, type GeneratedPdf } from '../domain/report-document.ts';
import { generateReportPdf } from '../infrastructure/report-pdf.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export function createInsightsApplication(repository: InsightsRepository, now: () => Date = () => new Date(),
  options: { store?:ReportStore; render?:(document:ReportDocument)=>Promise<Buffer> } = {}) {
  const store=options.store??new ReportStore(()=>now().getTime());
  const render=options.render??generateReportPdf;
  async function snapshot(accessToken: string, filters: InsightFilters) {
    return buildSnapshot(await repository.load(accessToken), filters, now());
  }
  return {
    dashboard: snapshot,
    async reportOverview(accessToken: string, filters: InsightFilters, destination: ReportDestination = 'interno') {
      const prepared = prepareReport(await snapshot(accessToken, filters), { destination, filters });
      await repository.auditExport(accessToken, {
        destination,
        filters: { countryId: filters.countryId ?? null },
      });
      return prepared;
    },
    async consolidatedReport(accessToken: string, request: ConsolidatedReportRequest) {
      const actor=await repository.getReportActor(accessToken);
      const snapshot = await repository.loadConsolidated(accessToken, request.filters);
      const document=prepareReportDocument(snapshot,request);
      const download=store.put(actor,document,{...request.filters,countryId:request.filters.countryId??null});
      return {
        destination: request.destination,
        title: 'Reporte Consolidado Institucional',
        ...(request.destination==='interno'?{snapshot}:{privacyProfile:'agregado_hu22'}),
        document,download,
      };
    },
    async downloadReportPdf(accessToken:string,reportId:string):Promise<GeneratedPdf> {
      const actor=await repository.getReportActor(accessToken);
      const entry=store.get(reportId,actor);
      let bytes:Buffer;
      try { bytes=await render(entry.document); }
      catch(error) { throw error instanceof ServiceError?error:new ServiceError('PDF_GENERACION_FALLIDA','No fue posible generar el PDF.',500); }
      if(!Buffer.isBuffer(bytes)||bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-64).toString().includes('%%EOF')) {
        throw new ServiceError('PDF_GENERACION_FALLIDA','El generador no produjo un PDF válido.',500);
      }
      await repository.auditExport(accessToken,{destination:entry.document.destination,filters:entry.filters as {countryId:string|null}});
      return {bytes,fileName:pdfFileName(entry.document),mimeType:'application/pdf'};
    },
  };
}

export type InsightsApplication = ReturnType<typeof createInsightsApplication>;
