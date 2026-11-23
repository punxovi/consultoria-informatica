import {getSupabaseClient,getUserRoles} from '../supabase';
import {ApiError} from '../api/transporte.ts';
import {crearClienteSolicitudes,mensajeError} from './cliente.ts';
import {etiquetas,type Solicitud,type Estado} from './modelo.ts';

export async function iniciarSolicitudes(){
 const raiz=document.querySelector<HTMLElement>('#solicitudes');if(!raiz||raiz.dataset.iniciado)return;raiz.dataset.iniciado='true';
 const q=<T extends HTMLElement=HTMLElement>(id:string)=>raiz.querySelector<T>(`#sol-${id}`)!;
 const dialogo=q<HTMLDialogElement>('dialogo');const filtro=q<HTMLSelectElement>('filtro');
 const cliente=crearClienteSolicitudes(import.meta.env.PUBLIC_API_BASE_URL??'http://127.0.0.1:4000',async()=>{
  const {data,error}=await getSupabaseClient().auth.getSession();if(error||!data.session)throw new ApiError('SESION_REQUERIDA','Sesión requerida',401);return data.session.access_token;
 });
 let evidencias=new Map<string,number>();let evidenciasCargadas=false;
 async function contarEvidencias(ids:string[]){
  evidencias=new Map();evidenciasCargadas=false;if(!ids.length){evidenciasCargadas=true;return;}
  try{const {data,error}=await getSupabaseClient().from('evidencias_solicitud_cotizacion').select('id_solicitud').in('id_solicitud',ids).eq('estado_carga','disponible');if(error)throw error;
   for(const fila of data??[])evidencias.set(fila.id_solicitud,(evidencias.get(fila.id_solicitud)??0)+1);evidenciasCargadas=true;
  }catch{evidenciasCargadas=false;}
 }
 function insigniaEvidencia(id:string){
  if(!evidenciasCargadas)return null;const n=evidencias.get(id)??0;
  const e=nodo('span',n?`Con evidencia (${n})`:'Sin evidencia',n?'inline-block rounded-full bg-brand-green/10 px-3 py-1 text-sm font-semibold text-neutral-800':'inline-block rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600');
  e.setAttribute('aria-label',n?`Tiene ${n} ${n===1?'archivo':'archivos'} de evidencia`:'Sin evidencia adjunta');return e;
 }
 let filas:Solicitud[]=[];let actual:Solicitud|null=null;let autorizado=false;let cargando=false;let guardando=false;let detalleCargando=false;let epoca=0;let apertura=0;
 const nodo=(tag:string,texto:string,clase='')=>{const e=document.createElement(tag);e.textContent=texto;e.className=clase;return e;};
 const fecha=(valor:string)=>new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(valor))+' UTC';
 function controles(){
  for(const id of ['reintentar'])q<HTMLButtonElement>(id).disabled=!autorizado||cargando||guardando||detalleCargando;
  q<HTMLButtonElement>('guardar').disabled=guardando||detalleCargando||!actual;
  q<HTMLSelectElement>('estado').disabled=guardando||detalleCargando;
  q<HTMLButtonElement>('cerrar').disabled=guardando;
  q('lista').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=cargando||guardando||detalleCargando);
  q('lista').setAttribute('aria-busy',String(cargando));
 }
 function items(s:Solicitud){
  const ul=document.createElement('ul');ul.className='space-y-3';
  for(const item of s.items){const li=document.createElement('li');li.className='rounded-xl border border-[#DCD8EA] p-3 break-words';
   li.append(nodo('p',item.nombre_producto,'font-semibold'),nodo('p',`${item.cantidad} ${item.unidad_medida}`,'text-sm'),nodo('p',`${item.organizacion.nombre} · ${item.organizacion.pais.nombre}`,'text-sm text-neutral-600'));ul.append(li);
  }return ul;
 }
 function pintar(){
  q('total').textContent=String(filas.length);q('nuevas').textContent=String(filas.filter(s=>s.estado==='solicitada').length);q('gestionadas').textContent=String(filas.filter(s=>s.estado!=='solicitada').length);
  const visibles=filas.filter(s=>filtro.value==='todas'||(filtro.value==='nuevas'?s.estado==='solicitada':filtro.value==='gestionadas'?s.estado!=='solicitada':s.estado===filtro.value));
  q('lista').replaceChildren();q<HTMLButtonElement>('limpiar').disabled=filtro.value==='todas';
  q('carga').textContent=filas.length?`${visibles.length} de ${filas.length} ${filas.length===1?'solicitud registrada':'solicitudes registradas'}.`:'No hay solicitudes en tu alcance territorial.';
  for(const s of visibles){
   const card=nodo('article','','rounded-2xl border border-[#DCD8EA] tarjeta-acento acento-morado bg-white p-5 space-y-3 min-w-0');
   const insignias=nodo('div','','flex flex-wrap gap-2');
   insignias.append(nodo('span',etiquetas[s.estado],s.estado==='solicitada'?'inline-block rounded-full bg-brand-yellow/20 px-3 py-1 text-sm font-semibold':'inline-block rounded-full bg-brand-green/10 px-3 py-1 text-sm font-semibold'));
   const ev=insigniaEvidencia(s.id_solicitud);if(ev)insignias.append(ev);
   card.append(insignias,nodo('h2',s.nombre_solicitante,'text-xl font-bold break-words'),nodo('p',s.correo,'text-sm break-all text-neutral-600'),nodo('p',`Recibida: ${fecha(s.created_at)}`,'text-sm text-neutral-600'),items(s));
   const b=document.createElement('button');b.type='button';b.className='min-h-12 rounded-xl border border-primary px-4 font-semibold text-primary';b.textContent='Ver solicitud';b.setAttribute('aria-label',`Ver solicitud de ${s.nombre_solicitante}`);b.addEventListener('click',()=>void abrir(s.id_solicitud));card.append(b);q('lista').append(card);
  }controles();
 }
 function mostrarDetalle(s:Solicitud){
  actual=s;q('detalle').replaceChildren(nodo('h3',s.nombre_solicitante,'text-xl font-semibold break-words'),nodo('p',`Correo: ${s.correo}`,'break-all'),nodo('p',`Teléfono: ${s.telefono||'No informado'}`,'break-words'),nodo('p',`Recibida: ${fecha(s.created_at)}`),nodo('p',`Estado actual: ${etiquetas[s.estado]}`),nodo('h3','Productos solicitados','font-semibold'),items(s),nodo('h3','Mensaje del solicitante','font-semibold'),nodo('p',s.mensaje||'Sin mensaje.','whitespace-pre-wrap break-words'));
  const estados=q<HTMLSelectElement>('estado');estados.replaceChildren(new Option('Selecciona un nuevo estado',''));
  for(const estado of [...new Set(s.estados_permitidos)].filter(e=>e!==s.estado&&e!=='solicitada'))estados.add(new Option(etiquetas[estado],estado));
  q('form').hidden=estados.options.length===1;q('solo-lectura').hidden=estados.options.length!==1;
  q('evidencias').hidden=false;q<HTMLFormElement>('evidencia-form').hidden=s.estados_permitidos.length===0;void cargarEvidencias(s.id_solicitud);
 }
 const tiposEvidencia:Record<string,string>={'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WebP','application/pdf':'PDF','application/msword':'Word','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'Word'};
 function nombreSeguro(value:string){return value.replace(/[\\/\r\n\0]/g,'_').slice(0,255)||'evidencia';}
 async function cargarEvidencias(id:string){
  const lista=q<HTMLUListElement>('evidencia-lista');const mensaje=q('evidencia-mensaje');lista.replaceChildren();mensaje.textContent='Cargando archivos…';
  try{const {data,error}=await getSupabaseClient().from('evidencias_solicitud_cotizacion').select('id_evidencia,nombre_original,mime_type,tamano_bytes,created_at').eq('id_solicitud',id).eq('estado_carga','disponible').order('created_at');if(error)throw error;
   for(const item of data??[]){const li=document.createElement('li');li.className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DCD8EA] p-3';const info=nodo('span',`${item.nombre_original} · ${tiposEvidencia[item.mime_type]??'Archivo'} · ${(item.tamano_bytes/1048576).toFixed(1)} MB`,'min-w-0 break-all text-sm');const b=document.createElement('button');b.type='button';b.textContent='Descargar';b.className='min-h-10 rounded-lg border border-primary px-3 font-semibold text-primary';b.addEventListener('click',()=>void descargarEvidencia(item.id_evidencia,item.nombre_original));li.append(info,b);lista.append(li);}
   mensaje.textContent=(data?.length??0)?`${data!.length} archivo(s) adjunto(s).`:'Aún no hay evidencia adjunta.';
   if(evidenciasCargadas&&(evidencias.get(id)??0)!==(data?.length??0)){evidencias.set(id,data?.length??0);if(!cargando)pintar();}
  }catch{mensaje.textContent='No fue posible cargar la evidencia.';}
 }
 async function descargarEvidencia(id:string,nombre:string){
  q('evidencia-mensaje').textContent='Descargando archivo…';try{const {data,error}=await getSupabaseClient().storage.from('fge-cotizaciones').download(`${actual!.id_solicitud}/${id}`);if(error||!data)throw error;const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=nombre;a.click();URL.revokeObjectURL(url);q('evidencia-mensaje').textContent='Descarga iniciada.';}catch{q('evidencia-mensaje').textContent='No fue posible descargar el archivo.';}
 }
 q<HTMLFormElement>('evidencia-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!actual||guardando||detalleCargando)return;const file=q<HTMLInputElement>('evidencia-archivo').files?.[0];if(!file)return;
  if(!tiposEvidencia[file.type]||file.size<1||file.size>20*1024*1024){q('evidencia-mensaje').textContent='Elige una imagen, PDF o Word de hasta 20 MB.';return;}
  const idSolicitud=actual.id_solicitud;const boton=q<HTMLButtonElement>('evidencia-subir');boton.disabled=true;q('evidencia-mensaje').textContent='Guardando evidencia…';
  try{const supabase=getSupabaseClient();const id=crypto.randomUUID();const {error:crearError}=await supabase.from('evidencias_solicitud_cotizacion').insert({id_evidencia:id,id_solicitud:idSolicitud,bucket_id:'fge-cotizaciones',ruta_objeto:`${idSolicitud}/${id}`,nombre_original:nombreSeguro(file.name),mime_type:file.type,tamano_bytes:file.size,estado_carga:'reservado'});if(crearError)throw crearError;
   const {error:cargaError}=await supabase.storage.from('fge-cotizaciones').upload(`${idSolicitud}/${id}`,file,{contentType:file.type,upsert:false});if(cargaError)throw cargaError;
   const {error:actualizarError}=await supabase.from('evidencias_solicitud_cotizacion').update({estado_carga:'disponible'}).eq('id_evidencia',id).eq('estado_carga','reservado');if(actualizarError)throw actualizarError;
   q<HTMLFormElement>('evidencia-form').reset();await cargarEvidencias(idSolicitud);
  }catch{q('evidencia-mensaje').textContent='No se pudo guardar el archivo. Si aparece como cargando, vuelve a intentarlo o recarga el detalle.';}
  finally{boton.disabled=false;}
 });
 async function cargar(){
  if(!autorizado)return;const turno=++epoca;++apertura;filas=[];actual=null;guardando=false;detalleCargando=false;cargando=true;
  if(dialogo.open)dialogo.close();q('detalle').replaceChildren();q('lista').replaceChildren();q('form').hidden=true;q('solo-lectura').hidden=true;
  q('confirmacion').hidden=true;q('error').hidden=true;q('carga').textContent='Cargando solicitudes…';
  for(const id of ['total','nuevas','gestionadas'])q(id).textContent='—';controles();
  try{const datos=await cliente.listar();if(turno!==epoca)return;await contarEvidencias(datos.map(s=>s.id_solicitud));if(turno!==epoca)return;filas=datos;cargando=false;pintar();}
  catch(error){if(turno!==epoca)return;q('carga').textContent='';q('error-texto').textContent=mensajeError(error);q('error').hidden=false;}
  finally{if(turno===epoca){cargando=false;controles();}}
 }
 async function abrir(id:string){
  if(cargando||guardando||detalleCargando)return;const turno=epoca;const ventana=++apertura;actual=null;detalleCargando=true;
  q('detalle').replaceChildren();q('form').hidden=true;q('solo-lectura').hidden=true;q('evidencias').hidden=true;q('evidencia-lista').replaceChildren();q('detalle-error').hidden=true;q('estado-error').hidden=true;
  q('detalle-carga').textContent='Cargando detalle…';dialogo.showModal();q('cerrar').focus();controles();
  try{const s=await cliente.obtener(id);if(turno!==epoca||ventana!==apertura)return;mostrarDetalle(s);}
  catch(error){if(turno!==epoca||ventana!==apertura)return;q('detalle-error').textContent=mensajeError(error);q('detalle-error').hidden=false;
   if(error instanceof ApiError && [401,403].includes(error.status)){filas=[];q('lista').replaceChildren();for(const id of ['total','nuevas','gestionadas'])q(id).textContent='—';q('carga').textContent='Recarga la página para verificar tu acceso.';}
  }
  finally{if(turno===epoca&&ventana===apertura){detalleCargando=false;q('detalle-carga').textContent='';controles();}}
 }
 q<HTMLFormElement>('form').addEventListener('submit',async e=>{
  e.preventDefault();if(!actual||guardando||detalleCargando)return;
  const estado=q<HTMLSelectElement>('estado').value as Estado;q('estado-error').hidden=true;
  if(!actual.estados_permitidos.includes(estado)||estado===actual.estado||estado==='solicitada'){q('estado-error').textContent='Selecciona un estado permitido.';q('estado-error').hidden=false;q('estado').focus();return;}
  const turno=epoca;guardando=true;q('confirmacion').hidden=true;controles();q('detalle-carga').textContent='Guardando estado…';
  try{
   const s=await cliente.actualizar(actual,estado);window.dispatchEvent(new Event('fge:cotizaciones-actualizadas'));if(turno!==epoca)return;
   filas=filas.map(f=>f.id_solicitud===s.id_solicitud?s:f);
   guardando=false;dialogo.close();pintar();
   q('confirmacion').textContent=`Se actualizó la solicitud de ${s.nombre_solicitante} a «${etiquetas[s.estado]}».`;q('confirmacion').hidden=false;
   q('confirmacion').scrollIntoView({block:'nearest'});
  }
  catch(error){if(turno!==epoca)return;q('estado-error').textContent=mensajeError(error);q('estado-error').hidden=false;q('detalle-carga').textContent='';
   if(error instanceof ApiError && [401,403,404,409].includes(error.status)){actual=null;q('form').hidden=true;if(error.status!==409){q('detalle').replaceChildren();filas=[];q('lista').replaceChildren();for(const id of ['total','nuevas','gestionadas'])q(id).textContent='—';q('carga').textContent='Recarga la página para verificar tu acceso.';}}
  }finally{if(turno===epoca){guardando=false;controles();}}
 });
 q('cerrar').addEventListener('click',()=>{if(!guardando)dialogo.close();});
 dialogo.addEventListener('cancel',e=>{if(guardando)e.preventDefault();});
 dialogo.addEventListener('close',()=>{++apertura;detalleCargando=false;actual=null;q('detalle').replaceChildren();q('evidencias').hidden=true;controles();});
  filtro.addEventListener('change',()=>{if(!cargando)pintar();});
  q('limpiar').addEventListener('click',()=>{filtro.value='todas';if(!cargando)pintar();});
 for(const id of ['reintentar'])q(id).addEventListener('click',()=>{if(!guardando&&!cargando)void cargar();});
 let territorioActivo:string|undefined;
 window.addEventListener('fge:territorio-cambiado',e=>{
  const id=String((e as CustomEvent<{id_pais?:string}>).detail?.id_pais??'');
  const anterior=territorioActivo;territorioActivo=id;
  if(anterior===id)return;
  if(anterior===undefined&&dialogo.open)return;
  void cargar();
 });
 controles();
 try{autorizado=(await getUserRoles()).some(r=>['ADMIN','COORD'].includes(r.codigo));if(autorizado)await cargar();}
 catch{q('error-texto').textContent='No se pudo verificar el acceso. Recarga la página.';q('error').hidden=false;}
}
