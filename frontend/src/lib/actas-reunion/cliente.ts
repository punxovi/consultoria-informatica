import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { camposCompromisoSchema } from '../compromisos/modelo.ts';
import { camposActaSchema, type ActaReunion, type CatalogoActas, type ServicioActasReunion } from './modelo.ts';

const catalogoSchema = z.object({
  puede_gestionar: z.boolean(),
  planes: z.array(z.object({ id_plan: z.uuid(), nombre: z.string().min(1) })),
  acciones: z.array(z.object({ id_accion: z.uuid(), id_plan: z.uuid(), nombre: z.string().min(1) })),
  asistentes: z.array(z.string().min(1)),
});
const registroSchema = camposActaSchema.extend({
  // La tabla histórica no registraba asistentes. Se pueden consultar y completar al editar.
  asistentes: z.array(z.string()),
  asistentes_externos: z.string().max(500),
  objetivo: z.string().max(1000),
  id_accion: z.string().uuid().nullable().transform(v => v ?? ''),
  observaciones: z.string().nullable().transform(v => v ?? ''),
  id_acta: z.uuid(), id_organizacion: z.uuid(), version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
  compromisos: z.array(camposCompromisoSchema.extend({
    responsable_contacto: z.string().nullable().transform(v => v ?? ''),
    observaciones: z.string().nullable().transform(v => v ?? ''),
    id_compromiso: z.uuid(), estado: z.enum(['pendiente', 'cumplido']),
  })).default([]),
}).strip();

export function crearClienteActas(http: ApiTransport, token: () => Promise<string>): ServicioActasReunion & {
  catalogo(org: string): Promise<CatalogoActas>;
  detalle(org: string, id: string): Promise<ActaReunion>;
} {
  const base = '/api/v1/meeting-minutes';
  function registro(data: unknown, org: string, id?: string): ActaReunion {
    const r = registroSchema.safeParse(data);
    if (!r.success || r.data.id_organizacion !== org || id && r.data.id_acta !== id) {
      throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el acta recibida.', 502);
    }
    return r.data;
  }
  return {
    async catalogo(org) {
      const r = await http.request<{ catalog: unknown }>(`${base}/catalog?id_organizacion=${encodeURIComponent(org)}`, { accessToken: await token() });
      const datos = catalogoSchema.safeParse(r.data?.catalog);
      if (!datos.success || datos.data.acciones.some(a => !datos.data.planes.some(p => p.id_plan === a.id_plan))) {
        throw new ApiError('RESPUESTA_INVALIDA', 'Las opciones del acta no son válidas.', 502);
      }
      return datos.data;
    },
    async obtener(org) {
      const r = await http.request<{ meetingMinutes: unknown[] }>(`${base}?id_organizacion=${encodeURIComponent(org)}`, { accessToken: await token() });
      if (!Array.isArray(r.data?.meetingMinutes)) throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el historial de actas.', 502);
      return r.data.meetingMinutes.map(a => registro(a, org));
    },
    async detalle(org, id) {
      const r = await http.request<{ meetingMinute: unknown }>(`${base}/${encodeURIComponent(id)}`, { accessToken: await token() });
      return registro(r.data?.meetingMinute, org, id);
    },
    async crear(org, entrada) {
      const campos = camposActaSchema.parse(entrada.campos);
      const r = await http.request<{ meetingMinute: unknown }>(base, {
        method: 'POST', accessToken: await token(), body: { ...campos, id_organizacion: org,
          id_accion: campos.id_accion || null, compromisos: (entrada.compromisos ?? []).map(c => camposCompromisoSchema.parse(c)) },
      });
      return registro(r.data?.meetingMinute, org);
    },
    async actualizar(org, id, version, entrada) {
      const campos = camposActaSchema.parse(entrada.campos);
      const r = await http.request<{ meetingMinute: unknown }>(`${base}/${encodeURIComponent(id)}`, {
        method: 'PATCH', accessToken: await token(), body: {
          version_esperada: version, cambios: { ...campos, id_accion: campos.id_accion || null },
        },
      });
      return registro(r.data?.meetingMinute, org, id);
    },
  };
}
