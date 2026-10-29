import { CoberturaTemporalDomain } from '../../domain/coverages.ts';
import type { OtorgarCoberturaInput, PermisoTemporalResponse } from '@backend/shared-contracts';

export interface OtorgarCoberturaRepository {
  otorgar(data: OtorgarCoberturaInput & { id_usuario_otorga: string }): Promise<PermisoTemporalResponse>;
}

export class OtorgarCoberturaUseCase {
  private coberturaRepo: OtorgarCoberturaRepository;

  constructor(coberturaRepo: OtorgarCoberturaRepository) {
    this.coberturaRepo = coberturaRepo;
  }

  async ejecutar(input: OtorgarCoberturaInput, idUsuarioAdmin: string): Promise<PermisoTemporalResponse> {
    // Validar reglas de dominio creando la instancia temporal
    new CoberturaTemporalDomain(
      '', // ID temporal para validación
      input.id_usuario_beneficiario,
      idUsuarioAdmin,
      input.id_pais,
      new Date(input.inicio_at),
      new Date(input.fin_at),
      input.motivo,
      null,
      null,
      null
    );

    // Ejecutar persistencia a través del repositorio
    return await this.coberturaRepo.otorgar({
      ...input,
      id_usuario_otorga: idUsuarioAdmin,
    });
  }
}