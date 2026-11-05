import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { quoteConfirmationSchema, quotePageSchema, privateQuoteSchema } from '../domain/quote-requests.ts';
export interface QuoteOptions { supabaseUrl:string; anonKey:string; fetchImpl?:typeof fetch }
export function createQuoteRepository(options:QuoteOptions) {
  return { async execute(operation:string,data:Record<string,unknown>,token?:string,publicRequest=false) {
    if(!options.supabaseUrl||!options.anonKey)throw new ServiceError('CONFIGURACION_SUPABASE','Falta configurar la conexión del Backend con Supabase.',503);
    if(!publicRequest&&!token)throw new ServiceError('SESION_REQUERIDA','Debes iniciar sesión.',401);
    let response:Response;
    try{response=await(options.fetchImpl??fetch)(`${options.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${publicRequest?'registrar_solicitud_cotizacion':'gestionar_solicitudes_cotizacion'}`,{
      method:'POST',headers:{apikey:options.anonKey,'content-type':'application/json',...(!publicRequest?{authorization:`Bearer ${token}`}:{})},
      body:JSON.stringify(publicRequest?{p_datos:data}:{p_operacion:operation,p_datos:data}),signal:AbortSignal.timeout(10000),
    });}catch{throw new ServiceError('SUPABASE_NO_DISPONIBLE','No fue posible conectar con el servicio de solicitudes.',503);}
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      const codes:Record<string,[string,string,number]>={
        '42501':['SIN_PERMISO','No tienes permiso para gestionar estas solicitudes.',403],
        '22023':['DATOS_INVALIDOS','Revisa los datos y cantidades de la solicitud.',400],
        '22P02':['DATOS_INVALIDOS','El formato de los datos no es válido.',400],
        '23514':['DATOS_INVALIDOS','La solicitud no cumple las restricciones del modelo.',400],
        '23505':['DATOS_INVALIDOS','La solicitud contiene productos repetidos.',400],
        '40001':['CONFLICTO_CONCURRENCIA','La solicitud cambió. Recarga antes de actualizarla.',409],
        P0166:['PRODUCTO_NO_DISPONIBLE','Uno de los productos ya no está disponible para cotizar.',409],
        P0167:['RESPONSABLE_NO_DISPONIBLE','No es posible asignar la solicitud en este momento. Inténtalo más tarde.',503],
        P0168:['SOLICITUD_NO_ENCONTRADA','La solicitud no existe o no está disponible para tu usuario.',404],
        P0169:['FILTRO_NO_ENCONTRADO','El país del filtro no está disponible.',404],
        PGRST202:['MIGRACION_PENDIENTE','Falta aplicar la migración de solicitudes de cotización.',503],
        '42883':['MIGRACION_PENDIENTE','Falta aplicar la migración de solicitudes de cotización.',503],
      };
      if(response.status===401)throw new ServiceError(publicRequest?'CONFIGURACION_SUPABASE':'SESION_INVALIDA',publicRequest?'El servicio público no está disponible.':'Tu sesión no es válida o ha expirado.',publicRequest?503:401);
      const error=codes[result?.code];if(error)throw new ServiceError(...error);
      throw new ServiceError('SOLICITUD_NO_PROCESADA','No fue posible procesar la solicitud.',response.status===429?429:503);
    }
    const schema=publicRequest?quoteConfirmationSchema:operation==='list'?quotePageSchema:privateQuoteSchema;
    const parsed=schema.safeParse(result);
    if(!parsed.success)throw new ServiceError('RESPUESTA_INVALIDA','El servicio devolvió un contrato de solicitudes inválido.',502);
    return parsed.data;
  }};
}
