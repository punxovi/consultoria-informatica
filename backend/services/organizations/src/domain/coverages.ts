export class CoberturaTemporalDomain {
  public id_permiso_temporal: string;
  public id_usuario_beneficiario: string;
  public id_usuario_otorga: string;
  public id_pais: string;
  public inicio_at: Date;
  public fin_at: Date;
  public motivo: string;
  public revocado_at: Date | null;
  public revocado_por: string | null;
  public motivo_revocacion: string | null;

  constructor(
    id_permiso_temporal: string,
    id_usuario_beneficiario: string,
    id_usuario_otorga: string,
    id_pais: string,
    inicio_at: Date,
    fin_at: Date,
    motivo: string,
    revocado_at: Date | null,
    revocado_por: string | null,
    motivo_revocacion: string | null
  ) {
    this.id_permiso_temporal = id_permiso_temporal;
    this.id_usuario_beneficiario = id_usuario_beneficiario;
    this.id_usuario_otorga = id_usuario_otorga;
    this.id_pais = id_pais;
    this.inicio_at = inicio_at;
    this.fin_at = fin_at;
    this.motivo = motivo;
    this.revocado_at = revocado_at;
    this.revocado_por = revocado_por;
    this.motivo_revocacion = motivo_revocacion;

    if (id_usuario_beneficiario === id_usuario_otorga) {
      throw new Error('Un administrador no puede otorgarse cobertura temporal a sí mismo.');
    }
    if (fin_at <= inicio_at) {
      throw new Error('La fecha de término debe ser posterior a la fecha de inicio.');
    }
    if (!motivo || motivo.trim() === '') {
      throw new Error('El motivo de la cobertura temporal es obligatorio.');
    }
  }
}