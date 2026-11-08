import { test, expect } from '@playwright/test';
const id='11111111-1111-4111-8111-111111111111', otro='22222222-2222-4222-8222-222222222222';
const pais=(id_pais,nombre,codigo_iso)=>({id_pais,nombre,codigo_iso,codigo_area_telefonica:'+56',zona_horaria:'America/Santiago',version:1,created_at:'2026-01-01',updated_at:'2026-01-01',configuracion_pendiente:false});
const paises=[pais(id,'Chile','CL'),pais(otro,'Argentina','AR')];
const org=(id_pais,nombre)=>({id_organizacion:id_pais,id_pais,nombre,nombre_representante:'Ana',telefono:'123456789',publico_objetivo:'Familias',descripcion_breve:'Comunidad',tipo_organizacion:'comedor_merendero',numero_beneficiarios:10,pais:paises.find(p=>p.id_pais===id_pais),version:1,archived_at:null});
const organizaciones=[org(id,'Comedor Chile'),org(otro,'Comedor Argentina')];
const plan=(o)=>({id_plan:o.id_organizacion,id_organizacion:o.id_organizacion,id_programa:id,nombre:`Plan ${o.nombre}`,organizacion:{id:o.id_organizacion,nombre:o.nombre,id_pais:o.id_pais},programa:{id,nombre:'Programa'},periodo_anual:2026,fecha_inicio:'2026-01-01',fecha_termino:'2026-12-31',version:1});
let rol, solicitudes, decision, cargaInvitados;
test.beforeEach(async({context})=>{
  rol='ADMIN';decision=null;cargaInvitados=null;
  solicitudes=[{id_invitado:id,nombre:'Persona Solicitante',correo:'persona@example.org',institucion:'Universidad',motivo:'Investigación',estado:'pendiente',version:2,created_at:'2026-11-01'}];
  await context.addCookies([{name:'fge_access_token',value:'qa',url:'http://127.0.0.1:4331'}]);
  await context.addInitScript(()=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa',refresh_token:'qa',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'qa@example.org',user_metadata:{}}})));
  await context.route('**/rest/v1/rpc/get_user_roles',r=>r.fulfill({json:[{codigo:rol,alcance:rol==='ADMIN'?'global':'pais',id_pais:rol==='ADMIN'?null:id}]}));
  await context.route('**/auth/v1/user',r=>r.fulfill({json:{id,email:'qa@example.org'}}));
  await context.route('**/api/v1/**',async r=>{
    const req=r.request(),url=new URL(req.url()),path=url.pathname;
    if(path.includes('/guests')){
      if(req.method()==='POST') {
        expect(req.postDataJSON()).toEqual({version_esperada:2});
        if(decision)await decision;
        solicitudes=[{...solicitudes[0],estado:path.endsWith('/approve')?'aprobado':'rechazado',version:3}];
        return r.fulfill({json:{ok:true,data:{guest:solicitudes[0]}}});
      }
      if(cargaInvitados)await cargaInvitados;
      return r.fulfill({json:{ok:true,data:{guests:solicitudes}}});
    }
    const data=path.endsWith('/session')?{authenticated:true,user:{id}}:
      path.endsWith('/countries')?{countries:paises}:
      path.endsWith('/temporary-coverages/mine')?{coverages:[{id_permiso_temporal:otro,id_pais:otro,inicio_at:'2026-01-01',fin_at:'2099-12-31'}]}:
      path.endsWith('/coordinators')?{coordinators:[{id_usuario:id,nombre:'Ana',correo:'ana@example.org',id_pais:id,activo:true,version:1}]}:
      path.endsWith('/organizations')?{organizations:organizaciones.filter(o=>!url.searchParams.get('id_pais')||o.id_pais===url.searchParams.get('id_pais'))}:
      path.endsWith('/plans')?{plans:organizaciones.map(plan)}:path.endsWith('/programs')?{programs:[]}:{organization:organizaciones[0]};
    return r.fulfill({json:{ok:true,data}});
  });
});
test('coberturas mantiene errores junto a fechas invertidas y obligatorias sin enviar',async({page})=>{
  let envios=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/temporary-coverages'))envios++;});
  await page.goto('/administracion/coberturas/nueva');
  await page.locator('#cobertura-coordinador').selectOption(id); await page.locator('#cobertura-pais').selectOption(otro);
  await page.locator('#cobertura-motivo').fill('Apoyo temporal');
  await page.locator('#cobertura-inicio').fill('2026-11-10'); await page.locator('#cobertura-termino').fill('2026-11-09');
  await page.locator('#cobertura-form').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect(page.locator('[data-field-error="cobertura-inicio"]')).toContainText('anterior');
  await expect(page.locator('[data-field-error="cobertura-termino"]')).toContainText('posterior');
  await page.locator('#cobertura-termino').fill('');
  await expect(page.locator('[data-field-error="cobertura-termino"]')).toContainText('obligatorio');
  expect(envios).toBe(0);
});
test('invitados confirma la decisión, espera al servicio y filtra resultados',async({page})=>{
  await page.goto('/administracion/solicitudes-invitado');
  await expect(page.locator('#invitados-lista')).toContainText('Investigación');
  await page.getByRole('button',{name:'Aprobar',exact:true}).click();await page.locator('#invitados-cancelar').click();
  await expect(page.locator('#invitados-lista')).toContainText('Pendiente');
  let liberar;decision=new Promise(r=>liberar=r);
  await page.getByRole('button',{name:'Aprobar',exact:true}).click();await page.locator('#invitados-confirmar').click();
  await expect(page.locator('#invitados-confirmar')).toBeDisabled();await expect(page.locator('#invitados-exito')).toBeHidden();
  liberar();await expect(page.locator('#invitados-exito')).toContainText('aprobada correctamente');
  await expect(page.getByRole('button',{name:'Aprobar',exact:true})).toHaveCount(0);
  await page.locator('#buscar-solicitud').fill('no existe');await expect(page.locator('#invitados-vacio')).toContainText('filtros');
  await page.locator('#invitados-limpiar').click();await expect(page.locator('#invitados-lista article')).toHaveCount(1);
});
test('invitados permite rechazar; muestra carga, vacío y error recuperable',async({page})=>{
  let liberar;cargaInvitados=new Promise(r=>liberar=r);
  await page.goto('/administracion/solicitudes-invitado');await expect(page.locator('#invitados-carga')).toBeVisible();liberar();
  await page.getByRole('button',{name:'Rechazar',exact:true}).click();await page.locator('#invitados-confirmar').click();
  await expect(page.locator('#invitados-exito')).toContainText('rechazada');
  await page.route('**/api/v1/guests',r=>r.fulfill({status:503,json:{ok:false,error:{code:'ERROR',message:'Servicio no disponible'}}}));
  await page.reload();await expect(page.locator('#invitados-error')).toContainText('no disponible');
  await page.unroute('**/api/v1/guests');solicitudes=[];await page.locator('#invitados-reintentar').click();await expect(page.locator('#invitados-vacio')).toContainText('Todavía no hay');
});
test('no administrador no consulta invitados',async({page})=>{
  rol='COORD';let consultas=0;page.on('request',r=>{if(r.url().includes('/api/v1/guests'))consultas++;});
  await page.goto('/administracion/solicitudes-invitado');await expect(page.locator('#unauthorized-message')).toBeVisible();expect(consultas).toBe(0);
});
test('territorio actualiza Organizaciones y Planes sin mezclar países',async({page})=>{
  rol='COORD';await page.goto('/organizaciones');
  await expect(page.locator('#organizaciones-lista')).toContainText('Comedor Chile');
  await expect(page.locator('#organizaciones-lista')).not.toContainText('Comedor Argentina');
  await page.locator('#selector-territorio button[data-pais="'+otro+'"]').click();
  await expect(page.locator('#organizaciones-lista')).toContainText('Comedor Argentina');
  await expect(page.locator('#organizaciones-lista')).not.toContainText('Comedor Chile');
  await page.goto('/planes');await expect(page.locator('#planes-listado')).toContainText('Plan Comedor Argentina');
  await page.locator('#selector-territorio button[data-pais="'+id+'"]').click();
  await expect(page.locator('#planes-listado')).toContainText('Plan Comedor Chile');
  await expect(page.locator('#planes-listado')).not.toContainText('Plan Comedor Argentina');
});
test('bandera fallida conserva país y alternativa; invitados es legible en móvil',async({page},info)=>{
  rol='COORD';await page.route('**/flagcdn.com/**',r=>r.abort());await page.route('**/cdn.jsdelivr.net/**',r=>r.abort());
  await page.goto('/organizaciones');await page.locator('[data-profile-toggle]').click();
  await expect(page.locator('[data-session-country-name]')).toHaveText('Chile');
  await expect(page.locator('[data-session-country-flag]')).toBeHidden();await expect(page.locator('[data-session-initial]')).toBeVisible();
  rol='ADMIN';await page.setViewportSize({width:390,height:844});await page.goto('/administracion/solicitudes-invitado');
  await expect(page.locator('#invitados-lista article')).toHaveCount(1);
  expect(await page.locator('#solicitudes-invitado').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('invitados-movil.png'),fullPage:true});
});
