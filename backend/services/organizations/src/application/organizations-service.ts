import type {
  OrganizationFields,
  OrganizationFilters,
  OrganizationsRepository,
  UpdateOrganizationInput,
} from '../domain/organizations.ts';

export function createOrganizationsApplication(repository: OrganizationsRepository) {
  return {
    list(accessToken: string, filters: OrganizationFilters) {
      return repository.list(accessToken, filters);
    },
    getById(accessToken: string, id: string) {
      return repository.getById(accessToken, id);
    },
    create(accessToken: string, fields: OrganizationFields) {
      return repository.create(accessToken, fields);
    },
    update(accessToken: string, id: string, input: UpdateOrganizationInput) {
      return repository.update(accessToken, id, input.changes, input.expectedVersion);
    },
    listCountries(accessToken: string) {
      return repository.listCountries(accessToken);
    },
  };
}

export type OrganizationsApplication = ReturnType<typeof createOrganizationsApplication>;
