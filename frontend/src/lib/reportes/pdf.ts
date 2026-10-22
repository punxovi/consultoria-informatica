import { ApiError,createApiTransport } from '../api/transporte.ts';
export interface ReportFilters {
  fecha_inicio:string;fecha_termino:string;id_pais?:string;id_organizacion?:string;id_programa?:string;
  indicadores?:string[];resultados?:string[];destino?:'interno'|'donante'|'externo';
}
export interface ReportDownload { id:string;url:string;fileName:string;mimeType:'application/pdf';expiresAt:string }
export interface ReportPreview {
  destination:'interno'|'donante'|'externo';title:string;
  document:{title:string;destination:'interno'|'donante'|'externo';generatedAt:string;period:{start:string;end:string};filters:string[];
    summary:Array<{label:string;value:string}>;
    sections:Array<{key:string;title:string;columns:string[];rows:string[][];note?:string}>};
  download:ReportDownload;
}
const downloadPath=/^\/api\/v1\/reports\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/pdf$/i;
function validateDownload(value:ReportDownload):void {
  const match=typeof value?.url==='string'?value.url.match(downloadPath):null;
  if(!match||match[1]!==value.id||value.mimeType!=='application/pdf'
    ||!/^reporte-fge-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}-(interno|donante|externo)\.pdf$/.test(value.fileName)
    ||!Number.isFinite(Date.parse(value.expiresAt)))throw new ApiError('RESPUESTA_INVALIDA','El servicio no devolvió una referencia PDF válida.',502);
}
export function crearClienteReportesPdf(baseUrl:string,token:()=>Promise<string>,fetchImpl:typeof fetch=fetch) {
  const base=baseUrl.replace(/\/$/,''),http=createApiTransport(base,fetchImpl);
  return {
    async preparar(filters:ReportFilters):Promise<ReportPreview> {
      const query=new URLSearchParams();
      for(const [key,value] of Object.entries(filters))if(value!==undefined)query.set(key,Array.isArray(value)?value.join(','):value);
      const result=await http.request<{report:ReportPreview}>(`/api/v1/reports/consolidated?${query}`,{accessToken:await token()});
      const report=result.data?.report;
      if(!report?.document||!Array.isArray(report.document.sections))throw new ApiError('RESPUESTA_INVALIDA','No fue posible preparar la vista previa del reporte.',502);
      validateDownload(report.download);return report;
    },
    async descargar(reference:ReportDownload):Promise<{blob:Blob;fileName:string}> {
      validateDownload(reference);
      const accessToken=await token();let response:Response;
      try {response=await fetchImpl(`${base}${reference.url}`,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/pdf'},cache:'no-store'});}
      catch {throw new ApiError('PDF_DESCARGA_FALLIDA','No fue posible descargar el PDF. Intenta nuevamente.',0);}
      if(!response.ok){
        const body=await response.json().catch(()=>null);
        throw new ApiError(body?.error?.code??'PDF_DESCARGA_FALLIDA',body?.error?.message??'No fue posible descargar el PDF.',response.status,body?.error?.requestId);
      }
      if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new ApiError('RESPUESTA_INVALIDA','El servicio no entregó un archivo PDF.',502);
      let bytes:ArrayBuffer;
      try {bytes=await response.arrayBuffer();}catch{throw new ApiError('PDF_DESCARGA_FALLIDA','La descarga del PDF se interrumpió.',0);}
      const data=new Uint8Array(bytes),decode=new TextDecoder();
      if(data.length>12*1024*1024||decode.decode(data.subarray(0,5))!=='%PDF-'||!decode.decode(data.subarray(-64)).includes('%%EOF')) {
        throw new ApiError('RESPUESTA_INVALIDA','El PDF recibido está incompleto o no es válido.',502);
      }
      return {blob:new Blob([bytes],{type:'application/pdf'}),fileName:reference.fileName};
    },
  };
}
