import {dev} from 'astro';
import {createServer} from 'node:http';
// Autenticación simulada solo para probar el middleware SSR sin usar una cuenta real.
const auth=createServer((req,res)=>{
  if (req.url === '/rest/v1/rpc/get_user_roles') {
    res.writeHead(200, {'content-type':'application/json'});
    res.end(JSON.stringify([{codigo:'ADMIN',alcance:'global',id_pais:null}]));
    return;
  }
  res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:'qa@example.org'}));});
await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
process.env.ASTRO_TELEMETRY_DISABLED='1';
process.env.PUBLIC_SUPABASE_URL=`http://127.0.0.1:${auth.address().port}`;
process.env.PUBLIC_SUPABASE_ANON_KEY='qa-anon-key';
process.env.PUBLIC_API_BASE_URL='http://127.0.0.1:4331';
const servidor=await dev({server:{host:'127.0.0.1',port:4331}});
process.send?.('listo');
process.on('message',async mensaje=>{if(mensaje==='cerrar'){await servidor.stop();await new Promise(resolve=>auth.close(resolve));process.exit(0);}});
