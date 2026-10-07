import { test, expect } from '@playwright/test';
const id='17600000-0000-4000-8000-000000000001';
const organizacion={id_organizacion:id,id_pais:id,nombre:'Organización Esperanza',nombre_representante:'Representante',telefono:'123456789',correo:'prueba@example.test',region_departamento:'Metropolitana',comuna_municipio_ciudad:'Santiago',direccion:'Calle 123',publico_objetivo:'Comunidad',descripcion_breve:'Organización de prueba',tipo_organizacion:'centro_comunitario',tipo_organizacion_otro:null,numero_beneficiarios:20,pais:{id_pais:id,nombre:'Chile',codigo_iso:'CL'},version:1};
const campos={id_acta:'acta-1',descripcion:'Entregar documentación',responsable_nombre:'Ana',responsable_contacto:'ana@example.test',fecha_limite:'2020-01-01',observaciones:'',estado:'pendiente'};
const registro=()=>({...campos,id_compromiso:'comp-1',id_organizacion:id,version:1,created_at:'2026-10-07T12:00:00Z',updated_at:'2026-10-07T12:00:00Z',cumplido_at:null});
let lista,fallo,solicitudes,origenes,demora;
test.beforeEach(async({context})=>{
  lista=[];fallo=null;solicitudes=[];demora=0;origenes=[{id_acta:'acta-1',nombre:'Acta de coordinación',id_plan:'plan-1',id_accion:'accion-1'}];
  await context.addInitScript(()=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa-admin',refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.test',user_metadata:{}}})));
  await context.route('http://127.0.0.1:54329/**',ruta=>ruta.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/api/v1/auth/session',ruta=>ruta.fulfill({json:{ok:true,data:{authenticated:true,user:{id}}}}));
  await context.route('**/api/v1/organizations/**',async ruta=>{
    const path=new URL(ruta.request().url()).pathname;
    if(!path.includes('/commitments'))return ruta.fulfill({json:{ok:true,data:{organization:organizacion}}});
    const method=ruta.request().method(); solicitudes.push({method,path,body:ruta.request().postDataJSON()});
    if(demora)await new Promise(resolve=>setTimeout(resolve,demora));
    if(fallo)return ruta.fulfill({status:fallo.status,json:{ok:false,error:{code:fallo.code,message:fallo.message}}});
    if(path.endsWith('/origins'))return ruta.fulfill({json:{ok:true,data:{actas:origenes}}});
    if(method==='GET')return ruta.fulfill({json:{ok:true,data:path.endsWith('/commitments')?{compromisos:lista}:{compromiso:lista[0]}}});
    const body=ruta.request().postDataJSON();const {version_esperada,...datos}=body;
    const r={...registro(),...datos,version:(lista[0]?.version??0)+1,cumplido_at:datos.estado==='cumplido'?'2026-10-07T12:00:00Z':null};lista=[r];
    return ruta.fulfill({json:{ok:true,data:{compromiso:r}}});
  });
});
async function abrir(page){await page.goto(`/organizaciones/${id}`);await page.getByRole('button',{name:'Compromisos',exact:true}).click();}
async function completar(page){
  await page.locator('#comp-acta').selectOption('acta-1');
  await page.locator('#comp-descripcion').fill(campos.descripcion);
  await page.locator('#comp-responsable').fill(campos.responsable_nombre);
  await page.locator('#comp-contacto').fill(campos.responsable_contacto);
  await page.locator('#comp-fecha').fill(campos.fecha_limite);
}
test('registra, exige contacto, consulta, marca vencido y conserva al recargar',async({page})=>{
  await abrir(page);await expect(page.locator('#comp-vacio')).toBeVisible();
  await page.getByRole('button',{name:'Registrar compromiso',exact:true}).click();
  await completar(page);await page.locator('#comp-contacto').fill('');
  await page.getByRole('button',{name:'Guardar compromiso',exact:true}).click();
  await expect(page.locator('#comp-contacto')).toHaveAttribute('aria-invalid','true');
  expect(solicitudes.filter(s=>s.method==='POST')).toHaveLength(0);
  await page.locator('#comp-contacto').fill(campos.responsable_contacto);demora=250;
  await expect(page.locator('#comp-estado')).toBeDisabled();
  await page.getByRole('button',{name:'Guardar compromiso',exact:true}).click();
  await expect(page.locator('#comp-guardar')).toBeDisabled();
  await expect(page.locator('#comp-exito')).toHaveText('Compromiso guardado correctamente.');
  await expect(page.locator('#comp-datos')).toContainText('Pendiente · Vencido');
  await expect(page.locator('#comp-origen')).toHaveAttribute('href',`/organizaciones/${id}?acta=acta-1#tab-actas`);
  await expect(page.locator('#comp-accion')).toHaveAttribute('href','/planes/plan-1/acciones/accion-1');
  expect(solicitudes.filter(s=>s.method==='POST')).toHaveLength(1);
  await abrir(page);await expect(page.locator('#comp-lista')).toContainText(campos.descripcion);
});
test('cancelar no cambia datos; editar actualiza estado y envía versión',async({page})=>{
  lista=[registro()];await abrir(page);await page.locator('#comp-lista button').click();
  await page.locator('#comp-editar').click();await page.locator('#comp-descripcion').fill('Sin guardar');
  await page.locator('#comp-cancelar').click();await expect(page.locator('#comp-datos')).not.toContainText('Sin guardar');
  await page.locator('#comp-editar').click();await page.locator('#comp-estado').selectOption('cumplido');
  await page.locator('#comp-guardar').click();await expect(page.locator('#comp-exito')).toBeVisible();
  await expect(page.locator('#comp-datos')).not.toContainText('Vencido');
  expect(solicitudes.find(s=>s.method==='PATCH').body.version_esperada).toBe(1);
});
test('error de servicio no aparece como vacío y sin actas no permite crear',async({page})=>{
  fallo={status:404,code:'RUTA_NO_ENCONTRADA',message:'Ruta no encontrada'};
  await abrir(page);await expect(page.locator('#comp-error')).toContainText('todavía no está disponible');
  await expect(page.locator('#comp-vacio')).toBeHidden();await expect(page.locator('#comp-demo')).toBeVisible();
  fallo=null;origenes=[];await page.locator('#comp-recargar').click();
  await expect(page.locator('#comp-sin-actas')).toBeVisible();await expect(page.locator('#comp-nuevo')).toBeDisabled();
});
test('permiso denegado conserva formulario; conflicto exige recarga incluso tras cancelar',async({page})=>{
  lista=[registro()];await abrir(page);await page.locator('#comp-lista button').click();await page.locator('#comp-editar').click();
  await page.locator('#comp-descripcion').fill('Cambio local');
  fallo={status:403,code:'SIN_PERMISO',message:'No tienes permiso.'};await page.locator('#comp-guardar').click();
  await expect(page.locator('#comp-error')).toHaveText('No tienes permiso.');await expect(page.locator('#comp-descripcion')).toHaveValue('Cambio local');
  await expect(page.locator('#comp-exito')).toBeHidden();
  fallo={status:409,code:'CONFLICTO',message:'Recarga los datos.'};await page.locator('#comp-guardar').click();
  await expect(page.locator('#comp-guardar')).toBeDisabled();await page.locator('#comp-cancelar').click();await page.locator('#comp-editar').click();
  await expect(page.locator('#comp-guardar')).toBeDisabled();
  fallo=null;lista[0].descripcion='Cambio servidor';page.once('dialog',d=>d.accept());await page.locator('#comp-recargar').click();
  await expect(page.locator('#comp-lista')).toContainText('Cambio servidor');
});
test('acta con varios compromisos conecta con demo visible, detalle de origen y móvil',async({page},info)=>{
  const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await abrir(page);
  await page.getByRole('button',{name:'Actas de Reunión',exact:true}).click();
  await page.locator('#actas-nueva').click();
  await page.locator('#actas-asistentes').selectOption({label:'Jorge Páez'});
  await page.locator('#actas-objetivo').fill('Reunión de seguimiento');
  for(const descripcion of ['Primer compromiso','Segundo compromiso']){
    await page.locator('#actas-agregar-compromiso').click();
    const grupo=page.locator('[data-borradores] fieldset').last();
    for(const [nombre,valor] of Object.entries({...campos,descripcion})){
      const input=grupo.locator(`[data-campo="${nombre}"]`);if(await input.count())await input.fill(valor);
    }
  }
  await page.locator('#actas-guardar').click();
  await expect(page.locator('#actas-mensaje')).toContainText('se registró');
  await page.getByRole('button',{name:'Compromisos',exact:true}).click();
  await page.locator('#comp-demo').click();
  await expect(page.locator('#comp-lista article')).toHaveCount(2);
  const total=solicitudes.length;
  await page.locator('#comp-lista button').first().click();await page.locator('#comp-origen').click();
  await expect(page.locator('#actas-detalle')).toBeVisible();
  await expect(page.locator('#actas-compromisos-detalle')).toContainText('Segundo compromiso');
  await page.getByRole('button',{name:'Compromisos',exact:true}).click();
  await page.locator('#comp-lista button').first().click();await page.locator('#comp-editar').click();
  await page.setViewportSize({width:390,height:1500});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).opacity==='1');
  await page.waitForFunction(()=>document.querySelector('#app-sidebar').getBoundingClientRect().right<=0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('#comp-form').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  await page.locator('#compromisos').screenshot({path:info.outputPath('compromisos-movil.png'),animations:'disabled'});
  await page.locator('#comp-estado').selectOption('cumplido');await page.locator('#comp-guardar').click();
  await expect(page.locator('#comp-exito')).toContainText('No se guardó en el servidor');
  expect(solicitudes).toHaveLength(total);expect(errores).toEqual([]);
});
