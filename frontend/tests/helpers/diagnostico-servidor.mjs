import { dev } from 'astro';
import { crearEntornoDiagnostico } from './diagnostico-entorno.mjs';

const entorno = await crearEntornoDiagnostico();
process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.PUBLIC_SUPABASE_URL = entorno.supabaseUrl;
process.env.PUBLIC_SUPABASE_ANON_KEY = 'qa-anon';
process.env.PUBLIC_API_BASE_URL = entorno.gatewayUrl;
const astro = await dev({ server: { host: '127.0.0.1', port: 4332 } });
process.send?.({ tipo: 'listo', gatewayUrl: entorno.gatewayUrl, supabaseUrl: entorno.supabaseUrl });
let cerrando = false;
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  await astro.stop();
  await entorno.cerrar();
  process.exit(0);
}
process.on('message', mensaje => { if (mensaje === 'cerrar') void cerrar(); });
process.on('disconnect', () => void cerrar());
