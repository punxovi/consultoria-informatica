import {test,expect} from '@playwright/test';
const producto=(id,pais,org,extra={})=>({id_producto:id,nombre:`Producto ${id}`,descripcion:'Trabajo artesanal de nuestra comunidad.',unidad_medida:'unidad',tipo_item:'producto',publicado:true,categoria:'Artesanía',material_terminacion:'Madera barnizada',organizacion:{id_organizacion:org,nombre:`Organización ${org}`,pais:{id_pais:pais,nombre:pais}},imagenes:[],...extra});
let datos, fallo, solicitudes;
test.beforeEach(async({context})=>{
 datos=[producto('1','Chile','A'),producto('2','Perú','B'),producto('3','Chile','C'),producto('4','Chile','A',{publicado:false})];fallo=false;solicitudes=[];
 await context.route('**/api/v1/public/catalog*',async r=>{
 solicitudes.push(r.request());
 await r.fulfill(fallo?{status:503,json:{ok:false,error:{code:'ERROR',message:'No disponible'}}}:{json:{ok:true,data:{items:datos}}});
 });
});
async function abrir(page,ruta='/catalogo'){await page.goto(ruta);await expect(page.locator('#catalogo-estado')).toContainText('opciones');}
test('acceso anónimo, solo publicados, campos y detalle accesible',async({page,context})=>{
 await abrir(page);expect(await context.cookies()).toEqual([]);
 await expect(page.locator('#catalogo-lista article')).toHaveCount(3);
 const card=page.locator('#catalogo-lista article').first();
 for(const valor of ['Producto 1','Organización A','Chile','Artesanía','Madera barnizada'])await expect(card).toContainText(valor);
 await card.getByRole('button',{name:/Ver detalle/}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog')).toContainText('Trabajo artesanal');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(card.getByRole('button',{name:/Ver detalle/})).toBeFocused();
 expect(solicitudes.every(r=>r.method()==='GET'&&!r.headers().authorization)).toBe(true);
});
test('país y organización separados, combinados, vacío y restablecer',async({page})=>{
 await abrir(page);const chip=n=>page.locator(`#catalogo-paises [data-pais="${n}"]`);await chip('Chile').click();await expect(chip('Chile')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#catalogo-lista article')).toHaveCount(2);
 await page.locator('#catalogo-organizacion').selectOption('A');await expect(page.locator('#catalogo-lista article')).toHaveCount(1);
 await chip('Perú').click();await expect(page.locator('#catalogo-estado')).toContainText('No hay productos que coincidan');
 await chip('').click();await expect(page.locator('#catalogo-lista article')).toHaveCount(1);
 await page.locator('#catalogo-limpiar').click();await expect(page.locator('#catalogo-lista article')).toHaveCount(3);
});
test('imagen predeterminada pública y recuperación de una foto fallida',async({page})=>{
 datos[0].imagenes=[{url:'https://example.test/imagen.png'}];await page.route('https://example.test/**',r=>r.abort());await abrir(page);
 await expect(page.locator('#catalogo-lista img').first()).toHaveAttribute('src','/images/producto-sin-foto.svg');
 await expect.poll(()=>page.locator('#catalogo-lista img').first().evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 const response=await page.request.get('/images/producto-sin-foto.svg');expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('image/svg');
});
test('error con reintento, vacío y compatibilidad con contrato actual',async({page})=>{
 fallo=true;await page.goto('/catalogo');await expect(page.getByRole('alert')).toBeVisible();fallo=false;datos=[];await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.locator('#catalogo-estado')).toContainText('Todavía no hay productos');
 await page.reload();await expect(page.locator('#catalogo-estado')).toContainText('Todavía no hay productos');
 datos=[{id_producto:'1',nombre:'Taller',descripcion:'Formación',unidad_medida:'hora',tipo_item:'servicio',caracteristicas:{modalidad:'Presencial'}}];await page.reload();await expect(page.locator('#catalogo-lista')).toContainText('No informada');await expect(page.locator('#catalogo-paises button').first()).toBeDisabled();
});
test('móvil, fotografía válida, textos seguros, sin precio ni stock',async({page})=>{
 datos=[producto('1','Chile','A',{nombre:'<script>alert(1)</script>',caracteristicas:{precio:5000,stock:42},imagenes:[{url:'https://example.test/foto.svg'}]})];
 await page.route('https://example.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#d9ece2"/></svg>'}));
 await page.setViewportSize({width:390,height:844});await abrir(page);
 await expect(page.locator('#catalogo-lista script')).toHaveCount(0);await expect(page.locator('#catalogo-lista')).not.toContainText('5000');await expect(page.locator('#catalogo-lista')).not.toContainText('42');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#catalogo-lista').getByRole('button',{name:/Ver detalle/}).click();expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:'test-results/catalogo-mobile.png'});
});
test('escritorio y rutas de entrada',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await abrir(page,'/catalogo');await page.screenshot({path:'test-results/catalogo-desktop.png',fullPage:true});
 await abrir(page,'/catalogo/');await expect(page.getByRole('heading',{name:'Productos con propósito'})).toBeVisible();
});
test('las fotos de productos se piden al Backend por su identificador y el detalle muestra la ficha',async({page})=>{
 datos[0].imagenes=[{id_archivo:'33333333-3333-4333-8333-333333333333'},{id_archivo:'44444444-4444-4444-8444-444444444444'}];
 await page.route('**/api/v1/public/catalog/images/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#d9ece2"/></svg>'}));
 await abrir(page);
 await expect(page.locator('#catalogo-lista img').first()).toHaveAttribute('src',/\/api\/v1\/public\/catalog\/images\/33333333-3333-4333-8333-333333333333$/);
 await page.locator('#catalogo-lista article').first().getByRole('button',{name:/Ver detalle/}).click();
 const dialogo=page.getByRole('dialog');
 for(const valor of ['Producto 1','Organización A','Chile','Unidad de medida','unidad','Condiciones','Trabajo artesanal'])await expect(dialogo).toContainText(valor);
 await dialogo.getByRole('button',{name:'Ver foto 2 de Producto 1'}).click();
 await expect(dialogo.locator('#catalogo-detalle-galeria > div img').first()).toHaveAttribute('src',/44444444-4444-4444-8444-444444444444$/);
});
