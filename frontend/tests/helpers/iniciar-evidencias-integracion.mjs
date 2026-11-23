import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export default async function iniciar() {
  const server=fork(fileURLToPath(new URL('./evidencias-servidor.mjs',import.meta.url)),[],{
    cwd:fileURLToPath(new URL('../../',import.meta.url)),silent:true,execArgv:['--experimental-strip-types'],
  });
  let output='';
  for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-12000);});
  const finished=new Promise(resolve=>server.once('exit',resolve));
  async function cerrar(){if(server.exitCode!==null||server.signalCode!==null)return;if(server.connected)server.send('cerrar');const limit=setTimeout(()=>server.kill(),5000);try{await finished;}finally{clearTimeout(limit);}}
  try {
    const config=await new Promise((resolve,reject)=>{
      const limit=setTimeout(()=>reject(new Error('El entorno de Evidencias no se inició.\n'+output)),45000);
      server.once('message',value=>{clearTimeout(limit);resolve(value);});
      server.once('exit',()=>{clearTimeout(limit);reject(new Error(output));});
      server.once('error',error=>{clearTimeout(limit);reject(error);});
    });
    process.env.QA_EVIDENCIAS_CONFIG=JSON.stringify(config);
    return cerrar;
  } catch(error){await cerrar();throw error;}
}
