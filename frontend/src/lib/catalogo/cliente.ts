import { z } from 'zod';
import { createApiTransport, ApiError } from '../api/transporte.ts';
import { itemPublicoSchema, filtrarCatalogo } from './modelo.ts';
export function crearClienteCatalogo(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const http = createApiTransport(baseUrl, fetchImpl);
  return {
    async listar(idPais = '', idOrganizacion = '') {
      const parametros = new URLSearchParams();
      if (idPais) parametros.set('id_pais', idPais);
      if (idOrganizacion) parametros.set('id_organizacion', idOrganizacion);
      const query = parametros.size ? `?${parametros}` : '';
      const respuesta = await http.request<unknown>(`/api/v1/public/catalog${query}`);
      const datos = z.object({ items: z.array(itemPublicoSchema) }).safeParse(respuesta.data);
      if (!datos.success) throw new ApiError('RESPUESTA_INVALIDA', 'El catálogo recibido no es válido.', 502);
      return filtrarCatalogo(datos.data.items, '', '');
    },
  };
}
