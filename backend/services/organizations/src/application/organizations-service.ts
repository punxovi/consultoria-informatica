import type {
  OrganizationFields,
  OrganizationFilters,
  OrganizationsRepository,
  UpdateOrganizationInput,
  SaveLegalRecordInput,
  CamposCompromiso,
  ActualizarCompromisoInput,
  ActualizarDiagnosticoInput,
  CamposDiagnostico,
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
    listCommitments(accessToken: string, orgId: string, filtros: { id_acta?: string }) {
      return repository.listCommitments(accessToken, orgId, filtros);
    },
    listCommitmentOrigins(accessToken: string, orgId: string) {
      return repository.listCommitmentOrigins(accessToken, orgId);
    },
    createCommitment(accessToken: string, orgId: string, fields: CamposCompromiso) {
      return repository.createCommitment(accessToken, orgId, fields);
    },
    getCommitmentById(accessToken: string, orgId: string, commitmentId: string) {
      return repository.getCommitmentById(accessToken, orgId, commitmentId);
    },
    updateCommitment(accessToken: string, orgId: string, commitmentId: string, input: ActualizarCompromisoInput) {
      return repository.updateCommitment(accessToken, orgId, commitmentId, input.cambios, input.versionEsperada);
    },
    listDiagnosticos(accessToken: string, orgId: string) {
      return repository.listDiagnosticos(accessToken, orgId);
    },
    createDiagnostico(accessToken: string, orgId: string, fields: CamposDiagnostico) {
      return repository.createDiagnostico(accessToken, orgId, fields);
    },
    getDiagnosticoById(accessToken: string, orgId: string, diagnosticoId: string) {
      return repository.getDiagnosticoById(accessToken, orgId, diagnosticoId);
    },
    updateDiagnostico(accessToken: string, orgId: string, diagnosticoId: string, input: ActualizarDiagnosticoInput) {
      return repository.updateDiagnostico(accessToken, orgId, diagnosticoId, input.cambios, input.versionEsperada);
    },
  };
}

export type OrganizationsApplication = ReturnType<typeof createOrganizationsApplication>;
