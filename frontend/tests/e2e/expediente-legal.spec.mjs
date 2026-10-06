import { test, expect } from '@playwright/test';
const id='17600000-0000-4000-8000-000000000001';
const organizacion={id_organizacion:id,id_pais:id,nombre:'Organización Esperanza',nombre_representante:'Representante',telefono:'123456789',correo:'prueba@example.test',region_departamento:'Metropolitana',comuna_municipio_ciudad:'Santiago',direccion:'Calle 123',publico_objetivo:'Comunidad',descripcion_breve:'Organización de prueba',tipo_organizacion:'centro_comunitario',tipo_organizacion_otro:null,numero_beneficiarios:20,pais:{id_pais:id,nombre:'Chile',codigo_iso:'CL'},version:1};
const tipos=['identidad_representante','identificacion_legal','estatutos'];
let registro, fallo, solicitudes, espera;
const expediente=()=>({id_informacion_legal:id,id_organizacion:id,version:2,updated_at:'2026-10-06T12:00:00Z',estado_personalidad_juridica:'si',tipo_personalidad_juridica:'ONG',numero_registro:'12345',fecha_constitucion:'2020-01-10',vigencia_directiva:'Hasta diciembre de 2027',documentos:tipos.map(tipo=>({tipo,estado:'pendiente',nombre_archivo:null}))});
test.beforeEach(async({context})=>{
  registro=null;fallo=null;solicitudes=[];espera=0;
  await context.addInitScript(()=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa-admin',refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.test',user_metadata:{}}})));
  await context.route('http://127.0.0.1:54329/**',ruta=>ruta.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/api/v1/auth/session',ruta=>ruta.fulfill({json:{ok:true,data:{authenticated:true,user:{id}}}}));
  await context.route('**/api/v1/organizations/**',async ruta=>{
    if(!new URL(ruta.request().url()).pathname.endsWith('/legal-record'))return ruta.fulfill({json:{ok:true,data:{organization:organizacion}}});
    const metodo=ruta.request().method();solicitudes.push({metodo,cuerpo:ruta.request().postData()});
    if(espera)await new Promise(resolve=>setTimeout(resolve,espera));
    if(fallo)return ruta.fulfill({status:fallo.status,json:{ok:false,error:{code:fallo.code,message:fallo.message}}});
    if(metodo!=='GET'){
      const cuerpo=ruta.request().postData();
      const datos=JSON.parse(cuerpo.match(/name="datos"\r\n\r\n([^\r]+)/)[1]);
      registro={...datos,id_informacion_legal:id,id_organizacion:id,version:(registro?.version??0)+1,updated_at:'2026-10-06T12:00:00Z',documentos:datos.documentos.map(doc=>({...doc,nombre_archivo:doc.estado==='cargado'?'estatutos.pdf':null}))};
    }
    return ruta.fulfill({json:{ok:true,data:{expediente:registro}}});
  });
});
async function abrir(page,query=''){
  await page.goto(`/organizaciones/${id}${query}`);
  await page.getByRole('button',{name:'Expediente Legal',exact:true}).click();
}

test('registra, valida PDF y personalidad, confirma y conserva datos al consultar otra vez',async({page})=>{
  const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await abrir(page);
  await expect(page.locator('#legal-vacio')).toBeVisible();
  await page.getByRole('button',{name:'Registrar antecedente legal'}).click();
  await page.getByRole('button',{name:'Guardar antecedentes'}).click();
  await expect(page.locator('#legal-personalidad')).toHaveAttribute('aria-invalid','true');
  expect(solicitudes.filter(s=>s.metodo==='POST')).toHaveLength(0);
  await page.locator('#legal-personalidad').selectOption('en_proceso');
  await page.locator('#legal-pdf-estatutos').setInputFiles({name:'no.png',mimeType:'image/png',buffer:Buffer.from('png')});
  await expect(page.getByText('Solo se permiten archivos PDF.',{exact:true})).toBeVisible();
  await page.locator('#legal-pdf-estatutos').setInputFiles({name:'estatutos.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 prueba')});
  await page.locator('#legal-estado-identificacion_legal').selectOption('no_aplica');
  espera=350;
  await page.getByRole('button',{name:'Guardar antecedentes'}).click();
  await expect(page.locator('#legal-guardar')).toBeDisabled();
  await expect(page.locator('#legal-confirmacion')).toHaveText('Antecedentes legales guardados correctamente.');
  await expect(page.locator('[data-legal-estado="estatutos"]')).toHaveText('Cargado');
  await expect(page.locator('[data-legal-estado="identificacion_legal"]')).toHaveText('No aplica');
  expect(solicitudes.filter(s=>s.metodo==='POST')).toHaveLength(1);
  await abrir(page);
  await expect(page.locator('[data-legal-resumen="estado_personalidad_juridica"]')).toHaveText('En proceso');
  expect(errores).toEqual([]);
});

