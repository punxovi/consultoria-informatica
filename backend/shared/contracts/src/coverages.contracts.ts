export type OtorgarCoberturaInput = {
  id_usuario_beneficiario: string;
  id_pais: string;
  inicio_at: string;
  fin_at: string;
  motivo: string;
};
export type ExtenderCoberturaInput = {
  version_esperada: number;
  nueva_fin_at: string;
  motivo?: string;
};
export type RevocarCoberturaInput = {
  version_esperada: number;
  motivo_revocacion: string;
};
export type PermisoTemporalResponse = {
  id_permiso_temporal: string;
  id_usuario_beneficiario: string;
  coordinador_nombre: string;
  id_pais: string;
  pais_nombre: string;
  inicio_at: string;
  fin_at: string;
  motivo: string;
  revocado_at: string | null;
  version: number;
  condicion: 'futura' | 'vigente' | 'vencida' | 'revocada';
  puede_extender: boolean;
  puede_revocar: boolean;
};
export type EventoHistorialCoberturaResponse = {
  id_historial: string;
  id_permiso_temporal: string;
  tipo_evento: 'OTORGAR' | 'EXTENDER' | 'REVOCAR';
  fin_at_anterior: string | null;
  fin_at_nuevo: string | null;
  motivo: string;
  accion_por: string;
  accion_por_nombre: string;
  accion_at: string;
};
export type CoberturaContextoResponse = {
  id_permiso_temporal: string;
  id_pais: string;
  inicio_at: string;
  fin_at: string;
};
