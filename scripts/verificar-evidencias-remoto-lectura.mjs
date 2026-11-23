import { loadEnvFile } from 'node:process';

loadEnvFile(new URL('../backend/.env', import.meta.url));
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en backend/.env');

async function inspect(path) {
  const response = await fetch(new URL(path,SUPABASE_URL),{
    headers:{apikey:SUPABASE_ANON_KEY,accept:'application/json'},
    signal:AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(()=>({}));
  console.log(JSON.stringify({path,status:response.status,code:body.code ?? body.error ?? null,
    message:typeof body.message === 'string' ? body.message.slice(0,180) : null}));
}
await inspect('/rest/v1/evidencias?select=id_evidencia&limit=0');
await inspect('/storage/v1/bucket/fge-evidencias');
