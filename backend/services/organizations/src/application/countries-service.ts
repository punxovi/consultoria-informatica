import type { CountriesRepository, CountryFields, CountryUpdate } from '../domain/countries.ts';
export function createCountriesApplication(repository: CountriesRepository) {
  return {
    authorize: (token: string) => repository.execute(token, 'authorize', {}),
    list: (token: string) => repository.execute(token, 'list', {}),
    get: (token: string, id: string) => repository.execute(token, 'get', { id_pais: id }),
    create: (token: string, input: CountryFields) => repository.execute(token, 'create', input),
    update: (token: string, id: string, input: CountryUpdate) => repository.execute(token, 'update', { id_pais: id, ...input }),
  };
}
export type CountriesApplication = ReturnType<typeof createCountriesApplication>;
