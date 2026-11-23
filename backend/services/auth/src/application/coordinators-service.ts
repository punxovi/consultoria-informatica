import type { CoordinatorRepository, Coordinator, CreateCoordinator, EditCoordinator } from '../domain/coordinators.ts';
import { CoordinatorError } from '../domain/coordinators.ts';

export function createCoordinatorApplication(repository: CoordinatorRepository) {
  return {
    authorize: (token: string) => repository.execute(token, 'authorize', {}),
    list: (token: string): Promise<Coordinator[]> => repository.execute(token, 'list', {}),
    get: (token: string, id: string): Promise<Coordinator> => repository.execute(token, 'get', { id_usuario: id }),
    async create(token: string, input: CreateCoordinator) {
      repository.assertProvisioningConfigured();
      const reservation = await repository.execute(token, 'prepare', input);
      let coordinator = await repository.execute(token, 'complete', { id_solicitud: reservation.id_solicitud });
      if (!coordinator) {
        const id = reservation.id_usuario ?? await repository.provision(input, reservation.id_solicitud);
        coordinator = await repository.execute(token, 'complete', { id_solicitud: reservation.id_solicitud, id_usuario: id });
      }
      if (!coordinator) throw new CoordinatorError('ALTA_COORDINADOR_PENDIENTE', 'La identidad fue creada, pero su cuenta aún no pudo completarse. Reintenta la operación.', 503);
      const accessSent = await repository.sendAccess(input.correo);
      return { coordinator, acceso: accessSent ? 'enlace_enviado' : 'recuperacion_pendiente' };
    },
    update: (token: string, id: string, input: EditCoordinator): Promise<Coordinator> => repository.execute(token, 'edit', { id_usuario: id, ...input }),
    state: (token: string, id: string, version: number, active: boolean): Promise<Coordinator> => repository.execute(token, active ? 'activate' : 'deactivate', { id_usuario: id, version_esperada: version }),
  };
}
export type CoordinatorApplication = ReturnType<typeof createCoordinatorApplication>;
