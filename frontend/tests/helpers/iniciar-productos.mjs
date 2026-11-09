import { createServer } from 'node:http';
import iniciarAstro from './iniciar-expediente.mjs';

// Las pruebas originales simulaban Auth solo dentro del navegador. El middleware
// SSR actual también exige una sesión: se simula su proveedor, sin desactivarlo.
export default async function iniciarProductos() {
  const auth=createServer(async(req,res)=>{
    for await(const chunk of req) { /* consumir cuerpo */ }
    res.setHeader('content-type','application/json');
    if(req.headers.authorization!=='Bearer qa'){res.writeHead(401);res.end('{}');return;}
    if(req.url==='/auth/v1/user')res.end(JSON.stringify({id:'14700000-0000-4000-8000-000000000001',email:'qa@example.invalid',user_metadata:{}}));
    else if(req.url==='/rest/v1/rpc/get_user_roles')res.end(JSON.stringify([{codigo:'ADMIN',alcance:'global',id_pais:null}]));
    else {res.writeHead(404);res.end('{}');}
  });
  await new Promise((resolve,reject)=>{auth.once('error',reject);auth.listen(54329,'127.0.0.1',resolve);});
  let cerrarAstro;
  try {cerrarAstro=await iniciarAstro();}
  catch(error){await new Promise(r=>auth.close(r));throw error;}
  return async()=>{await cerrarAstro();auth.closeAllConnections();await new Promise(r=>auth.close(r));};
}
