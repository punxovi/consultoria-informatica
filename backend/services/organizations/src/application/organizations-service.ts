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
    listDonations(accessToken: string, orgId: string) {
      return repository.listDonations(accessToken, orgId);
    },
    getDonationById(accessToken: string, orgId: string, donationId: string) {
      return repository.getDonationById(accessToken, orgId, donationId);
    },
    createDonation(accessToken: string, orgId: string, input: import('../domain/organizations.ts').CreateDonationInput) {
      return repository.createDonation(accessToken, orgId, input);
    },
    updateDonation(accessToken: string, orgId: string, donationId: string, input: import('../domain/donations.ts').UpdateDonationInput) {
      return repository.updateDonation(accessToken, orgId, donationId, input);
    },
    archiveDonation(accessToken: string, orgId: string, donationId: string, expectedVersion: number) {
      return repository.archiveDonation(accessToken, orgId, donationId, expectedVersion);
    },
    listDonationFiles(accessToken: string, donationId: string) {
      return repository.listDonationFiles(accessToken, donationId);
    },
    getDonationFileById(accessToken: string, donationId: string, fileId: string) {
      return repository.getDonationFileById(accessToken, donationId, fileId);
    },
    reserveDonationFile(accessToken: string, donationId: string, input: import('../domain/organizations.ts').CreateDonationFileInput) {
      return repository.reserveDonationFile(accessToken, donationId, input);
    },
    uploadDonationFile(
      accessToken: string,
      donationId: string,
      fileId: string,
      expectedVersion: number,
      bytes: Buffer,
      mimeType: string,
    ) {
      return repository.uploadDonationFile(accessToken, donationId, fileId, expectedVersion, bytes, mimeType);
    },
    downloadDonationFile(accessToken: string, donationId: string, fileId: string) {
      return repository.downloadDonationFile(accessToken, donationId, fileId);
    },
  };
}

export type OrganizationsApplication = ReturnType<typeof createOrganizationsApplication>;
