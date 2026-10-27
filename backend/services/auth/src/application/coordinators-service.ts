import type { CoordinatorRepository, Coordinator, CreateCoordinator, EditCoordinator } from '../domain/coordinators.ts';

export function createCoordinatorApplication(repository: CoordinatorRepository) {
  return {
    // Authorization runs before parsing/reading privileged resources in HTTP and is
    // checked again inside every database operation, including the provisioning trigger.
    authorize: (token: string) => repository.execute(token, 'authorize', {}),
    list: (token: string): Promise<Coordinator[]> => repository.execute(token, 'list', {}),
    get: (token: string, id: string): Promise<Coordinator> => repository.execute(token, 'get', { id_usuario: id }),
    async create(token: string, input: CreateCoordinator) {
      repository.assertProvisioningConfigured();
      const reservation = await repository.execute(token, 'prepare', input);
      // Retry a previously committed Auth creation without creating another identity.
      const id = reservation.id_usuario ?? await repository.provision(input, reservation.id_solicitud);
      const coordinator = await repository.execute(token, 'get', { id_usuario: id });
      const accessSent = await repository.sendAccess(input.correo);
      return { coordinator, acceso: accessSent ? 'enlace_enviado' : 'recuperacion_pendiente' };
    },
    update: (token: string, id: string, input: EditCoordinator): Promise<Coordinator> => repository.execute(token, 'edit', { id_usuario: id, ...input }),
    state: (token: string, id: string, version: number, active: boolean): Promise<Coordinator> => repository.execute(token, active ? 'activate' : 'deactivate', { id_usuario: id, version_esperada: version }),
  };
}
export type CoordinatorApplication = ReturnType<typeof createCoordinatorApplication>;
