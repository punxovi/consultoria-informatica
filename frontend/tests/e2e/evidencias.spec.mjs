import { test, expect } from '@playwright/test';
const id='17600000-0000-4000-8000-000000000001', eid='17600000-0000-4000-8000-000000000002';
const accion={id_accion:id,id_plan:id,nombre:'Visita de seguimiento comunitario',responsable_nombre:'Ana Pérez',fecha_inicio:'2026-10-01',fecha_termino:'2026-10-30',estado:'en_desarrollo',descripcion:'Revisar los acuerdos y documentar los avances de la intervención.',observacion_motivo:null,resultado_esperado:'Acuerdos de seguimiento registrados.',version:1,plan:{id_plan:id,nombre:'Plan de fortalecimiento comunitario'}};
const pdf={name:'acta.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 prueba')};
const item=()=>({id_evidencia:eid,id_accion:id,origen:'Visita en terreno',descripcion:'Acta de seguimiento',nombre_original:pdf.name,mime_type:pdf.mimeType,tamano_bytes:pdf.buffer.length,estado_carga:'disponible',estado_publicacion:'no_publicada',consentimiento_declarado:true,declaracion_consentimiento:'Declaro que no aparecen personas identificables.',incorporado_at:'2026-10-15T12:00:00Z',incorporado_por:id,consentimiento_at:'2026-10-15T12:00:00Z',consentimiento_por:id,version:2});
let lista,llamadas,errorPut,errorPatch,errorList,errorPost,demora;
test.beforeEach(async({context})=>{
  lista=[];llamadas=[];errorPut=null;errorPatch=null;errorList=null;errorPost=null;demora=0;
  await context.addInitScript(()=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa-admin',refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.test',user_metadata:{}}})));
  await context.route('http://127.0.0.1:54329/**',r=>r.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/api/v1/auth/session',r=>r.fulfill({json:{ok:true,data:{authenticated:true,user:{id}}}}));
  await context.route('**/api/v1/actions/**',r=>r.fulfill({json:{ok:true,data:{action:accion}}}));
  await context.route('**/api/v1/evidences**',async r=>{
    const req=r.request(),method=req.method(),path=new URL(req.url()).pathname;
    llamadas.push({method,url:req.url(),body:method==='POST'||method==='PATCH'?req.postDataJSON():null,type:req.headers()['content-type'],bytes:req.postDataBuffer(),auth:req.headers().authorization});
    if(demora)await new Promise(resolve=>setTimeout(resolve,demora));
    const error=method==='PUT'?errorPut:method==='PATCH'?errorPatch:method==='POST'?errorPost:path.endsWith('/evidences')?errorList:null;
    if(error)return r.fulfill({status:error.status,json:{ok:false,error:{code:error.code,message:error.message}}});
    if(method==='GET'&&path.endsWith('/file'))return r.fulfill({contentType:'application/pdf',body:pdf.buffer,headers:{'Content-Disposition':'attachment; filename="acta.pdf"'}});
    if(method==='POST'){
      const {consentimiento,...datos}=req.postDataJSON();lista=[{...item(),...datos,...consentimiento,estado_carga:'reservado',version:1}];
    }
    if(method==='PUT'){lista[0]={...lista[0],estado_carga:'disponible',version:lista[0].version+1};}
    if(method==='PATCH'){
      const {cambios,version_esperada}=req.postDataJSON();
      if(version_esperada!==lista[0].version)return r.fulfill({status:409,json:{ok:false,error:{code:'CONFLICTO_CONCURRENCIA',message:'Recarga antes de guardar.'}}});
      const {consentimiento,...rest}=cambios;lista[0]={...lista[0],...rest,...consentimiento,version:lista[0].version+1};
    }
    return r.fulfill({json:{ok:true,data:method==='GET'&&path.endsWith('/evidences')?{evidences:lista}:{evidence:lista[0]}}});
  });
});
async function abrir(page){await page.goto(`/planes/${id}/acciones/${id}`);await expect(page.locator('#ev-archivo')).toBeEnabled();}
async function llenar(page,personas='sin_personas'){
  await page.locator('#ev-archivo').setInputFiles(pdf);await page.locator('#ev-origen').fill('Visita en terreno');
  await page.locator('#ev-descripcion').fill('Acta de seguimiento');await page.locator('#ev-personas').selectOption(personas);
}
test('adjunta sin publicar, descarga con sesión y mantiene datos al recargar',async({page})=>{
  await abrir(page);await expect(page.locator('#ev-vacio')).toBeVisible();await llenar(page);demora=200;
  await page.locator('#ev-guardar').click();await expect(page.locator('#ev-archivo')).toBeDisabled();
  await expect(page.locator('#ev-exito')).toContainText('Archivo guardado correctamente');
  expect(llamadas.filter(x=>x.method==='POST')).toHaveLength(1);
  const put=llamadas.find(x=>x.method==='PUT');expect(put.bytes).toEqual(pdf.buffer);expect(put.type).toBe('application/pdf');
  expect(put.auth).toBe('Bearer qa-admin');expect(llamadas.filter(x=>x.method==='PATCH')).toHaveLength(0);
  const descarga=page.waitForEvent('download');await page.locator('#ev-descargar').click();expect((await descarga).suggestedFilename()).toBe('acta.pdf');
  await abrir(page);await expect(page.locator('#ev-lista')).toContainText('acta.pdf');
});
test('valida formatos y consentimiento de menores antes de reservar',async({page})=>{
  await abrir(page);await llenar(page,'menores');await page.locator('#ev-guardar').click();
  await expect(page.locator('#ev-consentimiento')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#ev-tutor')).toHaveAttribute('aria-invalid','true');
  expect(llamadas.filter(x=>x.method==='POST')).toHaveLength(0);
  await page.locator('#ev-consentimiento').check();await page.locator('#ev-tutor').check();
  await page.locator('#ev-archivo').setInputFiles({name:'archivo.exe',mimeType:'application/octet-stream',buffer:Buffer.from('abc')});
  await page.locator('#ev-guardar').click();await expect(page.locator('#ev-archivo')).toHaveAttribute('aria-invalid','true');
  await page.locator('#ev-archivo').setInputFiles(pdf);await page.locator('#ev-publicable').check();await page.locator('#ev-guardar').click();
  await expect(page.locator('#ev-exito')).toContainText('marcado como publicado');
  expect(llamadas.find(x=>x.method==='POST').body.consentimiento.declaracion_consentimiento).toContain('padre, madre o tutor');
  const methods=llamadas.map(x=>x.method);expect(methods.indexOf('PUT')).toBeLessThan(methods.indexOf('PATCH'));
});
test('reintenta archivo sin duplicar reserva y permite recuperar después de recargar',async({page})=>{
  await abrir(page);await llenar(page);errorPut={status:503,code:'STORAGE_NO_DISPONIBLE',message:'Storage no disponible.'};
  await page.locator('#ev-guardar').click();await expect(page.locator('#ev-error')).toContainText('El registro se conserva');
  await expect(page.locator('#ev-exito')).toBeHidden();await expect(page.locator('#ev-lista')).toContainText('Carga pendiente');
  errorPut=null;await abrir(page);await page.locator('#ev-lista button').click();await page.locator('#ev-reintentar').click();
  await page.locator('#ev-archivo').setInputFiles(pdf);await page.locator('#ev-guardar').click();
  await expect(page.locator('#ev-exito')).toContainText('guardado correctamente');expect(llamadas.filter(x=>x.method==='POST')).toHaveLength(1);
});
test('fallo de publicación conserva el archivo; revocación retira publicación y bloquea publicarla',async({page})=>{
  await abrir(page);await llenar(page);await page.locator('#ev-publicable').check();errorPatch={status:403,code:'SIN_PERMISO',message:'Sin permiso para publicar.'};
  await page.locator('#ev-guardar').click();await expect(page.locator('#ev-error')).toContainText('El archivo se guardó');
  await expect(page.locator('#ev-datos')).toContainText('Archivo disponible');await expect(page.locator('#ev-exito')).toBeHidden();
  errorPatch=null;page.once('dialog',d=>d.accept());await page.locator('#ev-publicar').click();await expect(page.locator('#ev-exito')).toContainText('marcada como publicada');
  page.once('dialog',d=>d.accept('La persona retiró su autorización.'));await page.locator('#ev-revocar').click();
  await expect(page.locator('#ev-exito')).toContainText('Consentimiento revocado');await expect(page.locator('#ev-publicar')).toBeDisabled();
  expect(lista[0].estado_publicacion).toBe('retirada');expect(lista[0].consentimiento_declarado).toBe(false);
});
test('errores de lista y reserva incierta no muestran falso vacío ni permiten duplicar',async({page})=>{
  errorList={status:403,code:'SIN_PERMISO',message:'No tienes permiso para consultar evidencias.'};
  await page.goto(`/planes/${id}/acciones/${id}`);await expect(page.locator('#ev-error')).toContainText('No tienes permiso');
  await expect(page.locator('#ev-vacio')).toBeHidden();await expect(page.locator('#ev-archivo')).toBeDisabled();
  errorList=null;await page.locator('#ev-recargar').click();await expect(page.locator('#ev-archivo')).toBeEnabled();
  await llenar(page);errorPost={status:502,code:'ERROR_BASE_DATOS',message:'No se confirmó la operación.'};
  await page.locator('#ev-guardar').click();await expect(page.locator('#ev-error')).toContainText('Actualiza');
  await expect(page.locator('#ev-guardar')).toBeDisabled();
});
test('conflicto al publicar requiere versión actual; cancelar no registra archivos',async({page})=>{
  lista=[item()];await abrir(page);await llenar(page);await page.locator('#ev-cancelar').click();expect(llamadas.filter(x=>x.method==='POST')).toHaveLength(0);
  await page.locator('#ev-lista button').click();lista[0].version=3;page.once('dialog',d=>d.accept());await page.locator('#ev-publicar').click();
  await expect(page.locator('#ev-error')).toContainText('Recarga');await expect(page.locator('#ev-exito')).toBeHidden();
  await page.locator('#ev-recargar').click();page.once('dialog',d=>d.accept());await page.locator('#ev-publicar').click();
  await expect(page.locator('#ev-exito')).toContainText('marcada como publicada');
});
test('jerarquía y distribución en escritorio y móvil',async({page},info)=>{
  lista=[item()];await page.setViewportSize({width:1536,height:1800});await abrir(page);
  await page.addStyleTag({content:'astro-dev-toolbar { display: none !important; }'});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).opacity==='1');
  const titulo=page.locator('[data-accion="nombre"]');expect(await titulo.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(32);
  expect(await page.locator('#accion-detalle').evaluate(n=>n.clientWidth)).toBeGreaterThan(1100);
  await page.locator('#main-content').screenshot({path:info.outputPath('evidencias-escritorio.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:3400});await page.waitForFunction(()=>document.querySelector('#app-sidebar').getBoundingClientRect().right<=0);
  expect(await page.locator('#evidencias-accion').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  await page.locator('#evidencias-accion').screenshot({path:info.outputPath('evidencias-movil.png'),animations:'disabled'});
});
