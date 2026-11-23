import { test, expect } from '@playwright/test';
let f, acta;
const campos={descripcion:'Entregar documentación',responsable_nombre:'Ana',responsable_contacto:'ana@example.invalid',fecha_limite:'2020-01-01',observaciones:''};
async function datos(request,body={}) {
  const r=await request.post(`${process.env.QA_COMPROMISOS_SUPABASE}/__qa/fixture`,{headers:{authorization:'Bearer qa-admin'},data:body});
  expect(r.ok()).toBe(true); return r.json();
}
async function crearActa(request) {
  const r=await request.post(`${process.env.QA_COMPROMISOS_GATEWAY}/api/v1/meeting-minutes`,{
    headers:{authorization:'Bearer qa-admin'},data:{id_organizacion:f.organizacion.id_organizacion,id_plan:f.planes[0].id_plan,id_accion:f.acciones[0].id_accion,
      fecha_reunion:'2026-10-08',objetivo:'Reunión de coordinación',asistentes:['QA ADMIN'],asistentes_externos:'',observaciones:''},
  });
  expect(r.ok()).toBe(true);return (await r.json()).data.meetingMinute;
}
async function sesion(context,token='qa-admin') {
  await context.addCookies([{name:'fge_access_token',value:token,url:'http://127.0.0.1:4334'}]);
  await context.addInitScript(token=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.invalid',user_metadata:{}}})),token);
  await context.route('**/api/v1/auth/session',r=>r.fulfill({json:{ok:true,data:{authenticated:true,user:{id:'17600000-0000-4000-8000-000000000001'}}}}));
}
test.beforeEach(async({context,request})=>{f=await datos(request);acta=await crearActa(request);await sesion(context);});
async function seccion(page,nombre){await page.locator('[data-tab="intervenciones"]').click();await page.locator(`[data-org-seccion="${nombre}"]`).click();}
async function abrir(page){await page.goto(`/organizaciones/${f.organizacion.id_organizacion}`);await seccion(page,'compromisos');}
async function completar(page){
  await page.locator('#comp-acta').selectOption(acta.id_acta);
  for(const [id,value] of Object.entries({descripcion:campos.descripcion,responsable:campos.responsable_nombre,contacto:campos.responsable_contacto,fecha:campos.fecha_limite})) await page.locator(`#comp-${id}`).fill(value);
}
async function crear(page){await abrir(page);await page.locator('#comp-nuevo').click();await completar(page);await page.locator('#comp-guardar').click();await expect(page.locator('#comp-exito')).toHaveText('Compromiso guardado correctamente.');}

test('registra, consulta, completa, reabre y persiste; navega al acta real',async({page})=>{
  const errores=[],escrituras=[];page.on('pageerror',e=>errores.push(e.message));
  page.on('request',r=>{if(r.url().includes('/commitments')&&['POST','PATCH'].includes(r.method()))escrituras.push(r);});
  await crear(page);await expect(page.locator('#comp-datos')).toContainText('Pendiente · Vencido');
  await expect(page.locator('#comp-origen')).toContainText(acta.objetivo);
  await page.locator('#comp-editar').click();await expect(page.locator('#comp-acta')).toBeDisabled();
  await page.locator('#comp-descripcion').fill('Sin guardar');await page.locator('#comp-cancelar').click();await expect(page.locator('#comp-datos')).not.toContainText('Sin guardar');
  await page.locator('#comp-editar').click();await page.locator('#comp-estado').selectOption('cumplido');await page.locator('#comp-guardar').click();
  await expect(page.locator('#comp-exito')).toContainText('actualizado correctamente');await expect(page.locator('#comp-datos')).not.toContainText('Vencido');
  await abrir(page);await page.locator('#comp-lista button').click();await expect(page.locator('#comp-datos')).toContainText('Cumplido');
  await page.locator('#comp-editar').click();await page.locator('#comp-estado').selectOption('pendiente');await page.locator('#comp-guardar').click();
  await expect(page.locator('#comp-datos')).toContainText('Pendiente · Vencido');await page.locator('#comp-origen').click();
  await expect(page.locator('#actas-detalle')).toBeVisible();await expect(page.locator('#actas-compromisos-detalle')).toContainText(campos.descripcion);
  await expect(page.locator('#detalle-objetivo')).toHaveText(acta.objetivo);
  expect(escrituras.map(r=>r.method())).toEqual(['POST','PATCH','PATCH']);
  expect(escrituras[1].postDataJSON().version_esperada).toBe(1);
  expect(escrituras[1].postDataJSON().cambios.id_acta).toBeUndefined();
  expect(escrituras.every(r=>r.url().startsWith(process.env.QA_COMPROMISOS_GATEWAY))).toBe(true);expect(errores).toEqual([]);
});

test('valida antes de enviar, bloquea campos y evita duplicados durante el guardado',async({page})=>{
  await abrir(page);await page.locator('#comp-nuevo').click();await completar(page);await page.locator('#comp-contacto').fill('');
  await page.locator('#comp-guardar').click();await expect(page.locator('#comp-contacto')).toHaveAttribute('aria-invalid','true');
  await page.locator('#comp-contacto').fill(campos.responsable_contacto);await expect(page.locator('#comp-estado')).toBeDisabled();
  let liberar,envios=0;const espera=new Promise(r=>{liberar=r;});
  await page.route('**/commitments',async ruta=>{if(ruta.request().method()==='POST'){envios++;await espera;}await ruta.continue();});
  await page.locator('#comp-guardar').click();await expect(page.locator('#comp-descripcion')).toBeDisabled();await expect(page.locator('#comp-cancelar')).toBeDisabled();
  await page.locator('#comp-form').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true})));
  liberar();await expect(page.locator('#comp-exito')).toBeVisible();expect(envios).toBe(1);
});

