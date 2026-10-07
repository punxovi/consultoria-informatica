import type {
  OrganizationFields,
  OrganizationFilters,
  OrganizationsRepository,
  UpdateOrganizationInput,
  SaveLegalRecordInput,
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
    getLegalRecord(accessToken: string, organizationId: string) {
      return repository.getLegalRecord(accessToken, organizationId);
    },
    createLegalRecord(accessToken: string, organizationId: string, input: SaveLegalRecordInput) {
      return repository.createLegalRecord(accessToken, organizationId, input);
    },
    updateLegalRecord(accessToken: string, organizationId: string, input: SaveLegalRecordInput) {
      return repository.updateLegalRecord(accessToken, organizationId, input);
    },
  };
}

export type OrganizationsApplication = ReturnType<typeof createOrganizationsApplication>;
