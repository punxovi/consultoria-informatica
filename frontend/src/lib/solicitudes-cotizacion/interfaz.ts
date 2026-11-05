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
 let filas:Solicitud[]=[];let actual:Solicitud|null=null;let autorizado=false;let cargando=false;let guardando=false;let detalleCargando=false;let epoca=0;let apertura=0;
 const nodo=(tag:string,texto:string,clase='')=>{const e=document.createElement(tag);e.textContent=texto;e.className=clase;return e;};
 const fecha=(valor:string)=>new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(valor))+' UTC';
 function controles(){
  for(const id of ['recargar','reintentar'])q<HTMLButtonElement>(id).disabled=!autorizado||cargando||guardando||detalleCargando;
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
  const visibles=filas.filter(s=>filtro.value==='todas'||(filtro.value==='nuevas'?s.estado==='solicitada':s.estado!=='solicitada'));
  q('lista').replaceChildren();q('carga').textContent=visibles.length?`${visibles.length} solicitudes visibles.`:filas.length?'No hay solicitudes para el filtro seleccionado.':'No hay solicitudes en tu alcance territorial.';
  for(const s of visibles){
   const card=nodo('article','','rounded-2xl border border-[#DCD8EA] border-l-4 border-l-primary bg-white p-5 space-y-3 min-w-0');
   card.append(nodo('span',etiquetas[s.estado],s.estado==='solicitada'?'inline-block rounded-full bg-brand-yellow/20 px-3 py-1 text-sm font-semibold':'inline-block rounded-full bg-brand-green/10 px-3 py-1 text-sm font-semibold'),nodo('h2',s.nombre_solicitante,'text-xl font-bold break-words'),nodo('p',s.correo,'text-sm break-all text-neutral-600'),nodo('p',`Recibida: ${fecha(s.created_at)}`,'text-sm text-neutral-600'),items(s));
   const b=document.createElement('button');b.type='button';b.className='min-h-12 rounded-xl border border-primary px-4 font-semibold text-primary';b.textContent='Ver solicitud';b.setAttribute('aria-label',`Ver solicitud de ${s.nombre_solicitante}`);b.addEventListener('click',()=>void abrir(s.id_solicitud));card.append(b);q('lista').append(card);
  }controles();
 }
 function mostrarDetalle(s:Solicitud){
  actual=s;q('detalle').replaceChildren(nodo('h3',s.nombre_solicitante,'text-xl font-semibold break-words'),nodo('p',`Correo: ${s.correo}`,'break-all'),nodo('p',`Teléfono: ${s.telefono||'No informado'}`,'break-words'),nodo('p',`Recibida: ${fecha(s.created_at)}`),nodo('p',`Estado actual: ${etiquetas[s.estado]}`),nodo('h3','Productos solicitados','font-semibold'),items(s),nodo('h3','Mensaje del solicitante','font-semibold'),nodo('p',s.mensaje||'Sin mensaje.','whitespace-pre-wrap break-words'));
  const estados=q<HTMLSelectElement>('estado');estados.replaceChildren(new Option('Selecciona un nuevo estado',''));
  for(const estado of [...new Set(s.estados_permitidos)].filter(e=>e!==s.estado))estados.add(new Option(etiquetas[estado],estado));
  q('form').hidden=estados.options.length===1;q('solo-lectura').hidden=estados.options.length!==1;
 }
 async function cargar(){
  if(!autorizado)return;const turno=++epoca;++apertura;filas=[];actual=null;guardando=false;detalleCargando=false;cargando=true;
  if(dialogo.open)dialogo.close();q('detalle').replaceChildren();q('lista').replaceChildren();q('form').hidden=true;q('solo-lectura').hidden=true;
  q('confirmacion').hidden=true;q('error').hidden=true;q('carga').textContent='Cargando solicitudes…';
  for(const id of ['total','nuevas','gestionadas'])q(id).textContent='—';controles();
  try{const datos=await cliente.listar();if(turno!==epoca)return;filas=datos;cargando=false;pintar();}
  catch(error){if(turno!==epoca)return;q('carga').textContent='';q('error-texto').textContent=mensajeError(error);q('error').hidden=false;}
  finally{if(turno===epoca){cargando=false;controles();}}
 }
 async function abrir(id:string){
  if(cargando||guardando||detalleCargando)return;const turno=epoca;const ventana=++apertura;actual=null;detalleCargando=true;
  q('detalle').replaceChildren();q('form').hidden=true;q('solo-lectura').hidden=true;q('detalle-error').hidden=true;q('estado-error').hidden=true;
  q('detalle-carga').textContent='Cargando detalle…';dialogo.showModal();q('cerrar').focus();controles();
  try{const s=await cliente.obtener(id);if(turno!==epoca||ventana!==apertura)return;mostrarDetalle(s);}
  catch(error){if(turno!==epoca||ventana!==apertura)return;q('detalle-error').textContent=mensajeError(error);q('detalle-error').hidden=false;
   if(error instanceof ApiError && [401,403].includes(error.status)){filas=[];q('lista').replaceChildren();for(const id of ['total','nuevas','gestionadas'])q(id).textContent='—';q('carga').textContent='Actualiza el listado para verificar tu acceso.';}
  }
  finally{if(turno===epoca&&ventana===apertura){detalleCargando=false;q('detalle-carga').textContent='';controles();}}
 }
 q<HTMLFormElement>('form').addEventListener('submit',async e=>{
  e.preventDefault();if(!actual||guardando||detalleCargando)return;
  const estado=q<HTMLSelectElement>('estado').value as Estado;q('estado-error').hidden=true;
  if(!actual.estados_permitidos.includes(estado)||estado===actual.estado){q('estado-error').textContent='Selecciona un estado permitido.';q('estado-error').hidden=false;q('estado').focus();return;}
  const turno=epoca;guardando=true;q('confirmacion').hidden=true;controles();q('detalle-carga').textContent='Guardando estado…';
  try{const s=await cliente.actualizar(actual,estado);if(turno!==epoca)return;filas=filas.map(f=>f.id_solicitud===s.id_solicitud?s:f);mostrarDetalle(s);pintar();q('confirmacion').textContent=`Estado actualizado a «${etiquetas[s.estado]}».`;q('confirmacion').hidden=false;q('detalle-carga').textContent='Estado actualizado correctamente.';}
  catch(error){if(turno!==epoca)return;q('estado-error').textContent=mensajeError(error);q('estado-error').hidden=false;q('detalle-carga').textContent='';
   if(error instanceof ApiError && [401,403,404,409].includes(error.status)){actual=null;q('form').hidden=true;if(error.status!==409){q('detalle').replaceChildren();filas=[];q('lista').replaceChildren();for(const id of ['total','nuevas','gestionadas'])q(id).textContent='—';q('carga').textContent='Actualiza el listado para verificar tu acceso.';}}
  }finally{if(turno===epoca){guardando=false;controles();}}
 });
 q('cerrar').addEventListener('click',()=>{if(!guardando)dialogo.close();});
 dialogo.addEventListener('cancel',e=>{if(guardando)e.preventDefault();});
 dialogo.addEventListener('close',()=>{++apertura;detalleCargando=false;actual=null;q('detalle').replaceChildren();controles();});
 filtro.addEventListener('change',()=>{if(!cargando)pintar();});
 for(const id of ['recargar','reintentar'])q(id).addEventListener('click',()=>{if(!guardando&&!cargando)void cargar();});
 window.addEventListener('fge:territorio-cambiado',()=>void cargar());
 controles();
 try{autorizado=(await getUserRoles()).some(r=>['ADMIN','COORD'].includes(r.codigo));if(autorizado)await cargar();}
 catch{q('error-texto').textContent='No se pudo verificar el acceso. Recarga la página.';q('error').hidden=false;}
}
