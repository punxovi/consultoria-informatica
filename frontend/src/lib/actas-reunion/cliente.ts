import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { camposCompromisoSchema } from '../compromisos/modelo.ts';
import { camposActaSchema, type AdjuntoActa, type ActaReunion, type CatalogoActas, type GuardarActa } from './modelo.ts';

const catalogoSchema = z.object({
  puede_gestionar: z.boolean(),
  planes: z.array(z.object({ id_plan: z.uuid(), nombre: z.string().min(1) })),
  acciones: z.array(z.object({ id_accion: z.uuid(), id_plan: z.uuid(), nombre: z.string().min(1) })),
  asistentes: z.array(z.string().min(1)),
});

const registroSchema = camposActaSchema.extend({
  asistentes: z.array(z.string()),
  asistentes_externos: z.string().max(500),
  objetivo: z.string().max(1000),
  id_accion: z.uuid().nullable().transform(v => v ?? ''),
  observaciones: z.string().nullable().transform(v => v ?? ''),
  id_acta: z.uuid(),
  id_organizacion: z.uuid(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  compromisos: z.array(camposCompromisoSchema.extend({
    responsable_contacto: z.string().nullable().transform(v => v ?? ''),
    observaciones: z.string().nullable().transform(v => v ?? ''),
    id_compromiso: z.uuid(),
    estado: z.enum(['pendiente', 'cumplido']),
  })).default([]),
}).strip();

function registro(data: unknown, org: string, id?: string): ActaReunion {
  const resultado = registroSchema.safeParse(data);
  if (!resultado.success || resultado.data.id_organizacion !== org || (id && resultado.data.id_acta !== id)) {
    throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el acta recibida.', 502);
  }
  return resultado.data;
}

type ObtenerToken = () => Promise<string>;

export function crearClienteActas(http: ApiTransport, obtenerToken: ObtenerToken) {
  const base = '/api/v1/meeting-minutes';

  async function solicitar<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await http.request<T>(path, {
      method: options.method ?? 'GET',
      body: options.body,
      accessToken: await obtenerToken(),
    });
    return response.data;
  }

  async function binario(
    path: string,
    options: { method?: string; body?: BodyInit; contentType?: string } = {},
  ): Promise<Response> {
    const response = await fetch(
      `${import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'}${path}`,
      {
        method: options.method ?? 'GET',
        headers: {
          authorization: `Bearer ${await obtenerToken()}`,
          ...(options.contentType ? { 'content-type': options.contentType } : {}),
        },
        body: options.body,
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw new Error(await response.text() || `Error HTTP ${response.status}`);
    }

    return response;
  }

  return {
    async catalogo(organizacionId: string): Promise<CatalogoActas> {
      const data = await solicitar<{ catalog: CatalogoActas }>(
        `${base}/catalog?id_organizacion=${encodeURIComponent(organizacionId)}`,
      );
      const resultado = catalogoSchema.safeParse(data.catalog);
      if (!resultado.success || resultado.data.acciones.some(a => !resultado.data.planes.some(p => p.id_plan === a.id_plan))) {
        throw new ApiError('RESPUESTA_INVALIDA', 'Las opciones del acta no son válidas.', 502);
      }
      return resultado.data;
    },

    async obtener(organizacionId: string): Promise<ActaReunion[]> {
      const data = await solicitar<{ meetingMinutes: ActaReunion[] }>(
        `${base}?id_organizacion=${encodeURIComponent(organizacionId)}`,
      );
      if (!Array.isArray(data.meetingMinutes)) {
        throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el historial de actas.', 502);
      }
      return data.meetingMinutes.map(acta => registro(acta, organizacionId));
    },

    async detalle(organizacionId: string, actaId: string): Promise<ActaReunion> {
      const data = await solicitar<{ meetingMinute: ActaReunion }>(
        `${base}/${encodeURIComponent(actaId)}`,
      );
      return registro(data.meetingMinute, organizacionId, actaId);
    },

    async crear(organizacionId: string, entrada: GuardarActa): Promise<ActaReunion> {
      const campos = camposActaSchema.parse(entrada.campos);
      const data = await solicitar<{ meetingMinute: ActaReunion }>(base, {
        method: 'POST',
        body: {
          ...campos,
          id_organizacion: organizacionId,
          id_accion: campos.id_accion || null,
          compromisos: (entrada.compromisos ?? []).map(c => camposCompromisoSchema.parse(c)),
        },
      });
      return registro(data.meetingMinute, organizacionId);
    },

    async actualizar(
      organizacionId: string,
      actaId: string,
      version: number,
      entrada: GuardarActa,
    ): Promise<ActaReunion> {
      const campos = camposActaSchema.parse(entrada.campos);
      const data = await solicitar<{ meetingMinute: ActaReunion }>(
        `${base}/${encodeURIComponent(actaId)}`,
        {
          method: 'PATCH',
          body: {
            version_esperada: version,
            cambios: { ...campos, id_accion: campos.id_accion || null },
          },
        },
      );
      return registro(data.meetingMinute, organizacionId, actaId);
    },

    async listarAdjuntos(organizacionId: string, actaId: string): Promise<AdjuntoActa[]> {
      const data = await solicitar<{ attachments: AdjuntoActa[] }>(
        `${base}/${encodeURIComponent(actaId)}/attachments?id_organizacion=${encodeURIComponent(organizacionId)}`,
      );
      return data.attachments;
    },

    async reservarAdjunto(
      organizacionId: string,
      actaId: string,
      archivo: File,
    ): Promise<AdjuntoActa> {
      const data = await solicitar<{ attachment: AdjuntoActa }>(
        `${base}/${encodeURIComponent(actaId)}/attachments`,
        {
          method: 'POST',
          body: {
            id_organizacion: organizacionId,
            id_acta: actaId,
            nombre_original: archivo.name,
            mime_type: archivo.type,
            tamano_bytes: archivo.size,
          },
        },
      );
      return data.attachment;
    },

    async subirAdjunto(adjunto: AdjuntoActa, archivo: File): Promise<AdjuntoActa> {
      const response = await binario(
        `/api/v1/meeting-minute-attachments/${encodeURIComponent(adjunto.id_adjunto)}/file?version_esperada=${adjunto.version}`,
        { method: 'PUT', body: archivo, contentType: archivo.type },
      );
      const resultado = await response.json() as {
        data?: { attachment?: AdjuntoActa };
      };
      if (!resultado.data?.attachment) {
        throw new Error('No se recibió la información del archivo cargado.');
      }
      return resultado.data.attachment;
    },

    async descargarAdjunto(adjunto: AdjuntoActa): Promise<Blob> {
      const response = await binario(
        `/api/v1/meeting-minute-attachments/${encodeURIComponent(adjunto.id_adjunto)}/file`,
      );
      return response.blob();
    },

    async eliminarAdjunto(adjunto: AdjuntoActa): Promise<void> {
      await solicitar(
        `/api/v1/meeting-minute-attachments/${adjunto.id_adjunto}`,
        {
          method: 'DELETE',
        },
      );
    },
  };
}
