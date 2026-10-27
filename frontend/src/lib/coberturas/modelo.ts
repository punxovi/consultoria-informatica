export type CondicionVigencia =
  | 'vigente'
  | 'futura'
  | 'vencida'
  | 'revocada';

export interface CoberturaTemporal {
  id_permiso_temporal: string;
  id_usuario_beneficiario: string;
  coordinador_nombre: string;
  id_pais: string;
  pais_nombre: string;
  motivo: string;
  inicio_at: string;
  fin_at: string;
  revocado_at: string | null;
  version: number;
}

export interface CoberturaTemporalVista extends CoberturaTemporal {
  condicion: CondicionVigencia;
  puedeExtender: boolean;
  puedeRevocar: boolean;
}

export interface CrearCoberturaFormulario {
  id_usuario_beneficiario: string;
  id_pais: string;
  motivo: string;
  fecha_inicio: string;
  fecha_termino: string;
}