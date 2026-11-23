import { z } from 'zod';
import { ApiError, createApiTransport } from '../api/transporte.ts';

export const solicitudInvitadoSchema = z.object({
  id_invitado: z.uuid(), nombre: z.string(), correo: z.string(),
  institucion: z.string().nullish(), motivo: z.string().nullish(),
  estado: z.enum(['pendiente', 'aprobado', 'rechazado', 'revocado']),
  version: z.number().int().positive(), created_at: z.string(),
  utilizado_en: z.string().nullish(), expira_en: z.string().nullish(),
});
export type SolicitudInvitado = z.infer<typeof solicitudInvitadoSchema>;
export type AccionInvitado = 'approve' | 'reject' | 'revoke';
const estadoEsperado = { approve: 'aprobado', reject: 'rechazado', revoke: 'revocado' } as const;
export function crearClienteInvitados(base: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
  const http = createApiTransport(base, fetchImpl);
  function validar(value: unknown) {
    const resultado = solicitudInvitadoSchema.safeParse(value);
    if (!resultado.success) throw new ApiError('RESPUESTA_INVALIDA', 'La respuesta de solicitudes no es válida.', 502);
    return resultado.data;
  }
  return {
    async listar() {
      const { data } = await http.request<{ guests: unknown[] }>('/api/v1/guests', { accessToken: await token() });
      if (!Array.isArray(data?.guests)) throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el listado.', 502);
      return data.guests.map(validar);
    },
    async resolver(solicitud: SolicitudInvitado, accion: AccionInvitado) {
      const { data } = await http.request<{ guest: unknown }>(`/api/v1/guests/${encodeURIComponent(solicitud.id_invitado)}/${accion}`, {
        method: 'POST', accessToken: await token(), body: { version_esperada: solicitud.version },
      });
      const resultado = validar(data?.guest);
      const reenvio = accion === 'approve' && solicitud.estado === 'aprobado';
      if (resultado.id_invitado !== solicitud.id_invitado || resultado.estado !== estadoEsperado[accion]
        || (reenvio ? resultado.version < solicitud.version : resultado.version <= solicitud.version))
        throw new ApiError('RESPUESTA_INVALIDA', 'El servicio no confirmó la decisión. Recarga la página antes de reintentar.', 502);
      return resultado;
    },
  };
}
