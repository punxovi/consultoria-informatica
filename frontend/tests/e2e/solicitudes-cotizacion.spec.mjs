import {test,expect} from '@playwright/test';
const base=(id='1',estado='solicitada')=>({id_solicitud:id,nombre_solicitante:`Solicitante ${id}`,correo:`persona${id}@example.org`,telefono:'+56 912345678',mensaje:'Entrega en diciembre',created_at:'2026-11-04T14:00:00Z',estado,version:1,estados_permitidos:['en_gestion','rechazada'],items:[{id_producto:'prod1',nombre_producto:'Mesa artesanal',unidad_medida:'unidad',cantidad:3,organizacion:{id_organizacion:'org1',nombre:'Manos Unidas',pais:{id_pais:'cl',nombre:'Chile'}}}]});
let datos,rol,error,requests,actualizacion;
test.beforeEach(async({context})=>{
 datos=[base(),base('2','cotizada')];rol='COORD';error=0;requests=[];actualizacion=null;
 await context.addCookies([{name:'fge_access_token',value:'qa',url:'http://127.0.0.1:4331'}]);
 await context.addInitScript(()=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa',refresh_token:'qa',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'qa@example.org',user_metadata:{}}})));
 await context.route('**/rest/v1/rpc/get_user_roles',r=>r.fulfill({json:[{codigo:rol,alcance:'pais',id_pais:null}]}));
 await context.route('**/auth/v1/user',r=>r.fulfill({json:{id:'11111111-1111-4111-8111-111111111111',email:'qa@example.org'}}));
 await context.route('**/api/v1/auth/session',r=>r.fulfill({json:{ok:true,data:{authenticated:true,user:{id:'qa'}}}}));
 await context.route('**/api/v1/quote-requests**',async r=>{
  requests.push(r.request());if(error)return r.fulfill({status:error,json:{ok:false,error:{code:error===404?'RUTA_NO_ENCONTRADA':'ERROR',message:'fallo'}}});
  const id=new URL(r.request().url()).pathname.split('/')[4];
  if(r.request().method()==='PATCH'){
   if(actualizacion)await actualizacion;
   const body=r.request().postDataJSON();datos=datos.map(s=>s.id_solicitud===id?{...s,estado:body.estado,version:s.version+1}:s);
   return r.fulfill({json:{ok:true,data:{request:datos.find(s=>s.id_solicitud===id)}}});
  }
  return r.fulfill({json:{ok:true,data:id?{request:datos.find(s=>s.id_solicitud===id)}:{requests:datos}}});
 });
});
async function abrir(page){await page.goto('/cotizaciones');await expect(page.locator('#sol-lista article')).toHaveCount(datos.length);}
test('listado, detalle, filtros nuevas y gestionadas',async({page})=>{
 await abrir(page);await expect(page.locator('#sol-nuevas')).toHaveText('1');await expect(page.locator('#sol-gestionadas')).toHaveText('1');
 for(const texto of ['Solicitante 1','persona1@example.org','Mesa artesanal','3 unidad','Manos Unidas','Chile'])await expect(page.locator('#sol-lista')).toContainText(texto);
 await page.locator('#sol-filtro').selectOption('nuevas');await expect(page.locator('#sol-lista article')).toHaveCount(1);await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();
 await expect(page.locator('#sol-detalle')).toContainText('Entrega en diciembre');await expect(page.locator('#sol-detalle')).toContainText('+56 912345678');await page.keyboard.press('Escape');
 await page.locator('#sol-filtro').selectOption('gestionadas');await expect(page.locator('#sol-lista')).toContainText('Solicitante 2');
});
test('estado permitido, validación, versión, confirmación y doble clic',async({page})=>{
 await abrir(page);await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();await expect(page.locator('#sol-form')).toBeVisible();
 await page.locator('#sol-guardar').click();await expect(page.locator('#sol-estado-error')).toContainText('Selecciona');
 await page.locator('#sol-estado').selectOption('en_gestion');let liberar;actualizacion=new Promise(r=>liberar=r);await page.locator('#sol-guardar').click();await expect(page.locator('#sol-guardar')).toBeDisabled();
 await expect.poll(()=>requests.filter(r=>r.method()==='PATCH').length).toBe(1);expect(requests.find(r=>r.method()==='PATCH').postDataJSON()).toEqual({version_esperada:1,estado:'en_gestion'});
 liberar();
 await expect(page.locator('#sol-dialogo')).not.toBeVisible();
 await expect(page.locator('#sol-confirmacion')).toContainText('Solicitante 1 a «En gestión»');
 await expect(page.locator('#sol-nuevas')).toHaveText('0');
 await expect(page.locator('#sol-lista article').first()).toContainText('En gestión');
});
test('filtra por cada estado y no permite volver a «Nueva»',async({page})=>{
 datos=[base('1','solicitada'),base('2','cotizada'),{...base('3','en_gestion'),estados_permitidos:['solicitada','cotizada','cerrada','rechazada']},base('4','cerrada'),base('5','rechazada')];
 await abrir(page);
 for(const [valor,nombre] of [['en_gestion','Solicitante 3'],['cotizada','Solicitante 2'],['cerrada','Solicitante 4'],['rechazada','Solicitante 5'],['nuevas','Solicitante 1']]){
  await page.locator('#sol-filtro').selectOption(valor);await expect(page.locator('#sol-lista article')).toHaveCount(1);await expect(page.locator('#sol-lista')).toContainText(nombre);
 }
 await page.locator('#sol-filtro').selectOption('gestionadas');await expect(page.locator('#sol-lista article')).toHaveCount(4);
 await page.locator('#sol-filtro').selectOption('en_gestion');await page.getByRole('button',{name:'Ver solicitud de Solicitante 3'}).click();
 await expect(page.locator('#sol-form')).toBeVisible();
 await expect(page.locator('#sol-estado option')).toHaveText(['Selecciona un nuevo estado','Cotizada','Cerrada','Rechazada']);
});
test('error de servicio, reintento y vacío',async({page})=>{
 error=404;await page.goto('/cotizaciones');await expect(page.locator('#sol-error')).toContainText('todavía no está disponible');error=0;datos=[];await page.locator('#sol-reintentar').click();await expect(page.locator('#sol-carga')).toContainText('No hay solicitudes');
});
test('409 exige nuevo detalle sin confirmar actualización',async({page})=>{
 await abrir(page);await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();await expect(page.locator('#sol-form')).toBeVisible();error=409;await page.locator('#sol-estado').selectOption('en_gestion');await page.locator('#sol-guardar').click();await expect(page.locator('#sol-estado-error')).toContainText('otra sesión');await expect(page.locator('#sol-form')).toBeHidden();await expect(page.locator('#sol-confirmacion')).toBeHidden();
});
test('cambio de territorio descarta respuestas antiguas y propaga encabezado',async({page})=>{
 await abrir(page);let liberar;const espera=new Promise(r=>liberar=r);
 await page.route('**/api/v1/quote-requests/1',async r=>{await espera;await r.fulfill({json:{ok:true,data:{request:base()}}});});
 await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();await expect(page.locator('#sol-detalle-carga')).toContainText('Cargando');datos=[];
 await page.evaluate(()=>{sessionStorage.setItem('fge.territorio.activo','pe');dispatchEvent(new CustomEvent('fge:territorio-cambiado',{detail:{id_pais:'pe'}}));});
 await expect(page.locator('#sol-carga')).toContainText('No hay solicitudes');liberar();await expect(page.locator('#sol-dialogo')).not.toBeVisible();await expect(page.locator('#sol-detalle')).toBeEmpty();expect(requests.at(-1).headers()['x-territory-id']).toBe('pe');
});
test('invitado no consulta API y usuario anónimo va al login',async({page,context})=>{
 rol='INVITADO';await page.goto('/cotizaciones');await expect(page.locator('#unauthorized-message')).toBeVisible();expect(requests).toHaveLength(0);await expect(page.getByRole('link',{name:'Solicitudes de cotización',exact:true})).not.toBeVisible();
 await context.clearCookies();await page.goto('/cotizaciones');await expect(page).toHaveURL(/login/);
});
test('sin transiciones permitidas, móvil y escritorio legibles',async({page})=>{
 datos=[{...base(),estados_permitidos:[]}];await page.setViewportSize({width:390,height:844});await abrir(page);await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();await expect(page.locator('#sol-solo-lectura')).toBeVisible();await expect(page.locator('#sol-form')).toBeHidden();expect(await page.locator('#sol-dialogo').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:'test-results/solicitudes-mobile.png'});
 await page.locator('#sol-cerrar').click();await page.setViewportSize({width:1440,height:1000});await expect(page.locator('#main-content')).toHaveCSS('opacity','1');await page.screenshot({path:'test-results/solicitudes-desktop.png'});
});

