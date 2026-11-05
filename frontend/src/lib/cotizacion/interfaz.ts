import { crearClienteCatalogo } from '../catalogo/cliente.ts';
import type { ItemPublico } from '../catalogo/modelo.ts';
import { ApiError } from '../api/transporte.ts';
import { crearClienteCotizacion } from './cliente.ts';
import { cantidadSchema, formularioSchema, type Seleccion, type Contacto } from './modelo.ts';
import { leerSeleccion, guardarSeleccion } from './seleccion.ts';

export async function iniciarCotizacion() {
  const raiz = document.querySelector<HTMLElement>('#cotizacion');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#cot-${id}`)!;
  const form = q<HTMLFormElement>('form');
  const campos = ['nombre','apellido','correo','telefono','mensaje'] as const;
  const baseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
  const catalogo = crearClienteCatalogo(baseUrl); const cliente = crearClienteCotizacion(baseUrl);
  let seleccion: Seleccion = []; let productos = new Map<string,ItemPublico>();
  let ocupado = false; let listo = false; let confirmado = false;
  const crear = (tag: string, texto: string, clase = '') => { const e = document.createElement(tag); e.textContent = texto; e.className = clase; return e; };
  function controles() {
    q<HTMLFieldSetElement>('campos').disabled = confirmado;
    q<HTMLButtonElement>('enviar').disabled = ocupado || !listo || confirmado || seleccion.length === 0 || seleccion.some(i => !productos.has(i.id_producto));
    q<HTMLButtonElement>('restablecer').disabled = ocupado || confirmado;
    q<HTMLButtonElement>('reintentar').disabled = ocupado;
    q('items').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(e=>e.disabled=ocupado||confirmado);
  }
  function guardar() {
    try { guardarSeleccion(seleccion); }
    catch { q('error-envio').textContent='No se pudo guardar la selección en esta pestaña. Mantén esta página abierta para continuar.'; q('error-envio').hidden=false; }
  }
  function resumen() {
    const validas = seleccion.every(i=>cantidadSchema.safeParse(i.cantidad).success);
    const suma = seleccion.reduce((n,i)=>n+i.cantidad,0);
    const total = validas && Number.isFinite(suma) ? new Intl.NumberFormat('es-CL',{maximumFractionDigits:10}).format(suma) : 'Revisa las cantidades';
    const orgs = new Set<string>(); const paises = new Set<string>(); let faltan = false;
    for(const item of seleccion) {
      const org=productos.get(item.id_producto)?.organizacion;
      if(org)orgs.add(org.id_organizacion); if(org?.pais)paises.add(org.pais.id_pais);
      if(!org || !org.pais)faltan=true;
    }
    q('resumen').textContent = `${seleccion.length} productos seleccionados · Cantidad total estimada: ${total}. Las cantidades corresponden a las unidades indicadas en cada producto. ${faltan ? `Información territorial incompleta: ${orgs.size} organizaciones y ${paises.size} países identificados.` : `${orgs.size} organizaciones y ${paises.size} países involucrados.`}`;
  }
  function pintar() {
    const lista=q('items');lista.replaceChildren();
    if(!seleccion.length)lista.append(crear('p','Tu selección está vacía. Agrega productos desde el catálogo.','text-neutral-600'));
    seleccion.forEach((item,indice)=>{
      const producto=productos.get(item.id_producto);
      const article=crear('article','','rounded-xl border border-[#DCD8EA] p-4 min-w-0');
      article.append(crear('h3',producto?.nombre ?? 'Producto ya no disponible','font-semibold break-words'));
      if(producto)article.append(crear('p',`Unidad: ${producto.unidad_medida}`,'text-sm text-neutral-600'));
      else article.append(crear('p','Quita este producto antes de enviar la solicitud.','text-sm text-danger'));
      const label=crear('label','Cantidad estimada','mt-3 block text-sm font-medium') as HTMLLabelElement;
      const input=document.createElement('input'); input.id=`cot-cantidad-${indice}`;label.htmlFor=input.id;
      input.type='number';input.min='0';input.step='any';input.value=String(item.cantidad);input.required=true;
      input.className='mt-1 min-h-12 w-full rounded-xl border border-[#DCD8EA] px-3';
      const error=crear('p','','mt-1 text-sm text-danger');error.id=`cot-cantidad-error-${indice}`;error.hidden=true;input.setAttribute('aria-describedby',error.id);
      const validar=()=>{
        const ok=cantidadSchema.safeParse(item.cantidad).success;
        input.setAttribute('aria-invalid',String(!ok));error.hidden=ok;error.textContent=ok?'':'Ingresa una cantidad válida mayor que cero.'; return ok;
      };
      input.addEventListener('input',()=>{item.cantidad=input.valueAsNumber;validar();if(seleccion.every(i=>cantidadSchema.safeParse(i.cantidad).success))guardar();resumen();});
      const quitar=document.createElement('button');quitar.type='button';quitar.textContent='Quitar producto';quitar.className='mt-3 min-h-12 rounded-xl border border-primary px-4 text-primary';quitar.setAttribute('aria-label',`Quitar ${producto?.nombre ?? 'producto no disponible'}`);
      quitar.addEventListener('click',()=>{seleccion=seleccion.filter(i=>i!==item);guardar();pintar();q('error-items').hidden=true;const siguiente=q('items').querySelector<HTMLButtonElement>('button');(siguiente ?? q<HTMLButtonElement>('restablecer')).focus();});
      article.append(label,input,error,quitar);lista.append(article);validar();
    });
    resumen();controles();
  }
  async function cargar() {
    if(ocupado)return;ocupado=true;listo=false;controles();q('carga').textContent='Cargando selección…';q('error-carga').hidden=true;
    try { seleccion=leerSeleccion(); q('error-seleccion').hidden=true; }
    catch { seleccion=[]; q('error-seleccion').hidden=false; }
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
  q('reintentar').addEventListener('click',()=>void cargar());
  q('restablecer').addEventListener('click',()=>{
    if(ocupado||confirmado)return;
    try {guardarSeleccion([]);seleccion=[];q('error-seleccion').hidden=true;q('error-items').hidden=true;void cargar();}
    catch {q('error-seleccion').hidden=false;}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(ocupado||confirmado)return;
    campos.forEach(c=>{q(`error-${c}`).hidden=true;q(c).removeAttribute('aria-invalid');});
    q('error-envio').hidden=true;q('error-items').hidden=true;
    const contacto=Object.fromEntries(campos.map(c=>[c,q<HTMLInputElement|HTMLTextAreaElement>(c).value])) as Contacto;
    const validacion=formularioSchema.safeParse(contacto);
    if(!validacion.success){for(const error of validacion.error.issues){const c=String(error.path[0]);q(`error-${c}`).textContent=error.message;q(`error-${c}`).hidden=false;q(c).setAttribute('aria-invalid','true');}q(String(validacion.error.issues[0].path[0])).focus();return;}
    if(!listo){q('error-items').textContent='No fue posible confirmar los productos. Reintenta la carga del catálogo antes de enviar.';q('error-items').hidden=false;q<HTMLButtonElement>('reintentar').focus();return;}
    if(!seleccion.length||seleccion.some(i=>!productos.has(i.id_producto)||!cantidadSchema.safeParse(i.cantidad).success)){
      q('error-items').textContent='Selecciona al menos un producto disponible y revisa sus cantidades.';q('error-items').hidden=false;
      q('items').querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();return;
    }
    ocupado=true;controles();q('enviando').textContent='Enviando solicitud…';
    try {
      // Actualizar publicación antes de enviar; el servidor valida nuevamente al registrar.
      productos=new Map((await catalogo.listar()).map(i=>[i.id_producto,i]));
      if(seleccion.some(i=>!productos.has(i.id_producto))){pintar();throw new Error('Un producto dejó de estar disponible. Quítalo de la selección para continuar.');}
      const respuesta=await cliente.enviar(validacion.data,seleccion);
      confirmado=true;
      const confirmacion=q('confirmacion');const cantidad=respuesta.solicitudes?.length??1;
      confirmacion.textContent=`${cantidad>1?`Se registraron ${cantidad} solicitudes, una por país.`:'Solicitud registrada correctamente.'} Referencia: ${respuesta.id_envio??respuesta.id_solicitud}. La Fundación revisará tu solicitud y te contactará para preparar la cotización final.`;confirmacion.hidden=false;confirmacion.focus();
      form.hidden=true;q('restablecer').hidden=true;
      try {guardarSeleccion([]);}catch {confirmacion.append(crear('p','No se pudo limpiar la selección del navegador. Tu solicitud ya está registrada; no vuelvas a enviarla.','mt-3'));}
      form.reset();
    } catch(error) {
      q('error-envio').textContent=error instanceof ApiError ? 'No se pudo confirmar el registro. Tu selección y datos se conservan. Si el envío se interrumpió, consulta con la Fundación antes de repetirlo.' : error instanceof Error ? error.message : 'No se pudo enviar la solicitud.';
      q('error-envio').hidden=false;
    } finally {ocupado=false;q('enviando').textContent='';controles();}
  });
  await cargar();
}
