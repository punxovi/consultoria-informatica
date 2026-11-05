import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export default async function iniciar() {
  const servidor=fork(fileURLToPath(new URL('./solicitudes-servidor.mjs',import.meta.url)),[],{cwd:fileURLToPath(new URL('../../',import.meta.url)),silent:true,execArgv:[]});
  let salida='';
  for(const stream of [servidor.stdout,servidor.stderr])stream.on('data',dato=>{salida=(salida+dato).slice(-8000)});
  const terminado=new Promise(resolve=>servidor.once('exit',resolve));
  async function cerrar(){
    if(servidor.exitCode!==null)return;
    if(servidor.connected)servidor.send('cerrar');
    const limite=setTimeout(()=>servidor.kill(),4000);
    try{await terminado;}finally{clearTimeout(limite);}
  }
  try{
    await new Promise((resolve,reject)=>{
      const limite=setTimeout(()=>reject(new Error(salida||'No se inició Astro de pruebas.')),45000);
      servidor.once('message',()=>{clearTimeout(limite);resolve();});
      servidor.once('exit',()=>{clearTimeout(limite);reject(new Error(salida));});
      servidor.once('error',error=>{clearTimeout(limite);reject(error);});
    });
    return cerrar;
  }catch(error){await cerrar();throw error;}
}
