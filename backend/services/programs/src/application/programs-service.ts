import type { ProgramFields, ProgramsRepository, UpdateProgramInput } from '../domain/programs.ts';

export function createProgramsApplication(repository: ProgramsRepository) {
  return {
    list(accessToken: string) { return repository.list(accessToken); },
    getById(accessToken: string, id: string) { return repository.getById(accessToken, id); },
    create(accessToken: string, fields: ProgramFields) { return repository.create(accessToken, fields); },
    update(accessToken: string, id: string, input: UpdateProgramInput) {
      return repository.update(accessToken, id, input);
    },
    archive(accessToken: string, id: string, expectedVersion: number) {
      return repository.archive(accessToken, id, expectedVersion);
    },
  };
}

export type ProgramsApplication = ReturnType<typeof createProgramsApplication>;
