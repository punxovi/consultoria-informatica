import { dev } from 'astro';
import { crearEntornoIndicadores } from './indicadores-entorno.mjs';
import { crearEntornoIndicadoresReal } from './indicadores-real.mjs';
const real=process.env.INDICADORES_SUPABASE_REAL==='1';
const env=real?await crearEntornoIndicadoresReal():await crearEntornoIndicadores();
let astro;
try {
  const fixture=real?null:await env.fixture();
  const catalogId=real?env.catalogId:(await env.como('qa-admin',tx=>tx.query('SELECT id_indicador FROM public.indicadores WHERE id_accion IS NULL ORDER BY nombre LIMIT 1'))).rows[0].id_indicador;
  process.env.ASTRO_TELEMETRY_DISABLED='1';
  process.env.PUBLIC_SUPABASE_URL=env.supabaseUrl;
  process.env.PUBLIC_SUPABASE_ANON_KEY=env.anonKey??'qa-anon';
  process.env.PUBLIC_API_BASE_URL=env.gatewayUrl;
  astro=await dev({server:{host:'127.0.0.1',port:4336}});
  process.send?.({gatewayUrl:env.gatewayUrl,supabaseUrl:env.supabaseUrl,anonKey:env.anonKey??'qa-anon',
    token:env.token??'qa-admin',user:env.user??{id:env.usuarios.ADMIN,email:'qa@example.test',user_metadata:{}},
    actionId:env.actionId??fixture.accion.id_accion,planId:env.planId??fixture.plan.id_plan,catalogId});
} catch(error){await env.cerrar();throw error;}
let closing=false;
async function cerrar(){if(closing)return;closing=true;await astro.stop();await env.cerrar();process.exit(0);}
process.on('message',message=>{if(message==='cerrar')void cerrar();});
process.on('disconnect',()=>void cerrar());