test('edita, cancelar conserva el registro y guardar envía la versión',async({page})=>{
  registro=expediente();
  await abrir(page);
  await page.getByRole('button',{name:'Editar antecedentes'}).click();
  await expect(page.locator('#legal-registro')).toHaveValue('12345');
  await page.locator('#legal-registro').fill('Sin guardar');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(page.locator('[data-legal-resumen="numero_registro"]')).toHaveText('12345');
  expect(solicitudes.filter(s=>s.metodo==='PATCH')).toHaveLength(0);
  await page.getByRole('button',{name:'Editar antecedentes'}).click();
  await page.locator('#legal-registro').fill('Registro actualizado');
  await page.getByRole('button',{name:'Guardar antecedentes'}).click();
  await expect(page.locator('#legal-confirmacion')).toBeVisible();
  expect(solicitudes.find(s=>s.metodo==='PATCH').cuerpo).toContain('"version_esperada":2');
  await expect(page.locator('[data-legal-resumen="numero_registro"]')).toHaveText('Registro actualizado');
});

test('ruta no disponible y errores no se presentan como expediente vacío ni éxito',async({page})=>{
  fallo={status:404,code:'RUTA_NO_ENCONTRADA',message:'Ruta no encontrada'};
  await abrir(page);
  await expect(page.locator('#legal-error')).toContainText('todavía no está disponible');
  await expect(page.locator('#legal-vacio')).toBeHidden();
  fallo=null;
  await page.getByRole('button',{name:'Reintentar carga'}).click();
  await page.getByRole('button',{name:'Registrar antecedente legal'}).click();
  await page.locator('#legal-personalidad').selectOption('no');
  fallo={status:403,code:'SIN_PERMISO',message:'No tienes permiso para guardar.'};
  await page.getByRole('button',{name:'Guardar antecedentes'}).click();
  await expect(page.locator('#legal-error')).toHaveText('No tienes permiso para guardar.');
  await expect(page.locator('#legal-personalidad')).toHaveValue('no');
  await expect(page.locator('#legal-confirmacion')).toBeHidden();
});

test('conflicto conserva cambios y exige recargar antes de guardar nuevamente',async({page})=>{
  registro=expediente();
  await abrir(page);await page.getByRole('button',{name:'Editar antecedentes'}).click();
  await page.locator('#legal-registro').fill('Mis cambios');
  fallo={status:409,code:'CONFLICTO_CONCURRENCIA',message:'El registro cambió en otra sesión. Recarga los datos.'};
  await page.getByRole('button',{name:'Guardar antecedentes'}).click();
  await expect(page.locator('#legal-guardar')).toBeDisabled();
  await expect(page.locator('#legal-registro')).toHaveValue('Mis cambios');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Editar antecedentes'}).click();
  await expect(page.locator('#legal-guardar')).toBeDisabled();
  fallo=null;registro.numero_registro='Versión del servidor';
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Recargar datos del servidor'}).click();
  await expect(page.locator('[data-legal-resumen="numero_registro"]')).toHaveText('Versión del servidor');
});

test('demostración explícita permite revisar en móvil sin llamadas al servicio legal',async({page},info)=>{
  await page.setViewportSize({width:390,height:2400});
  await abrir(page,'?expediente=demo');
  await expect(page.locator('#legal-demo')).toBeVisible();
  await page.getByRole('button',{name:'Registrar antecedente legal'}).click();
  await page.locator('#legal-personalidad').selectOption('si');
  await page.locator('#legal-tipo').selectOption('Fundación');
  await page.locator('#legal-registro').fill('12345678-9');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).opacity==='1');
  await page.locator('#expediente-legal').screenshot({path:info.outputPath('formulario-movil.png')});
  await page.getByRole('button',{name:'Guardar antecedentes'}).click();
  await expect(page.locator('#legal-confirmacion')).toContainText('no se guardaron en el servidor');
  expect(solicitudes).toHaveLength(0);
});