test('carga y error de catálogo son distintos de vacío y permiten reintentar',async({page})=>{
  let liberar;const espera=new Promise(r=>{liberar=r;});
  await page.route('**/commitments/origins',async ruta=>{await espera;await ruta.fulfill({status:503,json:{ok:false,error:{code:'SUPABASE_NO_DISPONIBLE',message:'No fue posible conectar con la base de datos.'}}});});
  await abrir(page);await expect(page.locator('#comp-carga')).toBeVisible();await expect(page.locator('#comp-nuevo')).toBeDisabled();
  liberar();await expect(page.locator('#comp-error')).toContainText('base de datos');await expect(page.locator('#comp-vacio')).toBeHidden();
  await page.unroute('**/commitments/origins');await abrir(page);await expect(page.locator('#comp-vacio')).toBeVisible();
});

test('fallo de escritura conserva el borrador; reintenta sin falsa confirmación',async({page})=>{
  await abrir(page);await page.locator('#comp-nuevo').click();await completar(page);
  await page.route('**/commitments',ruta=>ruta.fulfill({status:403,json:{ok:false,error:{code:'SIN_PERMISO',message:'No tienes permiso para guardar.'}}}));
  await page.locator('#comp-guardar').click();await expect(page.locator('#comp-error')).toHaveText('No tienes permiso para guardar.');
  await expect(page.locator('#comp-descripcion')).toHaveValue(campos.descripcion);await expect(page.locator('#comp-exito')).toBeHidden();
  await page.unroute('**/commitments');await page.locator('#comp-guardar').click();await expect(page.locator('#comp-exito')).toBeVisible();
});

test('conflicto real entre pestañas exige recarga incluso tras cancelar',async({page,context})=>{
  await crear(page);const otra=await context.newPage();await abrir(otra);await otra.locator('#comp-lista button').click();
  for(const tab of [page,otra])await tab.locator('#comp-editar').click();
  await page.locator('#comp-descripcion').fill('Primera versión');await otra.locator('#comp-descripcion').fill('Mi borrador');
  await page.locator('#comp-guardar').click();await expect(page.locator('#comp-exito')).toContainText('actualizado');
  await otra.locator('#comp-guardar').click();await expect(otra.locator('#comp-error')).toContainText('otra sesión');
  await expect(otra.locator('#comp-descripcion')).toHaveValue('Mi borrador');await expect(otra.locator('#comp-guardar')).toBeDisabled();
  await otra.locator('#comp-cancelar').click();await otra.locator('#comp-editar').click();await expect(otra.locator('#comp-guardar')).toBeDisabled();
  await abrir(otra);await expect(otra.locator('#comp-lista')).toContainText('Primera versión');await otra.close();
});

