import { ApiError, createApiTransport } from '../api/transporte.ts';
import { paginaSchema, parametros, type Filtros } from './modelo.ts';

export function crearClienteAuditoria(baseUrl: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
  const http = createApiTransport(baseUrl, fetchImpl);
  return {
    async consultar(filtros: Filtros, cursor?: string) {
      const query = parametros(filtros, cursor);
      const respuesta = await http.request<unknown>(`/api/v1/audit/events?${query}`, { accessToken: await token() });
      const pagina = paginaSchema.safeParse(respuesta.data);
      if (!pagina.success) throw new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió un historial inválido.', 502);
      return pagina.data;
    },
  };
}
export function mensajeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'RUTA_NO_ENCONTRADA') return 'El servicio de consulta de auditoría todavía no está disponible.';
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (error.status === 403) return 'Solo el Administrador puede consultar la auditoría.';
  }
  return 'No fue posible consultar el historial. Inténtalo nuevamente.';
}
