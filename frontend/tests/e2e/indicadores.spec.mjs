import { test, expect } from '@playwright/test';
import { catalogoDemo } from '../../src/lib/indicadores/demo.ts';
const id='11200000-0000-4000-8000-000000000100', iid='11200000-0000-4000-8000-000000000200', rid='11200000-0000-4000-8000-000000000300';
const accion={id_accion:id,id_plan:id,nombre:'Seguimiento de la intervención comunitaria',responsable_nombre:'Ana Pérez',fecha_inicio:'2026-10-01',fecha_termino:'2026-10-30',estado:'en_desarrollo',descripcion:'Registrar la participación y las metas de la actividad.',observacion_motivo:null,resultado_esperado:'Seguimiento registrado.',version:1,plan:{id_plan:id,nombre:'Plan de fortalecimiento comunitario'}};
const item=()=>({id_indicador:iid,id_accion:id,id_catalogo:catalogoDemo[0].id_indicador,meta:20,version:1,resultado:null});
let lista,catalogo,fallo,solicitudes,demora;
test.beforeEach(async({context})=>{
  lista=[];catalogo=structuredClone(catalogoDemo);fallo=null;solicitudes=[];demora=0;
  await context.addInitScript(()=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa-admin',refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'11200000-0000-4000-8000-000000000100',email:'qa@example.test',user_metadata:{}}})));
  await context.route('http://127.0.0.1:54329/**',r=>r.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/api/v1/auth/session',r=>r.fulfill({json:{ok:true,data:{authenticated:true,user:{id}}}}));
  await context.route('**/api/v1/actions/**',r=>r.fulfill({json:{ok:true,data:{action:accion}}}));
  await context.route('**/api/v1/evidences**',r=>r.fulfill({json:{ok:true,data:{evidences:[]}}}));
  await context.route(/\/api\/v1\/(indicators(?:\/.*)?|results(?:\/.*)?|actions\/[^/]+\/indicators)$/,async r=>{
    const path=new URL(r.request().url()).pathname,method=r.request().method(),body=r.request().postDataJSON();
    solicitudes.push({path,method,body});
    if(demora)await new Promise(resolve=>setTimeout(resolve,demora));
    if(fallo)return r.fulfill({status:fallo.status,json:{ok:false,error:{code:fallo.code,message:fallo.message}}});
    if(path.endsWith('/catalog'))return r.fulfill({json:{ok:true,data:{catalogo}}});
    if(method==='GET')return r.fulfill({json:{ok:true,data:{indicadores:lista}}});
    if(path.endsWith('/indicators')&&method==='POST'){
      const nuevos=body.indicadores.map((e,index)=>({...item(),id_indicador:`11200000-0000-4000-8000-${String(200+index).padStart(12,'0')}`,id_catalogo:e.id_indicador,meta:e.meta}));
      lista.push(...nuevos);return r.fulfill({json:{ok:true,data:{indicadores:nuevos}}});
    }
    if(path.includes('/results')){
      lista[0].resultado={id_resultado:rid,id_indicador:iid,...(body.cambios??body),version:(lista[0].resultado?.version??0)+1};
      return r.fulfill({json:{ok:true,data:{resultado:lista[0].resultado}}});
    }
    lista[0]={...lista[0],meta:body.cambios.meta,version:lista[0].version+1};
    return r.fulfill({json:{ok:true,data:{indicador:lista[0]}}});
  });
});
async function abrir(page){await page.goto(`/planes/${id}/acciones/${id}`);await expect(page.locator('#ind-asociar')).toBeEnabled();}
async function seleccionar(page,index,meta){const c=catalogoDemo[index];await page.locator(`[data-catalogo="${c.id_indicador}"]`).check();await page.locator(`[data-meta="${c.id_indicador}"]`).fill(meta);}

test('catálogo, validaciones junto al campo y asociación de varios indicadores sin duplicados',async({page})=>{
  await abrir(page);await expect(page.locator('#ind-vacio')).toBeVisible();await expect(page.locator('[data-catalogo]')).toHaveCount(5);
  await page.locator('#ind-asociar').click();await expect(page.locator('#ind-seleccion-error')).toContainText('Selecciona al menos uno'.replace('uno','un indicador'));
  await seleccionar(page,0,'');await page.locator('#ind-asociar').click();await expect(page.locator(`[data-meta="${catalogoDemo[0].id_indicador}"]`)).toHaveAttribute('aria-invalid','true');
  expect(solicitudes.filter(s=>s.method==='POST')).toHaveLength(0);
  await page.locator(`[data-meta="${catalogoDemo[0].id_indicador}"]`).fill('20');await seleccionar(page,1,'0');demora=200;
  await page.locator('#ind-asociar').click();await expect(page.locator('#ind-asociar')).toBeDisabled();
  await expect(page.locator('#ind-exito')).toHaveText('Indicadores asociados correctamente.');await expect(page.locator('#ind-lista article')).toHaveCount(2);
  await expect(page.locator(`[data-catalogo="${catalogoDemo[0].id_indicador}"]`)).toBeDisabled();
  expect(solicitudes.filter(s=>s.method==='POST')).toHaveLength(1);
  await abrir(page);await expect(page.locator('#ind-lista article')).toHaveCount(2);
});
test('resultado cero se registra, se actualiza y permanece independiente de la meta; cancelar no guarda',async({page})=>{
  lista=[item()];await abrir(page);await expect(page.locator('#ind-lista')).toContainText('Sin registrar');
  await page.getByRole('button',{name:'Registrar resultado',exact:true}).click();await page.locator('#ind-guardar').click();await expect(page.locator('#ind-valor')).toHaveAttribute('aria-invalid','true');
  await page.locator('#ind-valor').fill('0');await page.locator('#ind-fecha').fill('2026-10-15');await page.locator('#ind-guardar').click();
  await expect(page.locator('#ind-dialogo')).not.toBeVisible();await expect(page.locator('#ind-lista')).not.toContainText('Sin registrar');
  await expect(page.locator('#ind-lista dd').nth(1)).toHaveText('0');await expect(page.locator('#ind-lista dd').first()).toHaveText('20');
  await page.getByRole('button',{name:'Editar meta',exact:true}).click();await page.locator('#ind-valor').fill('30');await page.locator('#ind-guardar').click();
  await expect(page.locator('#ind-lista dd').first()).toHaveText('30');await expect(page.locator('#ind-lista dd').nth(1)).toHaveText('0');
  await page.getByRole('button',{name:'Actualizar resultado',exact:true}).click();await page.locator('#ind-valor').fill('9');await page.locator('#ind-cancelar').click();
  await expect(page.locator('#ind-lista dd').nth(1)).toHaveText('0');
  await page.getByRole('button',{name:'Actualizar resultado',exact:true}).click();await page.locator('#ind-valor').fill('25');await page.locator('#ind-guardar').click();
  await expect(page.locator('#ind-lista dd').nth(1)).toHaveText('25');
  const guardado=solicitudes.find(s=>s.path.includes(`/results/${rid}`));expect(guardado.method).toBe('PATCH');expect(guardado.body.version_esperada).toBe(1);
});
test('error de servicio no es estado vacío; demo visible no escribe HTTP y se pierde al recargar',async({page})=>{
  fallo={status:404,code:'RUTA_NO_ENCONTRADA',message:'Ruta pendiente'};
  await page.goto(`/planes/${id}/acciones/${id}`);await expect(page.locator('#ind-error')).toContainText('todavía no está disponible');await expect(page.locator('#ind-vacio')).toBeHidden();
  await page.locator('#ind-demo').click();await expect(page.locator('#ind-demo-aviso')).toContainText('Modo demostración');
  const total=solicitudes.length;await seleccionar(page,0,'10');await page.locator('#ind-asociar').click();await expect(page.locator('#ind-exito')).toContainText('No se guardaron en el servidor');
  await page.getByRole('button',{name:'Registrar resultado',exact:true}).click();await page.locator('#ind-valor').fill('3');await page.locator('#ind-guardar').click();await expect(page.locator('#ind-exito')).toContainText('No se guardó en el servidor');
  expect(solicitudes).toHaveLength(total);
  await page.reload();await expect(page.locator('#ind-demo')).toBeVisible();await page.locator('#ind-demo').click();await expect(page.locator('#ind-vacio')).toBeVisible();
});
test('403 conserva entradas y conflicto bloquea guardado hasta recargar',async({page})=>{
  lista=[item()];await abrir(page);await page.getByRole('button',{name:'Editar meta',exact:true}).click();await page.locator('#ind-valor').fill('50');
  fallo={status:403,code:'SIN_PERMISO',message:'No tienes permiso para editar.'};await page.locator('#ind-guardar').click();await expect(page.locator('#ind-dialogo-error')).toContainText('No tienes permiso');await expect(page.locator('#ind-valor')).toHaveValue('50');
  fallo={status:409,code:'CONFLICTO_CONCURRENCIA',message:'La meta cambió.'};await page.locator('#ind-guardar').click();await expect(page.locator('#ind-guardar')).toBeDisabled();
  await page.locator('#ind-cancelar').click();await page.getByRole('button',{name:'Editar meta',exact:true}).click();await expect(page.locator('#ind-guardar')).toBeDisabled();
  await page.locator('#ind-cancelar').click();fallo=null;lista[0].meta=40;lista[0].version=2;await page.locator('#ind-recargar').click();await expect(page.locator('#ind-lista dd').first()).toHaveText('40');
  await page.getByRole('button',{name:'Editar meta',exact:true}).click();await expect(page.locator('#ind-guardar')).toBeEnabled();
});
test('respuesta incierta al asociar conserva selección y evita un segundo envío',async({page})=>{
  await abrir(page);await seleccionar(page,0,'20');fallo={status:503,code:'SERVICIO_NO_DISPONIBLE',message:'No fue posible confirmar la operación.'};
  await page.locator('#ind-asociar').click();await expect(page.locator('#ind-error')).toContainText('Conservamos los valores');await expect(page.locator('#ind-asociar')).toBeDisabled();
  await expect(page.locator(`[data-meta="${catalogoDemo[0].id_indicador}"]`)).toHaveValue('20');await expect(page.locator('#ind-exito')).toBeHidden();
  fallo=null;page.once('dialog',d=>d.accept());await page.locator('#ind-recargar').click();await expect(page.locator('#ind-asociar')).toBeEnabled();
});
test('catálogo vacío deshabilita asociación y no inventa indicadores',async({page})=>{
  catalogo=[];await page.goto(`/planes/${id}/acciones/${id}`);await expect(page.locator('#ind-catalogo-vacio')).toBeVisible();await expect(page.locator('#ind-asociar')).toBeDisabled();
});
test('vista de escritorio y móvil legible, sin desbordamiento; modal accesible',async({page},info)=>{
  lista=[{...item(),resultado:{id_resultado:rid,id_indicador:iid,valor_medido:15,fecha_medicion:'2026-10-15',observaciones:'Registro de asistencia de la jornada.',version:1}}];
  const errores=[];page.on('pageerror',e=>errores.push(e.message));await page.setViewportSize({width:1536,height:2400});await abrir(page);
  await page.addStyleTag({content:'astro-dev-toolbar {display:none!important}'});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).opacity==='1');
  expect(await page.locator('#ind-lista dd').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(24);
  await page.locator('#indicadores-accion').screenshot({path:info.outputPath('indicadores-escritorio.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:3400});await page.waitForFunction(()=>document.querySelector('#app-sidebar').getBoundingClientRect().right<=0);
  expect(await page.locator('#indicadores-accion').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  await page.locator('#indicadores-accion').screenshot({path:info.outputPath('indicadores-movil.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Actualizar resultado',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();expect(errores).toEqual([]);
});
