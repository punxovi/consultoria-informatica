import { test, expect } from '@playwright/test';
const id = '17600000-0000-4000-8000-000000000001';
const pais = { id_pais: id, nombre: 'Chile', codigo_iso: 'CL' };
const paisDos = { id_pais: '17600000-0000-4000-8000-000000000004', nombre: 'Argentina', codigo_iso: 'AR' };
const programaId = '17600000-0000-4000-8000-000000000003';
const programa = { id_programa: programaId, nombre: 'Alimentación comunitaria', lineas_accion: [] };
const org = {id_organizacion:id,id_pais:id,nombre:'Comedor Solidario Las Palmas',nombre_representante:'María Castillo',telefono:'912345678',correo:'contacto@example.test',region_departamento:'Región Metropolitana',comuna_municipio_ciudad:'Santiago',direccion:'Avenida Las Palmas 123',publico_objetivo:'Familias y personas mayores de la comunidad.',descripcion_breve:'Trabajamos junto a las familias del barrio para fortalecer el acceso a una alimentación saludable y el encuentro comunitario.',tipo_organizacion:'comedor_merendero',tipo_organizacion_otro:null,numero_beneficiarios:312,pais,version:1,archived_at:null};
const orgDos = {...org,id_organizacion:'17600000-0000-4000-8000-000000000002',id_pais:paisDos.id_pais,nombre:'Centro Comunitario Esperanza',numero_beneficiarios:84,pais:paisDos};
const organizaciones = [org, orgDos];
let denegarListado = false;
let retrasarBusquedaPalmas = false;
test.beforeEach(async ({context}) => {
  denegarListado = false;
  retrasarBusquedaPalmas = false;
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({access_token:'qa-admin',refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.test',user_metadata:{}}})));
  await context.route('http://127.0.0.1:54329/**',r=>r.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/api/v1/auth/session',r=>r.fulfill({json:{ok:true,data:{authenticated:true,user:{id}}}}));
  await context.route('**/api/v1/programs',r=>r.fulfill({json:{ok:true,data:{programs:[programa]}}}));
  await context.route('**/api/v1/organizations**',async r=>{
    const url=new URL(r.request().url());
    const path=url.pathname;
    if(path.endsWith('/organizations')&&denegarListado) return r.fulfill({status:403,json:{ok:false,error:{code:'SIN_PERMISO',message:'La sesión no tiene permiso para consultar organizaciones.'},data:null}});
    if(path.endsWith('/organizations')&&retrasarBusquedaPalmas&&url.searchParams.get('search')==='palmas') await new Promise(resolve=>setTimeout(resolve,700));
    const programasPorOrganizacion=new Map([[org.id_organizacion,programaId]]);
    const filtradas=organizaciones.filter(item=>{
      const busqueda=url.searchParams.get('search')?.toLocaleLowerCase('es') ?? '';
      return (!busqueda||item.nombre.toLocaleLowerCase('es').includes(busqueda))
        &&(!url.searchParams.has('id_pais')||item.id_pais===url.searchParams.get('id_pais'))
        &&(!url.searchParams.has('id_programa')||programasPorOrganizacion.get(item.id_organizacion)===url.searchParams.get('id_programa'));
    });
    const data=path.endsWith('/countries')?{countries:[pais,paisDos]}:path.endsWith('/organizations')?{organizations:filtradas}:path.endsWith('/legal-record')?{expediente:null}:{organization:org};
    return r.fulfill({json:{ok:true,data}});
  });
});
async function captura(page,info,nombre) {
  await page.addStyleTag({content:'astro-dev-toolbar { display: none !important; }'});
  await expect(page.locator('#main-content')).toHaveCSS('opacity','1');
  if (page.viewportSize().width < 768) {
    await expect.poll(() => page.locator('#app-sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({path:info.outputPath(nombre+'.png'),fullPage:true});
  expect(await page.locator('#main-content').evaluate(el=>el.scrollWidth <= el.clientWidth+1)).toBe(true);
  expect(await page.locator('#main-content').evaluate(el=>el.getBoundingClientRect().right <= innerWidth+1)).toBe(true);
  expect(await page.locator('.org-hero').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true);
}
test('listado, búsqueda, limpieza y detalle en escritorio y móvil',async({page},info)=>{
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('/organizaciones');
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(2);
  await page.locator('#buscar-organizacion').fill('palmas');
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(1);
  await page.locator('#limpiar-organizaciones').click();
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(2);
  await page.locator('#filtro-programa').selectOption(programaId);
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(1);
  await expect(page.locator('#organizaciones-lista article')).toContainText('Comedor Solidario Las Palmas');
  const enlaceDetalleFiltrado = await page.locator('#organizaciones-lista article a').first().getAttribute('href');
  expect(enlaceDetalleFiltrado).toContain(`id_programa=${programaId}`);
  await page.locator('#organizaciones-lista article a').first().click();
  await page.locator('[data-tab="intervenciones"]').click();
  await expect(page.locator('#tab-intervenciones a[href^="/planes"]')).toHaveAttribute('href', `/planes?id_organizacion=${id}&id_programa=${programaId}`);
  await page.goBack();
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(1);
  await page.locator('#filtro-pais').selectOption(paisDos.id_pais);
  await expect(page.locator('#organizaciones-lista')).toContainText('No se encontraron organizaciones');
  await page.locator('#filtro-programa').selectOption('');
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(1);
  await expect(page.locator('#organizaciones-lista article')).toContainText('Centro Comunitario Esperanza');
  await page.locator('#limpiar-organizaciones').click();
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(2);
  await captura(page,info,'listado-escritorio');
  await page.locator('#organizaciones-lista article a').first().click();
  await expect(page.locator('#org-total-beneficiarios')).toHaveText('312');
  await expect(page.locator('header a[href="/organizaciones"]').first()).toBeVisible();
  await captura(page,info,'detalle-escritorio');
  await page.setViewportSize({width:390,height:844});
  await captura(page,info,'detalle-movil');
  for (const tab of ['intervenciones','seguimiento','informacion']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await expect(page.locator(`#tab-${tab}`)).toBeVisible();
    await expect(page.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-selected','true');
  }
  await page.locator('[data-tab="seguimiento"]').click();
  await page.locator('[data-org-seccion="expediente-legal"]').click();
  await expect(page.locator('#legal-vacio')).toBeVisible();
  await page.locator('header a[href="/organizaciones"]').first().click();
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(2);
  await captura(page,info,'listado-movil');
});
test('formularios conservan validaciones, precarga y cancelación',async({page},info)=>{
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('/organizaciones/nueva');
  await page.locator('#guardar-organizacion').click();
  expect(await page.locator('#nombre').evaluate(el=>el.validity.valueMissing)).toBe(true);
  await captura(page,info,'crear-escritorio');
  await page.goto(`/organizaciones/${id}/editar`);
  await expect(page.locator('#nombre')).toHaveValue(org.nombre);
  await page.setViewportSize({width:390,height:844});
  await captura(page,info,'editar-movil');
  await page.locator('#cancelar-organizacion').click();
  await expect(page.locator('#titulo-organizacion')).toHaveText(org.nombre);
});
test('accesos internos, formulario de donaciones y estado vacío del listado',async({page},info)=>{
  const errores=[]; page.on('pageerror',e=>errores.push(e.message));
  await page.route('**/donations',r=>r.fulfill({json:{ok:true,data:{donations:[]}}}));
  await page.goto(`/organizaciones/${id}`);
  await page.locator('[data-tab="seguimiento"]').click();
  await captura(page,info,'seguimiento');
  await page.locator('#tab-seguimiento [data-org-seccion="donaciones"]').click();
  await expect(page.locator('#don-vacio')).toBeVisible();
  await page.locator('#don-nueva').click();
  await expect(page.locator('#don-form-donacion')).toBeVisible();
  await captura(page,info,'donaciones');
  await page.locator('#don-cancelar').click();
  await expect(page.locator('#don-listado')).toBeVisible();
  await page.goto('/organizaciones');
  await page.locator('#buscar-organizacion').fill('no existe');
  await expect(page.locator('#organizaciones-lista')).toContainText('No se encontraron organizaciones');
  expect(errores).toEqual([]);
});
const donacion = {id_donacion:'17600000-0000-4000-8000-0000000000d1',id_organizacion:id,id_pais:id,id_programa:null,fecha:'2026-10-21',tipo_movimiento:'recibida',contraparte_nombre:'Empresa de prueba',tipo_donante:'empresa',origen:'Campaña local',categoria:'Servicio',tipo_aporte:'recurso',descripcion:'Horas profesionales',cantidad:2,unidad:'horas',valor_estimado:100,moneda_valorizacion:'CLP',metodo_valorizacion:'Cotización',estado:'Comprometida',version:1};
test('donaciones: listado, validación del formulario y avance de estado',async({page},info)=>{
  const errores=[]; page.on('pageerror',e=>errores.push(e.message));
  const cuerpos=[]; let consultasDetalle=0;
  await page.route('**/api/v1/programs',r=>r.fulfill({json:{ok:true,data:{programs:[{id_programa:'17600000-0000-4000-8000-0000000000a1',nombre:'Programa Alimentación',archived_at:null,lineas_accion:[]}]}}}));
  await page.route('**/donations**',r=>{
    const req=r.request(), path=new URL(req.url()).pathname;
    if (req.method()==='PATCH') { cuerpos.push(req.postDataJSON()); return r.fulfill({json:{ok:true,data:{donation:{...donacion,estado:'Recibida',version:2}}}}); }
    if (req.method()==='POST') { cuerpos.push(req.postDataJSON()); return r.fulfill({json:{ok:true,data:{donation:{...donacion,id_donacion:'17600000-0000-4000-8000-0000000000d2',version:1}}}}); }
    if (path.endsWith('/files')) return r.fulfill({json:{ok:true,data:{files:[]}}});
    if (/\/donations\/[0-9a-f-]{36}$/.test(path)) { consultasDetalle++; return r.fulfill({json:{ok:true,data:{donation:{...donacion,estado:'Entregada',version:3}}}}); }
    return r.fulfill({json:{ok:true,data:{donations:[donacion]}}});
  });
  await page.setViewportSize({width:1440,height:1050});
  await page.goto(`/organizaciones/${id}`);
  await page.locator('[data-tab="seguimiento"]').click();
  await page.locator('#tab-seguimiento [data-org-seccion="donaciones"]').click();
  const tarjeta=page.locator('#don-lista article');
  await expect(tarjeta).toHaveCount(1);
  await expect(tarjeta).toContainText('Comprometida');
  await expect(tarjeta).toContainText('Comedor Solidario Las Palmas');
  await expect(tarjeta).toContainText('Servicio');
  await captura(page,info,'donaciones-listado');

  await page.locator('#don-nueva').click();
  await expect(page.locator('#don-pais')).toHaveValue('Chile');
  await expect(page.locator('#don-organizacion')).toHaveValue('Comedor Solidario Las Palmas');
  await expect(page.locator('#don-programa option')).toHaveCount(2);
  await page.locator('#don-categoria').selectOption('Otro');
  await expect(page.locator('#don-grupo-otro')).toBeVisible();
  await page.locator('#don-guardar').click();
  for (const campo of ['fecha','contraparte_nombre','tipo_donante','origen','descripcion','categoria_otro']) {
    await expect(page.locator(`[data-error-campo][data-campo="${campo}"]`)).toBeVisible();
  }
  expect(cuerpos).toHaveLength(0);
  await page.locator('#don-fecha').fill('2026-10-21');
  await expect(page.locator('[data-error-campo][data-campo="fecha"]')).toHaveCount(0);
  await page.locator('#don-categoria-otro').fill('Transporte');
  await page.locator('#don-categoria').selectOption('Servicio');
  await expect(page.locator('#don-grupo-otro')).toBeHidden();
  await expect(page.locator('#don-categoria-otro')).toHaveValue('');
  await page.locator('#don-contraparte').fill('Empresa de prueba');
  await page.locator('#don-tipo-donante').selectOption('empresa');
  await page.locator('#don-origen').fill('Campaña local');
  await page.locator('#don-descripcion').fill('Horas profesionales');
  await page.locator('#don-valor-estimado').fill('100');
  await page.locator('#don-guardar').click();
  await expect(page.locator('[data-error-campo][data-campo="moneda_valorizacion"]')).toBeVisible();
  expect(cuerpos).toHaveLength(0);
  await captura(page,info,'donaciones-formulario');
  await page.locator('#don-moneda-valorizacion').fill('clp');
  await page.locator('#don-metodo-valorizacion').fill('Cotización');
  await page.locator('#don-guardar').click();
  await expect(page.locator('#don-detalle')).toBeVisible();
  await expect(page.locator('#don-exito')).toHaveText('Donación registrada correctamente.');
  expect(cuerpos[0]).toMatchObject({categoria:'Servicio',tipo_aporte:'recurso',estado:'Comprometida',id_pais:id,moneda_valorizacion:'CLP'});
  expect(cuerpos[0].monto).toBeUndefined();

  await expect(page.locator('#don-avanzar-estado')).toHaveText('Avanzar a Recibida');
  await page.locator('#don-avanzar-estado').click();
  await expect(page.locator('#don-detalle-estado')).toHaveText('Recibida');
  expect(cuerpos[1]).toEqual({version_esperada:1,cambios:{estado:'Recibida'}});
  await page.locator('#don-recargar').click();
  await expect(page.locator('#don-detalle-estado')).toHaveText('Entregada');
  await expect(page.locator('#don-avanzar-estado')).toHaveText('Avanzar a Cerrada');
  expect(consultasDetalle).toBe(1);
  await page.setViewportSize({width:390,height:844});
  await captura(page,info,'donaciones-detalle-movil');
  expect(errores).toEqual([]);
});

test('muestra el error de autorización sin presentar el resultado anterior',async({page})=>{
  denegarListado = true;
  await page.goto('/organizaciones');
  await expect(page.locator('#organizaciones-error')).toBeVisible();
  await expect(page.locator('#organizaciones-error')).toContainText('La sesión no tiene permiso');
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(0);
  await expect(page.locator('#total-organizaciones')).toHaveText('—');
});

test('ignora respuestas anteriores cuando cambian rápidamente los filtros',async({page})=>{
  retrasarBusquedaPalmas = true;
  await page.goto('/organizaciones');
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(2);
  await page.locator('#buscar-organizacion').fill('palmas');
  await page.waitForTimeout(350);
  await page.locator('#buscar-organizacion').fill('esperanza');
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(1);
  await expect(page.locator('#organizaciones-lista article')).toContainText('Centro Comunitario Esperanza');
  await page.waitForTimeout(500);
  await expect(page.locator('#organizaciones-lista article')).toHaveCount(1);
  await expect(page.locator('#organizaciones-lista article')).toContainText('Centro Comunitario Esperanza');
});
