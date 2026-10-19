import {
  buildSnapshot,
  prepareReport,
  type InsightFilters,
  type InsightsRepository,
  type ReportDestination,
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
  };
}

export type InsightsApplication = ReturnType<typeof createInsightsApplication>;
