import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { guardarCompromisoSchema, type ServicioCompromisos } from './modelo.ts';

const registroSchema = guardarCompromisoSchema.extend({
  id_compromiso: z.string().min(1), id_organizacion: z.string().min(1), version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
  cumplido_at: z.iso.datetime({ offset: true }).nullable(),
}).refine(r => (r.estado === 'cumplido') === (r.cumplido_at !== null));
const actasSchema = z.array(z.object({ id_acta: z.string().min(1), nombre: z.string().min(1),
  id_plan: z.string().optional(), id_accion: z.string().optional() }));
export function crearClienteCompromisos(http: ApiTransport, token: () => Promise<string>): ServicioCompromisos {
  const base = (org: string) => `/api/v1/organizations/${encodeURIComponent(org)}/commitments`;
  function registro(data: unknown, org: string, id?: string) {
    const resultado = registroSchema.safeParse(data);
    if (!resultado.success || resultado.data.id_organizacion !== org || (id && resultado.data.id_compromiso !== id)) {
      throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el compromiso recibido.', 502);
    }
    return resultado.data;
  }
  return {
    async listar(org) {
      const r = await http.request<{ compromisos: unknown[] }>(base(org), { accessToken: await token() });
      if (!Array.isArray(r.data?.compromisos)) throw new ApiError('RESPUESTA_INVALIDA', 'La lista recibida no es válida.', 502);
      return r.data.compromisos.map(c => registro(c, org));
    },
    async actas(org) {
      const r = await http.request<{ actas: unknown }>(`${base(org)}/origins`, { accessToken: await token() });
      const datos = actasSchema.safeParse(r.data?.actas);
      if (!datos.success) throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible consultar las actas de origen.', 502);
      return datos.data;
    },
    async obtener(org, id) {
      const r = await http.request<{ compromiso: unknown }>(`${base(org)}/${encodeURIComponent(id)}`, { accessToken: await token() });
      return registro(r.data?.compromiso, org, id);
    },
    async crear(org, entrada) {
      const r = await http.request<{ compromiso: unknown }>(base(org), { method: 'POST', accessToken: await token(), body: { ...entrada, estado: 'pendiente' } });
      return registro(r.data?.compromiso, org);
    },
    async actualizar(org, id, version, entrada) {
      const r = await http.request<{ compromiso: unknown }>(`${base(org)}/${encodeURIComponent(id)}`, {
        method: 'PATCH', accessToken: await token(), body: { ...entrada, version_esperada: version },
      });
      return registro(r.data?.compromiso, org, id);
    },
  };
}
