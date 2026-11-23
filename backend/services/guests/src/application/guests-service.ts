import type { GuestRepository, Guest, CreateGuestInput, ReviewGuestInput } from '../domain/guests.ts';
import { GuestError } from '../domain/guests.ts';

export function createGuestApplication(repository: GuestRepository) {
  return {
    authorize: (token: string) => repository.execute(token, 'authorize', {}),
    
    list: (token: string): Promise<Guest[]> => repository.execute(token, 'list', {}),
    
    get: (token: string, id: string): Promise<Guest> => repository.execute(token, 'get', { id_invitado: id }),
    consume: (token: string): Promise<Guest> => repository.execute(token, 'consume', {}),
    
    async create(input: CreateGuestInput): Promise<Guest> {
      const guest = await repository.execute('', 'create', input);
      if (!guest) {
        throw new GuestError('ERROR_REGISTRO', 'No fue posible registrar la solicitud de invitado.', 500);
      }
      return guest;
    },
    
    async approve(token: string, id: string, input: ReviewGuestInput): Promise<Guest> {
      const result = await repository.execute(token, 'approve', { id_invitado: id, ...input });
      if (!result) {
        throw new GuestError('INVITADO_NO_ENCONTRADO', 'La solicitud de invitado no existe.', 404);
      }
      
      if (typeof result.correo !== 'string' || !result.correo) {
        throw new GuestError('RESPUESTA_INVALIDA', 'No fue posible preparar el correo de acceso.', 502);
      }
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4321';
      const accessLink = process.env.GUEST_ACCESS_REDIRECT_URL ?? `${frontendUrl.replace(/\/$/, '')}/invitado/acceso`;
      if (!await repository.sendGuestAccessLink(result.correo, accessLink)) {
        throw new GuestError('ENVIO_ENLACE_FALLIDO', 'La solicitud quedó aprobada, pero no fue posible enviar el enlace. Recarga y reintenta la aprobación.', 502);
      }
      
      return result;
    },
    
    async reject(token: string, id: string, input: ReviewGuestInput): Promise<Guest> {
      const result = await repository.execute(token, 'reject', { id_invitado: id, ...input });
      if (!result) {
        throw new GuestError('INVITADO_NO_ENCONTRADO', 'La solicitud de invitado no existe.', 404);
      }
      return result;
    },
    
    async revoke(token: string, id: string, input: ReviewGuestInput): Promise<Guest> {
      const result = await repository.execute(token, 'revoke', { id_invitado: id, ...input });
      if (!result) {
        throw new GuestError('INVITADO_NO_ENCONTRADO', 'El acceso de invitado no existe.', 404);
      }
      return result;
    },
  };
}

export type GuestApplication = ReturnType<typeof createGuestApplication>;
