import { crearClienteCatalogo } from '../catalogo/cliente.ts';
import type { ItemPublico } from '../catalogo/modelo.ts';
import { ApiError } from '../api/transporte.ts';
import { crearClienteCotizacion } from './cliente.ts';
import { cantidadSchema, formularioSchema, type Seleccion, type Contacto } from './modelo.ts';
import { leerSeleccion, guardarSeleccion, EVENTO_SELECCION } from './seleccion.ts';
import { leerBorrador, guardarBorrador, limpiarBorrador } from './borrador.ts';

const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 10 });

export function iniciarCotizacion() {
  const raiz = document.querySelector<HTMLElement>('#cotizacion');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#cot-${id}`)!;
  const form = q<HTMLFormElement>('form');
  const campos = ['nombre','apellido','correo','telefono','mensaje'] as const;
  const baseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
  const catalogo = crearClienteCatalogo(baseUrl); const cliente = crearClienteCotizacion(baseUrl);
  let seleccion: Seleccion = []; let productos = new Map<string,ItemPublico>();
  let ocupado = false; let listo = false; let confirmado = false; let guardandoPropio = false;
  const contactoActual = () => Object.fromEntries(campos.map(c=>[c,q<HTMLInputElement|HTMLTextAreaElement>(c).value])) as Contacto;
  function conservarContacto() {
    if (confirmado) return;
    try { guardarBorrador(contactoActual()); }
    catch { q('error-envio').textContent='No se pudieron conservar tus datos en esta pestaña. Mantén esta página abierta para continuar.'; q('error-envio').hidden=false; }
  }
  function restaurarContacto() {
    try {
      const borrador = leerBorrador();
      campos.forEach(c=>{q<HTMLInputElement|HTMLTextAreaElement>(c).value=borrador?.[c] ?? '';});
    } catch {}
  }
  restaurarContacto();
  campos.forEach(c=>{
    q(c).addEventListener('input',conservarContacto);
    q(c).addEventListener('change',conservarContacto);
  });
  window.addEventListener('pagehide',conservarContacto);
  window.addEventListener('pageshow',event=>{
    if (event.persisted && !confirmado) { restaurarContacto(); void cargar(); }
  });
  const crear = (tag: string, texto: string, clase = '') => { const e = document.createElement(tag); e.textContent = texto; e.className = clase; return e; };
  function controles() {
    q<HTMLFieldSetElement>('campos').disabled = confirmado;
    q<HTMLButtonElement>('enviar').disabled = ocupado || !listo || confirmado || seleccion.length === 0 || seleccion.some(i => !productos.has(i.id_producto));
    q<HTMLButtonElement>('restablecer').disabled = ocupado || confirmado || (seleccion.length === 0 && q('error-seleccion').hidden === true);
    q<HTMLButtonElement>('reintentar').disabled = ocupado;
    q('items').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(e=>e.disabled=ocupado||confirmado);
    q('items').querySelectorAll<HTMLButtonElement>('[data-restar]').forEach(b=>{
      const item=seleccion[Number(b.dataset.restar)];
      b.disabled=ocupado||confirmado||!item||!(item.cantidad>1);
    });
  }
  function guardar() {
    guardandoPropio = true;
    try { guardarSeleccion(seleccion); }
    catch { q('error-envio').textContent='No se pudo guardar la selección en esta pestaña. Mantén esta página abierta para continuar.'; q('error-envio').hidden=false; }
    finally { guardandoPropio = false; }
  }
  function fila(etiqueta: string, valor: string) {
    const div = crear('div','','flex items-center justify-between gap-3 rounded-xl bg-[#F5F3FA] px-3 py-2 text-sm');
    div.append(crear('span',etiqueta,'text-neutral-700'),crear('strong',valor,'text-right font-semibold tabular-nums text-neutral-900'));
    return div;
  }
  function resumen() {
    const validas = seleccion.every(i=>cantidadSchema.safeParse(i.cantidad).success);
    const suma = seleccion.reduce((n,i)=>n+i.cantidad,0);
    const total = validas && Number.isFinite(suma) ? numero.format(suma) : 'Revisa las cantidades';
    const orgs = new Set<string>(); const paises = new Set<string>(); let faltan = false;
    for(const item of seleccion) {
      const org=productos.get(item.id_producto)?.organizacion;
      if(org)orgs.add(org.id_organizacion); if(org?.pais)paises.add(org.pais.id_pais);
      if(!org || !org.pais)faltan=true;
    }
    const contenedor = q('resumen'); contenedor.replaceChildren();
    if(!seleccion.length)return;
    contenedor.append(
      fila('Productos seleccionados',String(seleccion.length)),
      fila('Cantidad total estimada',total),
      fila('Organizaciones',String(orgs.size)),
      fila('Países involucrados',String(paises.size)),
    );
    const nota = listo && faltan
      ? `Información territorial incompleta: ${orgs.size} organizaciones y ${paises.size} países identificados.`
      : `${orgs.size} organizaciones y ${paises.size} países involucrados. Las cantidades corresponden a la unidad de cada producto.`;
    contenedor.append(crear('p',nota,`px-1 text-xs ${listo && faltan ? 'text-danger' : 'text-neutral-600'}`));
  }
  function botonCantidad(texto: string, etiqueta: string) {
    const b=document.createElement('button');b.type='button';b.textContent=texto;b.setAttribute('aria-label',etiqueta);
    b.className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#DCD8EA] bg-white text-lg font-bold text-primary transition hover:bg-[#F0EEF8] focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40';
    return b;
  }
  function pintar() {
    const lista=q('items');lista.replaceChildren();
    if(!seleccion.length){
      const vacio=crear('div','','rounded-xl border border-dashed border-[#DCD8EA] p-4 text-center');
      vacio.append(crear('p','Tu selección está vacía.','font-semibold text-neutral-800'),crear('p','Usa «Agregar a cotización» en los productos del catálogo.','mt-1 text-sm text-neutral-600'));
      lista.append(vacio);
    }
    seleccion.forEach((item,indice)=>{
      const producto=productos.get(item.id_producto);
      const nombre=producto?.nombre ?? (listo ? 'Producto ya no disponible' : 'Cargando producto…');
      const article=crear('article','','min-w-0 rounded-xl border border-[#E4E0F0] bg-[#FCFBFE] p-3');
      const cabecera=crear('div','','flex items-start justify-between gap-3');
      const titulo=crear('div','','min-w-0');
      titulo.append(crear('h3',nombre,'break-words font-semibold leading-snug text-neutral-900'));
      if(producto?.organizacion)titulo.append(crear('p',[producto.organizacion.nombre,producto.organizacion.pais?.nombre].filter(Boolean).join(' · '),'mt-0.5 break-words text-xs text-neutral-600'));
      else if(listo && !producto)titulo.append(crear('p','Quita este producto antes de enviar la solicitud.','mt-0.5 text-xs text-danger'));
      const quitar=document.createElement('button');quitar.type='button';quitar.textContent='Quitar';
      quitar.className='min-h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-[#AD174F] hover:bg-[#FCE8F0] focus-visible:outline-2 focus-visible:outline-primary';
      quitar.setAttribute('aria-label',`Quitar ${producto?.nombre ?? 'producto no disponible'}`);
      quitar.addEventListener('click',()=>{seleccion=seleccion.filter(i=>i!==item);guardar();pintar();q('error-items').hidden=true;const siguiente=q('items').querySelector<HTMLButtonElement>('button:not(:disabled)');(siguiente ?? q<HTMLButtonElement>('enviar')).focus();});
      cabecera.append(titulo,quitar);

      const label=crear('label',`Cantidad estimada${producto ? ` (${producto.unidad_medida})` : ''}`,'mt-2 block text-xs font-semibold uppercase tracking-wide text-neutral-600') as HTMLLabelElement;
      const input=document.createElement('input'); input.id=`cot-cantidad-${indice}`;label.htmlFor=input.id;
      input.type='number';input.min='0';input.step='any';input.inputMode='decimal';input.value=String(item.cantidad);input.required=true;
      input.className='min-h-11 w-full min-w-0 rounded-xl border border-[#DCD8EA] px-3 text-center font-semibold tabular-nums focus:outline-2 focus:outline-primary';
      const error=crear('p','','mt-1 text-sm text-danger');error.id=`cot-cantidad-error-${indice}`;error.hidden=true;input.setAttribute('aria-describedby',error.id);
      const validar=()=>{
        const ok=cantidadSchema.safeParse(item.cantidad).success;
        input.setAttribute('aria-invalid',String(!ok));error.hidden=ok;error.textContent=ok?'':'Ingresa una cantidad válida mayor que cero.'; return ok;
      };
      const actualizar=()=>{validar();if(seleccion.every(i=>cantidadSchema.safeParse(i.cantidad).success))guardar();resumen();controles();};
      const restar=botonCantidad('−',`Disminuir cantidad de ${nombre}`);restar.dataset.restar=String(indice);
      const sumar=botonCantidad('+',`Aumentar cantidad de ${nombre}`);
      restar.addEventListener('click',()=>{if(item.cantidad>1){item.cantidad=Number((item.cantidad-1).toFixed(10));input.value=String(item.cantidad);actualizar();}});
      sumar.addEventListener('click',()=>{const base=Number.isFinite(item.cantidad)&&item.cantidad>0?item.cantidad:0;item.cantidad=Number((base+1).toFixed(10));input.value=String(item.cantidad);actualizar();});
      input.addEventListener('input',()=>{item.cantidad=input.valueAsNumber;actualizar();});
      const control=crear('div','','mt-1.5 flex items-center gap-2');control.append(restar,input,sumar);
      article.append(cabecera,label,control,error);lista.append(article);validar();
    });
    resumen();controles();
  }
  function leer() {
    try { seleccion=leerSeleccion(); q('error-seleccion').hidden=true; }
    catch { seleccion=[]; q('error-seleccion').hidden=false; }
  }
  async function cargar() {
    if(ocupado)return;
    leer();
    ocupado=true;listo=false;controles();q('carga').textContent='Cargando selección…';q('error-carga').hidden=true;
    pintar();
    try {
      productos=new Map((await catalogo.listar()).map(i=>[i.id_producto,i]));
      listo=true;
      pintar();q('carga').textContent='';
    } catch (error) {
      const detalle = q('error-carga-texto');
      detalle.textContent = error instanceof ApiError
        ? `${error.message} La selección se conserva; puedes completar tus datos y reintentar.`
        : 'No fue posible conectar con API Gateway, Backend o Supabase. Tu selección se conserva; puedes completar tus datos y reintentar.';
      q('error-carga').hidden=false;q('carga').textContent='';pintar();
    }
    finally {ocupado=false;controles();}
  }
  window.addEventListener(EVENTO_SELECCION,()=>{
    if(guardandoPropio)return;
    leer();
    if(confirmado){
      if(!seleccion.length)return;
      confirmado=false;q('confirmacion').hidden=true;form.hidden=false;q('restablecer').hidden=false;
    }
    q('error-items').hidden=true;pintar();
  });
  q('reintentar').addEventListener('click',()=>void cargar());
  q('restablecer').addEventListener('click',()=>{
    if(ocupado||confirmado)return;
    try {seleccion=[];guardar();q('error-seleccion').hidden=true;q('error-items').hidden=true;void cargar();}
    catch {q('error-seleccion').hidden=false;}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(ocupado||confirmado)return;
    campos.forEach(c=>{q(`error-${c}`).hidden=true;q(c).removeAttribute('aria-invalid');});
    q('error-envio').hidden=true;q('error-items').hidden=true;
    const contacto=contactoActual();
    conservarContacto();
    const validacion=formularioSchema.safeParse(contacto);
    if(!validacion.success){for(const error of validacion.error.issues){const c=String(error.path[0]);q(`error-${c}`).textContent=error.message;q(`error-${c}`).hidden=false;q(c).setAttribute('aria-invalid','true');}q(String(validacion.error.issues[0].path[0])).focus();return;}
    if(!listo){q('error-items').textContent='No fue posible confirmar los productos. Reintenta la carga del catálogo antes de enviar.';q('error-items').hidden=false;q<HTMLButtonElement>('reintentar').focus();return;}
    if(!seleccion.length||seleccion.some(i=>!productos.has(i.id_producto)||!cantidadSchema.safeParse(i.cantidad).success)){
      q('error-items').textContent='Selecciona al menos un producto disponible y revisa sus cantidades.';q('error-items').hidden=false;
      q('items').querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();return;
    }
    ocupado=true;controles();q('enviando').textContent='Enviando solicitud…';
    try {
      productos=new Map((await catalogo.listar()).map(i=>[i.id_producto,i]));
      if(seleccion.some(i=>!productos.has(i.id_producto))){pintar();throw new Error('Un producto dejó de estar disponible. Quítalo de la selección para continuar.');}
      const respuesta=await cliente.enviar(validacion.data,seleccion);
      confirmado=true;
      const confirmacion=q('confirmacion');const cantidad=respuesta.solicitudes?.length??1;
      confirmacion.textContent=`${cantidad>1?`Se registraron ${cantidad} solicitudes, una por país.`:'Solicitud registrada correctamente.'} La Fundación revisará tu solicitud y te contactará para preparar la cotización final.`;confirmacion.hidden=false;confirmacion.focus();
      form.hidden=true;q('restablecer').hidden=true;
      try {guardarSeleccion([]);}catch {confirmacion.append(crear('p','No se pudo limpiar la selección del navegador. Tu solicitud ya está registrada; no vuelvas a enviarla.','mt-3'));}
      seleccion=[];form.reset();
      try { limpiarBorrador(); } catch {confirmacion.append(crear('p','No se pudo limpiar el borrador en este navegador. Tu solicitud ya está registrada; no vuelvas a enviarla.','mt-3'));}
    } catch(error) {
      const incierto=error instanceof ApiError && ['SERVICIO_NO_DISPONIBLE','RESPUESTA_INVALIDA','CONFIRMACION_INVALIDA'].includes(error.code);
      q('error-envio').textContent=error instanceof ApiError
        ? incierto
          ? 'No se pudo confirmar el registro. Tu selección y datos se conservan. Si el envío se interrumpió, consulta con la Fundación antes de repetirlo.'
          : `No se pudo registrar la solicitud: ${error.message} Tu selección y datos se conservan.`
        : error instanceof Error ? error.message : 'No se pudo enviar la solicitud.';
      q('error-envio').hidden=false;
    } finally {ocupado=false;q('enviando').textContent='';controles();}
  });
  void cargar();
}
