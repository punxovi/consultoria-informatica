// backend/shared/contracts/src/coverages.contract.ts



export interface OtorgarCoberturaInput {
  id_usuario_beneficiario: string; // El Coordinador que recibe la cobertura
  id_pais: string;                 // El país adicional autorizado
  inicio_at: string;               // Fecha/hora de inicio (ISO 8601)
  fin_at: string;                  // Fecha/hora de término (ISO 8601)
  motivo: string;                  // Motivo justificado obligatorio
  permisos: string[];              // Lista de IDs de permisos específicos asociados
}

export interface ExtenderCoberturaInput {
  nueva_fin_at: string;            // Nueva fecha de término extendida
  motivo: string;                  // Motivo de la extensión
}

export interface RevocarCoberturaInput {
  motivo_revocacion: string;       // Motivo obligatorio para la revocación anticipada
}

export interface PermisoTemporalResponse {
  id_permiso_temporal: string;
  id_usuario_beneficiario: string;
  id_usuario_otorga: string;
  id_pais: string;
  inicio_at: string;
  fin_at: string;
  motivo: string;
  revocado_at: string | null;
  revocado_por: string | null;
  motivo_revocacion: string | null;
  created_at: string;
}