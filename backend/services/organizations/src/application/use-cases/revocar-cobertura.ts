import type { RevocarCoberturaInput, PermisoTemporalResponse } from '@backend/shared-contracts';

export interface RevocarCoberturaRepository {
  buscarPorId(idPermisoTemporal: string): Promise<PermisoTemporalResponse | null>;
  revocar(idPermisoTemporal: string, data: RevocarCoberturaInput & { id_usuario_admin: string }): Promise<PermisoTemporalResponse>;
}

export class RevocarCoberturaUseCase {
  private coberturaRepo: RevocarCoberturaRepository;

  constructor(coberturaRepo: RevocarCoberturaRepository) {
    this.coberturaRepo = coberturaRepo;
  }

  async ejecutar(idPermisoTemporal: string, input: RevocarCoberturaInput, idUsuarioAdmin: string): Promise<PermisoTemporalResponse> {
    const coberturaActual = await this.coberturaRepo.buscarPorId(idPermisoTemporal);
    if (!coberturaActual) {
      throw new Error('La cobertura temporal especificada no existe.');
    }

    if (coberturaActual.revocado_at !== null) {
      throw new Error('Esta cobertura temporal ya se encuentra revocada.');
    }

    if (!input.motivo_revocacion || input.motivo_revocacion.trim() === '') {
      throw new Error('El motivo de revocación es obligatorio.');
    }

    return await this.coberturaRepo.revocar(idPermisoTemporal, {
      ...input,
      id_usuario_admin: idUsuarioAdmin,
    });
  }
}