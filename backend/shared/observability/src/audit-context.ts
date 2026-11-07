import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import { createServer, type RequestListener, type IncomingMessage } from 'node:http';

interface AuditContext { ip?: string; requestId?: string }
const storage = new AsyncLocalStorage<AuditContext>();
const normalize = (value: string) => value.replace(/^::ffff:/, '');
export function auditRequestContext(request: IncomingMessage, trustLoopback = true): AuditContext {
  const peer = normalize(request.socket.remoteAddress ?? '');
  const trusted = (process.env.AUDIT_TRUSTED_PROXY_IPS ?? '').split(',').map(v=>normalize(v.trim()));
  const acceptsProxy = trusted.includes(peer) || (trustLoopback && ['127.0.0.1','::1'].includes(peer));
  const forwarded = request.headers['x-fge-ip-origen'];
  const candidate = acceptsProxy && typeof forwarded === 'string' && isIP(normalize(forwarded)) ? normalize(forwarded) : peer;
  const id = request.headers['x-request-id'];
  return {ip:isIP(candidate)?candidate:undefined,requestId:typeof id==='string'&&id.trim()?id.trim().slice(0,128):randomUUID()};
}
export function createAuditedServer(listener: RequestListener, trustLoopback = true) {
  return createServer((req,res)=>{
    const context=auditRequestContext(req,trustLoopback);
    req.headers['x-request-id']=context.requestId;
    return storage.run(context,()=>listener(req,res));
  });
}
export function auditHeaders(): Record<string,string> {
  const context = storage.getStore();
  return {...(context?.ip?{'x-fge-ip-origen':context.ip}:{}),...(context?.requestId?{'x-fge-request-id':context.requestId}:{})};
}
/** Añade contexto aislado por petición únicamente al origen Supabase configurado. */
export function withAuditFetch(fetchImpl: typeof fetch, supabaseUrl: string): typeof fetch {
  const origin = new URL(supabaseUrl || 'https://unconfigured.invalid').origin;
  return async (input,init) => {
    if(new URL(typeof input==='string'||input instanceof URL?input:input.url).origin!==origin) return fetchImpl(input,init);
    const headers=new Headers(init?.headers ?? (input instanceof Request?input.headers:undefined));
    for(const [key,value] of Object.entries(auditHeaders())) headers.set(key,value);
    return fetchImpl(input,{...init,headers:Object.fromEntries(headers.entries())});
  };
}
