import { buildSnapshot, type InsightFilters, type InsightsRepository } from '../domain/insights.ts';

export function createInsightsApplication(repository: InsightsRepository, now: () => Date = () => new Date()) {
  async function snapshot(accessToken: string, filters: InsightFilters) {
    return buildSnapshot(await repository.load(accessToken), filters, now());
  }
  return {
    dashboard: snapshot,
    async reportOverview(accessToken: string, filters: InsightFilters) {
      return {
        title: 'Resumen general de gestión',
        description: 'Consolidado de organizaciones, beneficiarios, planes y acciones visibles para la sesión.',
        snapshot: await snapshot(accessToken, filters),
      };
    },
  };
}

export type InsightsApplication = ReturnType<typeof createInsightsApplication>;
