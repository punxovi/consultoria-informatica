import { z } from 'zod';
import { ApiError, createApiTransport } from '../api/transporte.ts';
import { solicitudSchema, type Solicitud, type Estado } from './modelo.ts';
// Contrato propuesto para la API interna pendiente. No usar la ruta pública para datos privados.
export function crearClienteSolicitudes(base: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
  const http=createApiTransport(base,fetchImpl);
  function validar(data: unknown,id?:string): Solicitud {
    const r=solicitudSchema.safeParse(data);
    if(!r.success || (id && r.data.id_solicitud!==id))throw new ApiError('RESPUESTA_INVALIDA','La solicitud recibida no es válida.',502);
    return r.data;
  }
  return {
    async listar(){
      const r=await http.request<unknown>('/api/v1/quote-requests',{accessToken:await token()});
      const datos=z.object({requests:z.array(solicitudSchema)}).safeParse(r.data);
      if(!datos.success)throw new ApiError('RESPUESTA_INVALIDA','El listado recibido no es válido.',502);
      return datos.data.requests;
    },
    async obtener(id:string){
      const r=await http.request<{request:unknown}>(`/api/v1/quote-requests/${encodeURIComponent(id)}`,{accessToken:await token()});
      return validar(r.data?.request,id);
    },
    async actualizar(solicitud:Solicitud,estado:Estado){
      if(!solicitud.estados_permitidos.includes(estado)||estado===solicitud.estado)throw new Error('Selecciona un estado permitido.');
      const r=await http.request<{request:unknown}>(`/api/v1/quote-requests/${encodeURIComponent(solicitud.id_solicitud)}`,{method:'PATCH',accessToken:await token(),body:{version_esperada:solicitud.version,estado}});
      const actualizada=validar(r.data?.request,solicitud.id_solicitud);
      if(actualizada.estado!==estado || actualizada.version<=solicitud.version)throw new ApiError('RESPUESTA_INVALIDA','No se pudo verificar la actualización.',502);
      return actualizada;
    },
  };
}
export function mensajeError(error:unknown){
  if(error instanceof ApiError){
    if(error.code==='RUTA_NO_ENCONTRADA')return 'El servicio interno de solicitudes de cotización todavía no está disponible.';
    if(error.status===403)return 'No tienes permiso para consultar o gestionar esta solicitud en el territorio actual.';
    if(error.status===401)return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if(error.status===409)return 'La solicitud cambió en otra sesión. Vuelve a abrir el detalle antes de actualizarla.';
    if(error.status===404)return 'La solicitud ya no está disponible.';
  }
  return 'No fue posible completar la operación. Inténtalo nuevamente.';
}
