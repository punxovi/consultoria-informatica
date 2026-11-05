import { createQuoteRepository, type QuoteOptions } from '../infrastructure/supabase-quote-requests.repository.ts';
export function createQuoteRequestsApplication(options:QuoteOptions) {
  const repository=createQuoteRepository(options);
  return {
    list:(token:string,filters:Record<string,unknown>={})=>repository.execute('list',filters,token),
    get:(token:string,id:string)=>repository.execute('get',{id_solicitud:id},token),
    updateStatus:(token:string,id:string,version:number,status:string)=>repository.execute('update',{id_solicitud:id,version_esperada:version,estado:status},token),
  };
}
export type QuoteRequestsApplication=ReturnType<typeof createQuoteRequestsApplication>;
