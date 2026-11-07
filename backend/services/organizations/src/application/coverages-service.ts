import { parseCoverageCreate, parseCoverageExtension, parseCoverageRevocation, parseCoverageId, type CoveragesRepository } from '../domain/coverages-api.ts';

export function createCoveragesApplication(repository: CoveragesRepository) {
  return {
    list: (token: string) => repository.execute(token, 'list', {}),
    history: (token: string, id: string) => repository.execute(token, 'history', { id_permiso_temporal: parseCoverageId(id) }),
    mine: (token: string) => repository.execute(token, 'mine', {}),
    create: (token: string, input: unknown) => repository.execute(token, 'create', parseCoverageCreate(input)),
    extend: (token: string, id: string, input: unknown) =>
      repository.execute(token, 'extend', { ...parseCoverageExtension(input), id_permiso_temporal: parseCoverageId(id) }),
    revoke: (token: string, id: string, input: unknown) =>
      repository.execute(token, 'revoke', { ...parseCoverageRevocation(input), id_permiso_temporal: parseCoverageId(id) }),
  };
}
export type CoveragesApplication = ReturnType<typeof createCoveragesApplication>;