test('403 en detalle limpia información anterior y no habilita edición',async({page})=>{
 await abrir(page);error=403;await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();await expect(page.locator('#sol-detalle-error')).toContainText('No tienes permiso');await expect(page.locator('#sol-lista')).toBeEmpty();await expect(page.locator('#sol-detalle')).toBeEmpty();await expect(page.locator('#sol-form')).toBeHidden();
});
test('confirmación de una escritura antigua no reaparece tras cambiar territorio',async({page})=>{
 await abrir(page);await page.getByRole('button',{name:'Ver solicitud de Solicitante 1'}).click();await expect(page.locator('#sol-form')).toBeVisible();
 let liberar;const espera=new Promise(r=>liberar=r);await page.route('**/api/v1/quote-requests/1',async r=>{await espera;await r.fulfill({json:{ok:true,data:{request:{...base(),estado:'en_gestion',version:2}}}});});
 await page.locator('#sol-estado').selectOption('en_gestion');await page.locator('#sol-guardar').click();await expect(page.locator('#sol-guardar')).toBeDisabled();datos=[];
 await page.evaluate(()=>{sessionStorage.setItem('fge.territorio.activo','pe');dispatchEvent(new CustomEvent('fge:territorio-cambiado'));});await expect(page.locator('#sol-carga')).toContainText('No hay solicitudes');
 liberar();await expect(page.locator('#sol-dialogo')).not.toBeVisible();await expect(page.locator('#sol-confirmacion')).toBeHidden();await expect(page.locator('#sol-lista')).toBeEmpty();
});
