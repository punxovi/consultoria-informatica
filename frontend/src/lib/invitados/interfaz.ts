import { ApiError } from '../api/transporte.ts';
import { getSupabaseClient, getUserRoles } from '../supabase';
import { crearClienteInvitados, type SolicitudInvitado } from './cliente.ts';

export async function iniciarSolicitudesInvitado() {
  const raiz = document.querySelector<HTMLElement>('#solicitudes-invitado');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#${id}`)!;
  const dialogo = q<HTMLDialogElement>('invitados-dialogo');
  const buscar = q<HTMLInputElement>('buscar-solicitud');
  const filtro = q<HTMLSelectElement>('filtro-estado-solicitud');
  const cliente = crearClienteInvitados(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return data.session.access_token;
  });
  let solicitudes: SolicitudInvitado[] = [];
  let ocupado = false;
  let seleccion: { solicitud: SolicitudInvitado; accion: 'approve' | 'reject' } | null = null;
  const estados = { pendiente:'Pendiente', aprobado:'Aprobada', rechazado:'Rechazada', revocado:'Revocada' };
  function mensaje(id: string, texto = '') { q(id).textContent = texto; q(id).hidden = !texto; }
  function bloquear(valor: boolean) {
    ocupado = valor;
    raiz!.setAttribute('aria-busy', String(valor));
    raiz!.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select').forEach(e => e.disabled = valor);
  }
  function renderizar() {
    [solicitudes.length, solicitudes.filter(s=>s.estado==='pendiente').length, solicitudes.filter(s=>s.estado==='aprobado').length].forEach((n,i)=>q(`invitados-metrica-${i}`).textContent=String(n));
    const termino = buscar.value.trim().toLocaleLowerCase('es');
    const filas = solicitudes.filter(s => (!filtro.value || s.estado===filtro.value) && [s.nombre,s.correo,s.institucion??''].some(v=>v.toLocaleLowerCase('es').includes(termino)));
    const lista=q('invitados-lista'); lista.replaceChildren();
    mensaje('invitados-vacio', filas.length ? '' : solicitudes.length ? 'No hay solicitudes que coincidan con los filtros.' : 'Todavía no hay solicitudes recibidas.');
    for (const solicitud of filas) {
      const card=document.createElement('article'); card.className='min-w-0 rounded-2xl border border-[#DCD8EA] bg-white p-5';
      const titulo=document.createElement('h3'); titulo.className='break-words text-lg font-semibold'; titulo.textContent=solicitud.nombre; card.append(titulo);
      for(const texto of [solicitud.correo,`Institución: ${solicitud.institucion || 'No informada'}`,`Motivo: ${solicitud.motivo || 'No informado'}`]) {
        const p=document.createElement('p'); p.className='mt-2 break-words text-sm text-neutral-600'; p.textContent=texto; card.append(p);
      }
      const estado=document.createElement('p'); estado.className='my-3 inline-flex rounded-full bg-[#F0EEF8] px-3 py-1 text-sm font-semibold text-primary'; estado.textContent=estados[solicitud.estado]; card.append(estado);
      if(solicitud.estado==='pendiente') {
        const acciones=document.createElement('div'); acciones.className='flex flex-wrap gap-3';
        for(const accion of ['approve','reject'] as const) {
          const b=document.createElement('button'); b.type='button'; b.className='min-h-12 rounded-xl border border-primary px-4 text-primary'; b.textContent=accion==='approve'?'Aprobar':'Rechazar';
          b.addEventListener('click',()=>{
            if(ocupado)return;
            seleccion={solicitud,accion}; mensaje('invitados-exito'); mensaje('invitados-dialogo-error');
            q('invitados-dialogo-titulo').textContent=accion==='approve'?'¿Aprobar solicitud?':'¿Rechazar solicitud?';
            q('invitados-dialogo-texto').textContent=`Confirma la decisión para ${solicitud.nombre} (${solicitud.correo}).`;
            q<HTMLButtonElement>('invitados-confirmar').disabled=false; dialogo.showModal();
          }); acciones.append(b);
        } card.append(acciones);
      } lista.append(card);
    }
  }
  async function cargar() {
    if(ocupado)return;
    bloquear(true); mensaje('invitados-error'); mensaje('invitados-carga','Cargando solicitudes…'); mensaje('invitados-vacio');
    q('invitados-lista').replaceChildren();
    try { solicitudes=await cliente.listar(); renderizar(); }
    catch(error) { solicitudes=[]; mensaje('invitados-error', error instanceof Error?error.message:'No fue posible cargar las solicitudes.'); }
    finally { mensaje('invitados-carga'); bloquear(false); }
  }
  q('invitados-confirmar').addEventListener('click',async()=>{
    if(ocupado||!seleccion)return;
    const actual=seleccion; bloquear(true); mensaje('invitados-dialogo-error');
    try {
      const resultado=await cliente.resolver(actual.solicitud,actual.accion);
      solicitudes=solicitudes.map(s=>s.id_invitado===resultado.id_invitado?resultado:s);
      dialogo.close(); seleccion=null; renderizar(); mensaje('invitados-exito',`Solicitud ${estados[resultado.estado].toLowerCase()} correctamente.`);
    } catch(error) {
      mensaje('invitados-dialogo-error',error instanceof Error?error.message:'No se pudo confirmar la operación.');
      // Una respuesta incierta o conflicto exige recargar; no repetir una aprobación.
      if(error instanceof ApiError && (error.status===409 || error.status>=500 || error.status===0)) seleccion=null;
    } finally { bloquear(false); if(!seleccion)q<HTMLButtonElement>('invitados-confirmar').disabled=true; }
  });
  q('invitados-cancelar').addEventListener('click',()=>{if(!ocupado){seleccion=null;dialogo.close();}});
  dialogo.addEventListener('cancel',e=>{if(ocupado)e.preventDefault();else seleccion=null;});
  buscar.addEventListener('input',renderizar); filtro.addEventListener('change',renderizar);
  q('invitados-limpiar').addEventListener('click',()=>{buscar.value='';filtro.value='';renderizar();});
  q('invitados-recargar').addEventListener('click',()=>void cargar());
  bloquear(true);
  try { if(!(await getUserRoles()).some(r=>r.codigo==='ADMIN'))throw new Error('Solo el Administrador puede gestionar solicitudes.'); }
  catch(error) { mensaje('invitados-carga'); mensaje('invitados-error',error instanceof Error?error.message:'No fue posible verificar tus permisos.'); return; }
  bloquear(false); await cargar();
}
