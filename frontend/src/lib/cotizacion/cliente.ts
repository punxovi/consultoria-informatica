import { z } from 'zod';
import { createApiTransport, ApiError } from '../api/transporte.ts';
import { prepararSolicitud, type Contacto, type Seleccion } from './modelo.ts';
export function crearClienteCotizacion(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const http = createApiTransport(baseUrl, fetchImpl);
  return {
    async enviar(contacto: Contacto, items: Seleccion) {
      const respuesta = await http.request<unknown>('/api/v1/public/quote-requests', { method: 'POST', body: prepararSolicitud(contacto, items) });
      const confirmacion = z.object({ quote: z.object({ id_solicitud: z.string().min(1), estado: z.literal('solicitada') }) }).safeParse(respuesta.data);
      if (!confirmacion.success) throw new ApiError('CONFIRMACION_INVALIDA', 'No se pudo verificar la confirmación de la solicitud.', 502);
      return confirmacion.data.quote;
    },
  };
}
