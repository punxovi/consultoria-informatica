import type { IncomingMessage, ServerResponse } from 'node:http';
import { failure, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { QuoteRequestsApplication } from '../application/quote-requests-service.ts';
import { quoteFilters,quoteId,quoteUpdateSchema,parseQuote } from '../domain/quote-requests.ts';
import { readJsonBody } from './body.ts';
export async function routeQuoteRequests(request:IncomingMessage,response:ServerResponse,requestId:string,application:QuoteRequestsApplication){
  const send=(status:number,body:unknown)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-request-id':requestId});response.end(JSON.stringify(body));};
  try{
    const header=request.headers.authorization;
    if(!header||!/^Bearer\s+\S+$/i.test(header))throw new ServiceError('SESION_REQUERIDA','Debes iniciar sesión.',401);
    const token=header.replace(/^Bearer\s+/i,'');
    const url=new URL(request.url??'/','http://organizations.local');
    if(request.method==='GET'&&url.pathname==='/v1/quote-requests')return send(200,success('SOLICITUDES_COTIZACION_LISTADAS','Solicitudes consultadas.',await application.list(token,quoteFilters(url))));
    const match=/^\/v1\/quote-requests\/([^/]+)(?:\/(status))?$/.exec(url.pathname);
    if(!match)throw new ServiceError('RUTA_NO_ENCONTRADA','La ruta no existe.',404);
    const id=quoteId(match[1]);
    if(url.search)throw new ServiceError('DATOS_INVALIDOS','Esta operación no admite filtros.',400);
    if(request.method==='GET'&&!match[2])return send(200,success('SOLICITUD_COTIZACION_CONSULTADA','Solicitud consultada.',{request:await application.get(token,id)}));
    if(request.method==='PATCH'){
      if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')throw new ServiceError('FORMATO_INVALIDO','Usa application/json.',415);
      const data=parseQuote(quoteUpdateSchema,await readJsonBody(request));
      return send(200,success('SOLICITUD_COTIZACION_ACTUALIZADA','Estado actualizado.',{request:await application.updateStatus(token,id,data.version_esperada,data.estado)}));
    }
    throw new ServiceError('METODO_NO_PERMITIDO','El método no está permitido.',405);
  }catch(error){const e=error instanceof ServiceError?error:new ServiceError('ERROR_INTERNO','No fue posible completar la operación.',500);send(e.status,failure(e.code,e.message,requestId));}
}
