import {test,expect} from '@playwright/test';
const items=[1,2].map(n=>({id_producto:String(n),nombre:`Producto ${n}`,descripcion:'Artesanía',unidad_medida:'unidad',tipo_item:'producto',organizacion:{id_organizacion:`org${n}`,nombre:`Organización ${n}`,pais:{id_pais:n===1?'cl':'pe',nombre:n===1?'Chile':'Perú'}}}));
let catalogo, posts, fallo, espera;
test.beforeEach(async({context})=>{
 catalogo=structuredClone(items);posts=[];fallo=false;espera=null;
 await context.route('**/api/v1/public/catalog',r=>r.fulfill({json:{ok:true,data:{items:catalogo}}}));
 await context.route('**/api/v1/public/quote-requests',async r=>{posts.push(r.request().postDataJSON());if(espera)await espera;return r.fulfill(fallo?{status:503,json:{ok:false,error:{code:'ERROR',message:'falló'}}}:{json:{ok:true,data:{quote:{id_solicitud:'solicitud-123',estado:'solicitada'}}}});});
});
async function seleccionar(page){await page.goto('/catalogo');await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();await page.goto('/cotizar');await expect(page.locator('#cot-items article')).toHaveCount(2);}
async function contacto(page){for(const [campo,valor]of Object.entries({nombre:'Ana',apellido:'Pérez',correo:'ana@example.org',telefono:'+56 912345678',mensaje:'Entrega durante diciembre'}))await page.locator(`#cot-${campo}`).fill(valor);}
test('seleccionar sin duplicados, editar cantidades, resumen, quitar y persistir',async({page})=>{
 await seleccionar(page);await page.locator('#cot-cantidad-0').fill('2.5');await expect(page.locator('#cot-resumen')).toContainText('3,5');await expect(page.locator('#cot-resumen')).toContainText('2 organizaciones y 2 países');
 await page.reload();await expect(page.locator('#cot-cantidad-0')).toHaveValue('2.5');
 await page.getByRole('button',{name:'Quitar Producto 2'}).click();await expect(page.locator('#cot-items article')).toHaveCount(1);
 await page.goto('/catalogo');const tarjeta=page.locator('#catalogo-lista article').first();await expect(tarjeta).toContainText('En tu solicitud');await expect(tarjeta).toContainText('2,5 unidad');await expect(tarjeta.getByRole('button',{name:'Agregar a cotización',exact:true})).toHaveCount(0);
 await page.goto('/cotizar');await expect(page.locator('#cot-items article')).toHaveCount(1);await expect(page.locator('#cot-cantidad-0')).toHaveValue('2.5');
});
test('el catálogo agrega y ajusta unidades y Mi solicitud lleva al formulario',async({page})=>{
 await page.goto('/catalogo');const contador=page.locator('header [data-contador]');await expect(contador).toHaveText('0');
 const tarjeta=page.locator('#catalogo-lista article').first();
 await tarjeta.getByRole('button',{name:'Agregar a cotización',exact:true}).click();
 await expect(page.locator('#catalogo-seleccion')).toContainText('se agregó a tu solicitud');await expect(contador).toHaveText('1');
 await tarjeta.getByRole('button',{name:'Aumentar cantidad de Producto 1'}).click();await tarjeta.getByRole('button',{name:'Aumentar cantidad de Producto 1'}).click();
 await expect(tarjeta).toContainText('3 unidad');
 await tarjeta.getByRole('button',{name:'Disminuir cantidad de Producto 1'}).click();await expect(tarjeta).toContainText('2 unidad');
 await page.getByRole('link',{name:/Mi solicitud/}).click();await expect(page).toHaveURL(/\/cotizar$/);
 await expect(page.locator('#cot-items article')).toHaveCount(1);await expect(page.locator('#cot-cantidad-0')).toHaveValue('2');
 await expect(page.getByRole('heading',{name:'Sin pago directo'})).toBeVisible();
 await page.locator('#cotizacion').getByRole('button',{name:'Aumentar cantidad de Producto 1'}).click();await expect(page.locator('#cot-cantidad-0')).toHaveValue('3');await expect(page.locator('#cot-resumen')).toContainText('Productos seleccionados');
 await page.locator('#cotizacion').getByRole('button',{name:'Quitar Producto 1'}).click();await expect(page.locator('#cot-items')).toContainText('vacía');await expect(page.locator('header [data-contador]')).toHaveText('0');
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
 liberar();await expect(page.locator('#cot-confirmacion')).toContainText('Solicitud registrada correctamente');await expect(page.locator('#cot-confirmacion')).not.toContainText('solicitud-123');await expect(page.locator('#cot-confirmacion')).not.toContainText('Referencia:');await expect(page.locator('#cot-form')).toBeHidden();expect(await page.evaluate(()=>sessionStorage.getItem('fge-cotizacion-seleccion-v1'))).toBeNull();expect(await page.evaluate(()=>sessionStorage.getItem('fge-cotizacion-contacto-v1'))).toBeNull();expect(posts).toHaveLength(1);
});
test('fallo conserva selección y contacto y no confirma',async({page})=>{
 fallo=true;await seleccionar(page);await contacto(page);await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-envio')).toContainText('No se pudo registrar la solicitud: falló');await expect(page.locator('#cot-confirmacion')).toBeHidden();await expect(page.locator('#cot-nombre')).toHaveValue('Ana');await expect(page.locator('#cot-items article')).toHaveCount(2);await expect(page.locator('#cot-enviar')).toBeEnabled();
});

