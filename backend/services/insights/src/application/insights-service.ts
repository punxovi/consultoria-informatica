import {
  buildSnapshot,
  prepareReport,
  type InsightFilters,
  type InsightsRepository,
  type ReportDestination,
  type ConsolidatedReportRequest,
} from '../domain/insights.ts';

export function createInsightsApplication(repository: InsightsRepository, now: () => Date = () => new Date()) {
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
    // --- NUEVO MÉTODO PARA SCRUM-136 ---
    async consolidatedReport(accessToken: string, request: ConsolidatedReportRequest) {
      const snapshot = await repository.loadConsolidated(accessToken, request.filters);
      
      // Registramos la auditoría (criterio de seguridad)
      await repository.auditExport(accessToken, {
        destination: request.destination,
        filters: { countryId: request.filters.countryId ?? null },
      });

      return {
        destination: request.destination,
        title: 'Reporte Consolidado Institucional',
        snapshot
      };
    }
  };
}

export type InsightsApplication = ReturnType<typeof createInsightsApplication>;
