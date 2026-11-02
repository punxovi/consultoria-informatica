import { dev } from 'astro';
process.env.ASTRO_TELEMETRY_DISABLED='1';
process.env.PUBLIC_SUPABASE_URL='http://127.0.0.1:54329';
process.env.PUBLIC_SUPABASE_ANON_KEY='qa-anon-key';
process.env.PUBLIC_API_BASE_URL='http://127.0.0.1:4331';
const servidor=await dev({server:{host:'127.0.0.1',port:4331}});
process.send?.('listo');
process.on('message',async mensaje=>{if(mensaje==='cerrar'){await servidor.stop();process.exit(0);}});