test('confirma solicitudes separadas por país sin mostrar identificadores internos',async({page})=>{
 await page.route('**/api/v1/public/quote-requests',r=>r.fulfill({json:{ok:true,data:{quote:{id_solicitud:'solicitud-cl',id_envio:'envio-163',estado:'solicitada',solicitudes:[{id_solicitud:'solicitud-cl',estado:'solicitada'},{id_solicitud:'solicitud-pe',estado:'solicitada'}]}}}}));
 await seleccionar(page);await contacto(page);await page.locator('#cot-enviar').click();
 await expect(page.locator('#cot-confirmacion')).toContainText('2 solicitudes, una por país');
 await expect(page.locator('#cot-confirmacion')).not.toContainText('envio-163');
 await expect(page.locator('#cot-confirmacion')).not.toContainText('Referencia:');
 await expect(page.locator('#cot-form')).toBeHidden();
});
test('producto retirado durante el formulario bloquea POST',async({page})=>{
 await seleccionar(page);await contacto(page);catalogo=[items[0]];await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-envio')).toContainText('dejó de estar disponible');expect(posts).toHaveLength(0);await expect(page.locator('#cot-items')).toContainText('Producto ya no disponible');
});
test('datos territoriales incompletos y almacenamiento corrupto',async({page})=>{
 catalogo=items.map(({organizacion,...rest})=>rest);await seleccionar(page);await expect(page.locator('#cot-resumen')).toContainText('Información territorial incompleta');
 await page.evaluate(()=>sessionStorage.setItem('fge-cotizacion-seleccion-v1','corrupto'));await page.reload();await expect(page.locator('#cot-error-seleccion')).toBeVisible();await expect(page.locator('#cot-enviar')).toBeDisabled();await page.locator('#cot-restablecer').click();await expect(page.locator('#cot-items')).toContainText('vacía');await expect(page.locator('#cot-enviar')).toBeDisabled();
});
test('móvil sin desbordamiento y borrador limitado a la sesión de la pestaña',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seleccionar(page);await contacto(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>sessionStorage.getItem('fge-cotizacion-contacto-v1'))).toContain('ana@example.org');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('ana@example.org');await page.screenshot({path:'test-results/cotizacion-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/cotizacion-desktop.png',fullPage:true});
});

test('conserva contacto al volver al catálogo, agregar otro producto y recargar; limpia tras éxito',async({page})=>{
 await page.goto('/catalogo');await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();
 await page.locator('header a[href="/cotizar"]').click();await expect(page.locator('#cot-items article')).toHaveCount(1);
 await contacto(page);await page.getByRole('link',{name:'+ Agregar más productos',exact:true}).click();
 await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();
 await page.locator('header a[href="/cotizar"]').click();await expect(page.locator('#cot-items article')).toHaveCount(2);
 for(const [field,value] of Object.entries({nombre:'Ana',apellido:'Pérez',correo:'ana@example.org',telefono:'+56 912345678',mensaje:'Entrega durante diciembre'}))await expect(page.locator('#cot-'+field)).toHaveValue(value);
 await page.reload();await expect(page.locator('#cot-correo')).toHaveValue('ana@example.org');
 fallo=true;await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-envio')).toBeVisible();
 await page.getByRole('link',{name:'+ Agregar más productos',exact:true}).click();await page.locator('header a[href="/cotizar"]').click();await expect(page.locator('#cot-correo')).toHaveValue('ana@example.org');
 fallo=false;await page.locator('#cot-enviar').click();await expect(page.locator('#cot-confirmacion')).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('fge-cotizacion-contacto-v1'))).toBeNull();
 await page.goto('/catalogo');await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();await page.locator('header a[href="/cotizar"]').click();
 await expect(page.locator('#cot-nombre')).toHaveValue('');await expect(page.locator('#cot-telefono')).toHaveValue('');
});

test('teléfono es obligatorio y un envío vacío no llega al Backend',async({page})=>{
 await seleccionar(page);await contacto(page);await page.locator('#cot-telefono').fill('   ');
 await expect(page.locator('#cot-telefono')).toHaveAttribute('required','');
 await page.locator('#cot-enviar').click();await expect(page.locator('#cot-error-telefono')).toContainText('Ingresa tu teléfono');
 expect(posts).toHaveLength(0);
});

test('Atrás y Adelante conservan también un contacto incompleto y actualizan los productos',async({page})=>{
 await page.goto('/catalogo');await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();
 await page.locator('header a[href="/cotizar"]').click();await page.locator('#cot-nombre').fill('Ana');await page.locator('#cot-correo').fill('ana@');
 await page.goBack();await expect(page).toHaveURL(/\/catalogo$/);
 await page.getByRole('button',{name:'Agregar a cotización',exact:true}).first().click();await page.goForward();
 await expect(page.locator('#cot-nombre')).toHaveValue('Ana');await expect(page.locator('#cot-correo')).toHaveValue('ana@');
 await expect(page.locator('#cot-items article')).toHaveCount(2);expect(posts).toHaveLength(0);
});
