import type { ExtenderCoberturaInput, PermisoTemporalResponse } from '@backend/shared-contracts';

export interface ExtenderCoberturaRepository {
  buscarPorId(idPermisoTemporal: string): Promise<PermisoTemporalResponse | null>;
  extender(idPermisoTemporal: string, data: ExtenderCoberturaInput & { id_usuario_admin: string }): Promise<PermisoTemporalResponse>;
}

export class ExtenderCoberturaUseCase {
  private coberturaRepo: ExtenderCoberturaRepository;

  constructor(coberturaRepo: ExtenderCoberturaRepository) {
    this.coberturaRepo = coberturaRepo;
  }

  async ejecutar(idPermisoTemporal: string, input: ExtenderCoberturaInput, idUsuarioAdmin: string): Promise<PermisoTemporalResponse> {
    const coberturaActual = await this.coberturaRepo.buscarPorId(idPermisoTemporal);
    if (!coberturaActual) {
      throw new Error('La cobertura temporal especificada no existe.');
    }

    const nuevaFechaFin = new Date(input.nueva_fin_at);
    const fechaInicio = new Date(coberturaActual.inicio_at);

    if (nuevaFechaFin <= fechaInicio) {
      throw new Error('La nueva fecha de término debe ser posterior a la fecha de inicio original.');
    }

    return await this.coberturaRepo.extender(idPermisoTemporal, {
      ...input,
      id_usuario_admin: idUsuarioAdmin,
    });
  }
}