test('sin actas impide crear y coordinador ajeno consulta sin editar',async({page,context,request})=>{
  f=await datos(request);await abrir(page);await expect(page.locator('#comp-sin-actas')).toBeVisible();await expect(page.locator('#comp-nuevo')).toBeDisabled();
  f=await datos(request,{pais:'AR'});acta=await crearActa(request);await crear(page);await sesion(context,'qa-coord');await abrir(page);
  await expect(page.locator('#comp-permisos')).toBeVisible();await expect(page.locator('#comp-nuevo')).toBeHidden();
  await page.locator('#comp-lista button').click();await expect(page.locator('#comp-datos')).toContainText(campos.descripcion);await expect(page.locator('#comp-editar')).toBeHidden();
});

test('registros no disponibles muestran error y no un detalle anterior',async({page})=>{
  await crear(page);await abrir(page);
  await page.route('**/commitments/*',ruta=>ruta.request().url().endsWith('/origins')?ruta.continue():ruta.fulfill({status:404,json:{ok:false,error:{code:'NO_ENCONTRADO',message:'El compromiso ya no está disponible.'}}}));
  await page.locator('#comp-lista button').click();await expect(page.locator('#comp-error')).toContainText('ya no está disponible');await expect(page.locator('#comp-detalle')).toBeHidden();
});

test('compromisos creados dentro de Actas aparecen al cambiar pestaña; formulario móvil',async({page},info)=>{
  await abrir(page);await expect(page.locator('#comp-vacio')).toBeVisible();
  await seccion(page,'actas');await page.locator('#actas-nueva').click();
  await page.locator('#actas-plan').selectOption(f.planes[0].id_plan);await page.locator('#actas-asistentes').selectOption('QA ADMIN');await page.locator('#actas-objetivo').fill('Acta integrada');
  for(const descripcion of ['Primer acuerdo','Segundo acuerdo']){
    await page.locator('#actas-agregar-compromiso').click();const grupo=page.locator('[data-borradores] fieldset').last();
    for(const [nombre,valor] of Object.entries({...campos,descripcion}))await grupo.locator(`[data-campo="${nombre}"]`).fill(valor);
  }
  await page.locator('#actas-guardar').click();await expect(page.locator('#actas-mensaje')).toContainText('se registró');
  await seccion(page,'compromisos');await expect(page.locator('#comp-lista article')).toHaveCount(2);
  await page.locator('#comp-lista button').first().click();await page.locator('#comp-editar').click();
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#app-sidebar').getBoundingClientRect().right<=0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('#comp-form').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  await page.locator('#compromisos').screenshot({path:info.outputPath('compromisos-movil.png'),animations:'disabled'});
  await page.locator('#comp-cancelar').click();await expect(page.locator('#comp-datos')).toContainText('Pendiente');
});

test('descarga el PDF de los compromisos del acta desde el detalle (SCRUM-178)',async({page})=>{
  await crear(page);
  const [descarga]=await Promise.all([page.waitForEvent('download'),page.locator('#comp-pdf-acta').click()]);
  expect(descarga.suggestedFilename()).toMatch(new RegExp(`^compromisos-${f.organizacion.id_organizacion}-acta-${acta.id_acta}\.pdf$`));
  await expect(page.locator('#comp-exito')).toContainText('compromisos del acta');
  const bytes=await (await import('node:fs/promises')).readFile(await descarga.path());
  expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
  await page.locator('#comp-volver').click();await expect(page.locator('#comp-lista article')).toHaveCount(1);
  await expect(page.locator('#compromisos').getByRole('button',{name:/Descargar PDF/})).toHaveCount(0);
});

test('el detalle del acta descarga el mismo PDF de compromisos (SCRUM-178)',async({page})=>{
  await crear(page);
  await page.locator('#comp-origen').click();await expect(page.locator('#actas-detalle')).toBeVisible();
  const [descarga]=await Promise.all([page.waitForEvent('download'),page.locator('#actas-pdf-compromisos').click()]);
  expect(descarga.suggestedFilename()).toBe(`compromisos-${f.organizacion.id_organizacion}-acta-${acta.id_acta}.pdf`);
  await expect(page.locator('#actas-mensaje')).toContainText('compromisos del acta');
  const bytes=await (await import('node:fs/promises')).readFile(await descarga.path());
  expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
});
