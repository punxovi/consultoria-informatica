import type { AuditFilters, AuditRepository } from '../domain/audit.ts';

export function createAuditApplication(repository: AuditRepository) {
  return {
    list: (token: string, filters: AuditFilters) => repository.list(token, filters),
  };
}

export type AuditApplication = ReturnType<typeof createAuditApplication>;
