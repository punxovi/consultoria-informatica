import {test,expect} from '@playwright/test';
const items=[1,2].map(n=>({id_producto:String(n),nombre:`Producto ${n}`,descripcion:'Artesanía',unidad_medida:'unidad',tipo_item:'producto',organizacion:{id_organizacion:`org${n}`,nombre:`Organización ${n}`,pais:{id_pais:n===1?'cl':'pe',nombre:n===1?'Chile':'Perú'}}}));
let catalogo, posts, fallo, espera;
test.beforeEach(async({context})=>{
 catalogo=structuredClone(items);posts=[];fallo=false;espera=null;
 await context.route('**/api/v1/public/catalog',r=>r.fulfill({json:{ok:true,data:{items:catalogo}}}));
 await context.route('**/api/v1/public/quote-requests',async r=>{posts.push(r.request().postDataJSON());if(espera)await espera;return r.fulfill(fallo?{status:503,json:{ok:false,error:{code:'ERROR',message:'falló'}}}:{json:{ok:true,data:{quote:{id_solicitud:'solicitud-123',estado:'solicitada'}}}});});
});
async function seleccionar(page){await page.goto('/catalogo');await page.getByRole('button',{name:'Agregar a cotización',exact:true}).nth(0).click();await page.getByRole('button',{name:'Agregar a cotización',exact:true}).nth(1).click();await page.goto('/cotizar');await expect(page.locator('#cot-items article')).toHaveCount(2);}
async function contacto(page){for(const [campo,valor]of Object.entries({nombre:'Ana',apellido:'Pérez',correo:'ana@example.org',telefono:'+56 912345678',mensaje:'Entrega durante diciembre'}))await page.locator(`#cot-${campo}`).fill(valor);}
test('seleccionar sin duplicados, editar cantidades, resumen, quitar y persistir',async({page})=>{
 await seleccionar(page);await page.locator('#cot-cantidad-0').fill('2.5');await expect(page.locator('#cot-resumen')).toContainText('3,5');await expect(page.locator('#cot-resumen')).toContainText('2 organizaciones y 2 países');
 await page.reload();await expect(page.locator('#cot-cantidad-0')).toHaveValue('2.5');
 await page.getByRole('button',{name:'Quitar Producto 2'}).click();await expect(page.locator('#cot-items article')).toHaveCount(1);
 await page.goto('/catalogo');await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();await page.goto('/cotizar');await expect(page.locator('#cot-items article')).toHaveCount(1);await expect(page.locator('#cot-cantidad-0')).toHaveValue('2.5');
});
test('validación de contacto, cantidades y selección vacía',async({page})=>{
 await seleccionar(page);await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-nombre')).toBeVisible();await expect(page.locator('#cot-error-apellido')).toBeVisible();await expect(page.locator('#cot-error-correo')).toBeVisible();expect(posts).toHaveLength(0);
 await contacto(page);await page.locator('#cot-cantidad-0').fill('0');await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-items')).toBeVisible();expect(posts).toHaveLength(0);
 await page.locator('#cot-restablecer').click();await expect(page.locator('#cot-items')).toContainText('vacía');await expect(page.locator('#cot-enviar')).toBeDisabled();expect(posts).toHaveLength(0);
});
test('registro confirmado, contrato correcto, bloqueo de doble envío y limpieza',async({page})=>{
 await seleccionar(page);await contacto(page);let liberar;espera=new Promise(r=>liberar=r);
 await page.locator('#cot-enviar').click();await expect(page.locator('#cot-enviar')).toBeDisabled();await expect(page.locator('#cot-enviando')).toContainText('Enviando');await expect.poll(()=>posts.length).toBe(1);
 expect(posts[0]).toEqual({nombre:'Ana',apellido:'Pérez',nombre_solicitante:'Ana Pérez',correo:'ana@example.org',telefono:'+56 912345678',mensaje:'Entrega durante diciembre',items:[{id_producto:'1',cantidad:1},{id_producto:'2',cantidad:1}]});
 liberar();await expect(page.locator('#cot-confirmacion')).toContainText('solicitud-123');await expect(page.locator('#cot-form')).toBeHidden();expect(await page.evaluate(()=>sessionStorage.getItem('fge-cotizacion-seleccion-v1'))).toBeNull();expect(posts).toHaveLength(1);
});
test('fallo conserva selección y contacto y no confirma',async({page})=>{
 fallo=true;await seleccionar(page);await contacto(page);await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-envio')).toBeVisible();await expect(page.locator('#cot-confirmacion')).toBeHidden();await expect(page.locator('#cot-nombre')).toHaveValue('Ana');await expect(page.locator('#cot-items article')).toHaveCount(2);await expect(page.locator('#cot-enviar')).toBeEnabled();
});

test('confirma las solicitudes separadas por país con una referencia de envío',async({page})=>{
 await page.route('**/api/v1/public/quote-requests',r=>r.fulfill({json:{ok:true,data:{quote:{id_solicitud:'solicitud-cl',id_envio:'envio-163',estado:'solicitada',solicitudes:[{id_solicitud:'solicitud-cl',estado:'solicitada'},{id_solicitud:'solicitud-pe',estado:'solicitada'}]}}}}));
 await seleccionar(page);await contacto(page);await page.locator('#cot-enviar').click();
 await expect(page.locator('#cot-confirmacion')).toContainText('2 solicitudes, una por país');
 await expect(page.locator('#cot-confirmacion')).toContainText('envio-163');
 await expect(page.locator('#cot-form')).toBeHidden();
});
test('producto retirado durante el formulario bloquea POST',async({page})=>{
 await seleccionar(page);await contacto(page);catalogo=[items[0]];await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-envio')).toContainText('dejó de estar disponible');expect(posts).toHaveLength(0);await expect(page.locator('#cot-items')).toContainText('Producto ya no disponible');
});
test('datos territoriales incompletos y almacenamiento corrupto',async({page})=>{
 catalogo=items.map(({organizacion,...rest})=>rest);await seleccionar(page);await expect(page.locator('#cot-resumen')).toContainText('Información territorial incompleta');
 await page.evaluate(()=>sessionStorage.setItem('fge-cotizacion-seleccion-v1','corrupto'));await page.reload();await expect(page.locator('#cot-error-seleccion')).toBeVisible();await expect(page.locator('#cot-enviar')).toBeDisabled();await page.locator('#cot-restablecer').click();await expect(page.locator('#cot-items')).toContainText('vacía');await expect(page.locator('#cot-enviar')).toBeDisabled();
});
test('móvil sin desbordamiento y campos de contacto no persistidos',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seleccionar(page);await contacto(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('ana@example.org');await page.screenshot({path:'test-results/cotizacion-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/cotizacion-desktop.png',fullPage:true});
});
