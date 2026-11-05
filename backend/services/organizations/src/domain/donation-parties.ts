import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export type DonationParty =
  | { tipo: 'organizacion'; id_organizacion: string; id_pais: string | null }
  | { tipo: 'contraparte'; nombre: string };
export interface DonationParties { emisor: DonationParty; receptor: DonationParty }

const movementSchema = z.object({
  id_organizacion: z.uuid(),
  // Compatibilidad con respuestas históricas; la base actual exige país por FK compuesta.
  id_pais: z.uuid().optional(),
  tipo_movimiento: z.enum(['recibida', 'entregada']),
  contraparte_nombre: z.string().trim().min(1),
});

/** El movimiento siempre se interpreta desde la organización de la fila. */
export function identifyDonationParties(value: unknown): DonationParties {
  const parsed = movementSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible identificar al emisor y receptor de la donación.', 502);
  }
  const data = parsed.data;
  const organization: DonationParty = {
    tipo: 'organizacion', id_organizacion: data.id_organizacion, id_pais: data.id_pais ?? null,
  };
  const counterpart: DonationParty = { tipo: 'contraparte', nombre: data.contraparte_nombre };
  return data.tipo_movimiento === 'recibida'
    ? { emisor: counterpart, receptor: organization }
    : { emisor: organization, receptor: counterpart };
}
