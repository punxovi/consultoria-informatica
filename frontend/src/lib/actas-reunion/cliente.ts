
import type { ApiTransport } from '../api/transporte.ts';
import type { AdjuntoActa, ActaReunion, CatalogoActas } from './modelo.ts';

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
      return data.catalog;
    },

    async obtener(organizacionId: string): Promise<ActaReunion[]> {
      const data = await solicitar<{ meetingMinutes: ActaReunion[] }>(
        `${base}?id_organizacion=${encodeURIComponent(organizacionId)}`,
      );
      return data.meetingMinutes;
    },

    async detalle(organizacionId: string, actaId: string): Promise<ActaReunion> {
      const data = await solicitar<{ meetingMinute: ActaReunion }>(
        `${base}/${encodeURIComponent(actaId)}?organization_id=${encodeURIComponent(organizacionId)}`,
      );
      return data.meetingMinute;
    },

    async crear(organizacionId: string, entrada: unknown): Promise<ActaReunion> {
      const data = await solicitar<{ meetingMinute: ActaReunion }>(base, {
        method: 'POST',
        body: { ...(entrada as object), organization_id: organizacionId },
      });
      return data.meetingMinute;
    },

    async actualizar(
      organizacionId: string,
      actaId: string,
      version: number,
      entrada: unknown,
    ): Promise<ActaReunion> {
      const data = await solicitar<{ meetingMinute: ActaReunion }>(
        `${base}/${encodeURIComponent(actaId)}`,
        {
          method: 'PUT',
          body: {
            ...(entrada as object),
            organization_id: organizacionId,
            version,
          },
        },
      );
      return data.meetingMinute;
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
