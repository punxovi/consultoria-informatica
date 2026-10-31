import type { CoveragesRepository } from '../domain/coverages-api.ts';

export function createCoveragesApplication(repository: CoveragesRepository) {
  return {
    list: (token: string) => repository.execute(token, 'list', {}),
    mine: (token: string) => repository.execute(token, 'mine', {}),
    create: (token: string, input: Record<string, unknown>) => repository.execute(token, 'create', input),
    extend: (token: string, id: string, input: Record<string, unknown>) =>
      repository.execute(token, 'extend', { id_permiso_temporal: id, ...input }),
    revoke: (token: string, id: string, input: Record<string, unknown>) =>
      repository.execute(token, 'revoke', { id_permiso_temporal: id, ...input }),
  };
}

export type CoveragesApplication = ReturnType<typeof createCoveragesApplication>;
