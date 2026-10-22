import { randomUUID } from 'node:crypto';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { pdfFileName, type PdfDownload, type ReportDocument } from '../domain/report-document.ts';

interface Entry { actorId: string; document: ReportDocument; filters: Record<string,unknown>; expiresAt: number; size: number }
export class ReportStore {
  private entries = new Map<string,Entry>();
  private now:()=>number;
  private ttlMs:number;
  private maxBytes:number;
  constructor(now:()=>number=Date.now,ttlMs=300_000,maxBytes=32*1024*1024) {
    this.now=now;this.ttlMs=ttlMs;this.maxBytes=maxBytes;
  }
  private clean():void {
    for(const [id,entry] of this.entries) if(entry.expiresAt<=this.now())this.entries.delete(id);
  }
  put(actorId:string,document:ReportDocument,filters:Record<string,unknown>):PdfDownload {
    this.clean();
    const size=Buffer.byteLength(JSON.stringify({document,filters}),'utf8');
    const entries=[...this.entries.values()];
    if(entries.length>=64 || entries.filter(e=>e.actorId===actorId).length>=5 || entries.reduce((n,e)=>n+e.size,0)+size>this.maxBytes) {
      throw new ServiceError('REPORTES_EN_PREPARACION', 'Hay demasiados reportes preparados; espera a que caduquen antes de generar otro.', 429);
    }
    const id=randomUUID(), expiresAt=this.now()+this.ttlMs;
    this.entries.set(id,{actorId,document:structuredClone(document),filters:structuredClone(filters),expiresAt,size});
    return {id,url:`/api/v1/reports/${id}/pdf`,fileName:pdfFileName(document),mimeType:'application/pdf',expiresAt:new Date(expiresAt).toISOString()};
  }
  get(id:string,actorId:string):Entry {
    this.clean();
    const entry=this.entries.get(id);
    if(!entry || entry.actorId!==actorId)throw new ServiceError('REPORTE_NO_DISPONIBLE','El reporte no existe, caducó o no está disponible para tu usuario. Genera nuevamente la vista previa.',404);
    return structuredClone(entry);
  }
}
