import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { guardarCompromisoSchema, type ServicioCompromisos, type ActaOrigen } from './modelo.ts';

const registroSchema = guardarCompromisoSchema.extend({
  id_compromiso: z.uuid(), id_organizacion: z.uuid(), version: z.number().int().positive(),
  responsable_contacto: z.string().nullable().transform(v => v ?? ''),
  observaciones: z.string().nullable().transform(v => v ?? ''),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
  cumplido_at: z.iso.datetime({ offset: true }).nullable(),
}).strip().refine(r => (r.estado === 'cumplido') === (r.cumplido_at !== null));
const catalogoSchema = z.object({ puede_gestionar:z.boolean(), actas:z.array(z.object({ id_acta: z.uuid(), nombre: z.string().min(1),
  id_plan: z.uuid(), id_accion: z.uuid().nullable().transform(v=>v ?? undefined) })) });
export function crearClienteCompromisos(http: ApiTransport, token: () => Promise<string>): ServicioCompromisos & {
  catalogo(org:string): Promise<{puede_gestionar:boolean;actas:ActaOrigen[]}>;
} {
  const base = (org: string) => `/api/v1/organizations/${encodeURIComponent(org)}/commitments`;
  function registro(data: unknown, org: string, id?: string) {
    const resultado = registroSchema.safeParse(data);
    if (!resultado.success || resultado.data.id_organizacion !== org || (id && resultado.data.id_compromiso !== id)) {
      throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el compromiso recibido.', 502);
    }
    return resultado.data;
  }
  async function catalogo(org:string) {
    const r=await http.request<unknown>(`${base(org)}/origins`,{accessToken:await token()});
    const datos=catalogoSchema.safeParse(r.data);
    if(!datos.success) throw new ApiError('RESPUESTA_INVALIDA','No fue posible consultar las actas de origen.',502);
    return datos.data;
  }
  return {
    catalogo,
    async listar(org) {
      const r = await http.request<{ compromisos: unknown[] }>(base(org), { accessToken: await token() });
      if (!Array.isArray(r.data?.compromisos)) throw new ApiError('RESPUESTA_INVALIDA', 'La lista recibida no es válida.', 502);
      return r.data.compromisos.map(c => registro(c, org));
    },
    async actas(org) {
      return (await catalogo(org)).actas;
    },
    async obtener(org, id) {
      const r = await http.request<{ compromiso: unknown }>(`${base(org)}/${encodeURIComponent(id)}`, { accessToken: await token() });
      return registro(r.data?.compromiso, org, id);
    },
    async crear(org, entrada) {
      const r = await http.request<{ compromiso: unknown }>(base(org), { method: 'POST', accessToken: await token(), body: guardarCompromisoSchema.parse({ ...entrada, estado: 'pendiente' }) });
      return registro(r.data?.compromiso, org);
    },
    async actualizar(org, id, version, entrada) {
      const {id_acta: _acta, ...cambios}=guardarCompromisoSchema.parse(entrada);
      z.number().int().positive().parse(version);
      const r = await http.request<{ compromiso: unknown }>(`${base(org)}/${encodeURIComponent(id)}`, {
        method: 'PATCH', accessToken: await token(), body: { cambios, version_esperada: version },
      });
      return registro(r.data?.compromiso, org, id);
    },
  };
}
