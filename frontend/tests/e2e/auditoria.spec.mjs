import { test, expect } from '@playwright/test';
test.use({ timezoneId: 'America/Santiago' });
const evento = { id: '1', usuario: 'Ana Pérez', rol: 'ADMIN', fecha_hora: '2026-10-28T14:00:00Z', pais: 'Chile', ip: '127.0.0.1', operacion: 'UPDATE', entidad: 'organizaciones', referencia: 'id_organizacion: abc' };
let estado;
test.beforeEach(async ({ context }) => {
  estado = { rol: 'ADMIN', events: [evento], requests: [], error: false, delay: 0 };
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa', refresh_token: 'qa', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: '14700000-0000-4000-8000-000000000001', email: 'admin@fge.org', user_metadata: {} } })));
  await context.addCookies([{ name: 'fge_access_token', value: 'qa', url: 'http://127.0.0.1:4331' }]);
  await context.route('http://127.0.0.1:54329/**', r => r.fulfill({json: [{codigo: estado.rol, alcance: 'global', id_pais: null}]}));
  await context.route('**/rest/v1/rpc/get_user_roles', r => r.fulfill({json: [{codigo: estado.rol, alcance: 'global', id_pais: null}]}));
  await context.route('**/auth/v1/user', r => r.fulfill({json: {id: '14700000-0000-4000-8000-000000000001', email: 'admin@fge.org'}}));
  await context.route('**/api/v1/auth/session', r => r.fulfill({json: {ok:true,data:{authenticated:true,user:{id:'qa'}}}}));
  const pais = (id_pais, nombre, codigo_iso) => ({ id_pais, nombre, codigo_iso, codigo_area_telefonica: null, zona_horaria: null, version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', configuracion_pendiente: false });
  await context.route('**/api/v1/countries', r => r.fulfill({json:{ok:true,data:{countries:[pais('p-ar','Argentina','AR'),pais('p-cl','Chile','CL')]}}}));
  await context.route('**/api/v1/audit/events?**', async r => {
    estado.requests.push(r.request());
    if(estado.delay) await new Promise(resolve=>setTimeout(resolve,estado.delay));
    if(estado.error) return r.fulfill({status:404,json:{ok:false,error:{code:'RUTA_NO_ENCONTRADA',message:'No existe'},data:null}});
    const cursor = new URL(r.request().url()).searchParams.get('cursor');
    return r.fulfill({json:{ok:true,data:{events:estado.events,nextCursor:cursor ? null : 'pagina2'}}});
  });
});
async function abrir(page) { await page.goto('/administracion/auditoria'); await expect(page.locator('#audit-estado')).toContainText('en esta página'); }
test('tarjetas, datos recibidos, filtros combinados e individuales y limpieza', async ({page})=>{
  await page.setViewportSize({width:1440,height:1000}); await abrir(page);
  const resultados = page.locator('#audit-resultados');
  await expect(resultados.locator('article')).toHaveCount(1);
  for(const valor of ['Ana Pérez','Chile','Modificó la organización','Administrador']) await expect(resultados).toContainText(valor);
  // Lenguaje claro: no se muestran datos técnicos (IP, operación, tabla, registro ni código de rol).
  for(const tecnico of ['127.0.0.1','UPDATE','id_organizacion: abc','ADMIN','Ver detalles técnicos']) await expect(resultados).not.toContainText(tecnico);
  // Los filtros se aplican solos: «Persona» al dejar de escribir.
  await page.locator('#audit-usuario').fill('Ana');
  await expect(page.locator('#audit-criterios')).toContainText('Persona: Ana');
  await page.locator('#audit-pais').selectOption('Chile');
  for(const [campo,valor] of Object.entries({desde:'2026-10-01',hasta:'2026-10-28'})) await page.locator(`#audit-${campo}`).fill(valor);
  await page.locator('#audit-operacion').selectOption('modificar'); await page.locator('#audit-entidad').selectOption('organizaciones');
  await expect(page.locator('#audit-criterios')).toContainText('Sección: Organizaciones');
  await expect(page.locator('#audit-estado')).toContainText('en esta página');
  await expect.poll(()=>new URL(estado.requests.at(-1).url()).searchParams.get('entidad')).toBe('organizaciones');
  const params = new URL(estado.requests.at(-1).url()).searchParams;
  expect(params.get('usuario')).toBe('Ana'); expect(params.get('pais')).toBe('Chile'); expect(params.get('hasta')).toBe('2026-10-28'); expect(params.get('entidad')).toBe('organizaciones'); expect(params.get('operacion')).toBe('modificar');
  // Las fechas se envían con la zona del navegador (Chile en esta prueba).
  expect(params.get('zona_horaria')).toBe('America/Santiago');
  await expect(page.locator('#audit-criterios')).toContainText('Sección: Organizaciones');
  await expect(page.locator('#audit-criterios')).toContainText('Qué hizo: Modificó');
  await page.locator('#audit-limpiar').click();
  await expect(page.locator('#audit-criterios')).toContainText('Todos los eventos');
  await expect(page.locator('#audit-estado')).toContainText('en esta página');
  expect([...new URL(estado.requests.at(-1).url()).searchParams.keys()]).toEqual(['zona_horaria', 'limit']);
  expect(estado.requests.every(r=>r.method()==='GET')).toBe(true);
});
test('fechas inválidas bloquean consulta y muestran error junto al campo',async({page})=>{
  await abrir(page);
  await page.locator('#audit-desde').fill('2026-10-28'); await expect(page.locator('#audit-criterios')).toContainText('Desde');
  await expect(page.locator('#audit-estado')).toContainText('en esta página'); const n=estado.requests.length;
  await page.locator('#audit-hasta').fill('2026-10-01');
  await expect(page.locator('#audit-hasta')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#audit-error-hasta')).toBeVisible(); expect(estado.requests.length).toBe(n);
});
test('carga, servicio ausente, reintento y vacío sin datos inventados',async({page})=>{
  estado.error=true; estado.delay=400; await page.goto('/administracion/auditoria');
  await expect(page.locator('#audit-estado')).toHaveText('Consultando historial…');
  await expect(page.locator('#audit-error')).toContainText('todavía no está disponible');
  estado.error=false; estado.events=[]; await page.locator('#audit-reintentar').click();
  await expect(page.locator('#audit-estado')).toContainText('No hay eventos');
});
test('paginación conserva criterios',async({page})=>{
  await abrir(page); await page.locator('#audit-pais').selectOption('Chile'); await expect(page.locator('#audit-criterios')).toContainText('País: Chile'); await expect(page.locator('#audit-estado')).toContainText('en esta página');
  await expect(page.locator('#audit-siguiente')).toBeEnabled(); await page.locator('#audit-siguiente').click();
  await expect(page.locator('#audit-pagina')).toHaveText('Página 2');
  expect(new URL(estado.requests.at(-1).url()).searchParams.get('pais')).toBe('Chile');
  await page.locator('#audit-anterior').click(); await expect(page.locator('#audit-pagina')).toHaveText('Página 1');
});
test('móvil: tarjetas sin desborde, campos ausentes y contenido tratado como texto',async({page})=>{
  estado.events=[{...evento,usuario:'<img src=x onerror=alert(1)>',rol:null,ip:null,pais:null,referencia:'a'.repeat(300)}];
  await page.setViewportSize({width:390,height:844}); await abrir(page);
  await expect(page.locator('#audit-resultados article')).toBeVisible();
  await expect(page.locator('#audit-resultados article')).toContainText('No disponible');
  await expect(page.locator('#audit-resultados img')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const sizes=await page.locator('#auditoria input:visible, #auditoria button:visible').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height)); expect(sizes.every(h=>h>=48)).toBe(true);
  await page.screenshot({path:'test-results/auditoria-mobile.png',fullPage:true});
});
test('Coordinador no consulta API ni ve acceso de Auditoría',async({page})=>{
  estado.rol='COORD'; await page.goto('/administracion/auditoria');
  await expect(page.locator('#unauthorized-message')).toBeVisible();
  await expect(page.getByRole('link',{name:'Auditoría',exact:true})).not.toBeVisible(); expect(estado.requests).toHaveLength(0);
});

test('errores de validación del servicio aparecen junto al filtro',async({page})=>{
  await abrir(page);
  await page.route('**/api/v1/audit/events?**',r=>r.fulfill({status:422,json:{ok:false,error:{code:'VALIDACION',message:'Filtro inválido',fields:{entidad:['La entidad no se puede consultar.']}},data:null}}));
  await page.locator('#audit-entidad').selectOption('paises');
  await expect(page.locator('#audit-error-entidad')).toHaveText('La entidad no se puede consultar.');
  await expect(page.locator('#audit-entidad')).toHaveAttribute('aria-invalid','true');
});

test('capturas del historial en escritorio y móvil',async({page})=>{
  await page.setViewportSize({width:1440,height:1000}); await abrir(page);
  await page.locator('#audit-resultados').scrollIntoViewIfNeeded();
  await expect(page.locator('#main-content')).toHaveCSS('opacity','1');
  await page.screenshot({path:'test-results/auditoria-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await abrir(page);
  await expect(page.locator('#main-content')).toHaveCSS('opacity','1');
  await page.locator('#audit-resultados article').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/auditoria-mobile-resultados.png'});
});

test('describe en lenguaje claro altas, cambios, eliminaciones e inicios de sesión',async({page})=>{
  estado.events=[
    {...evento,id:'5',correo:'ana@fge.org',nombre_usuario:'Ana Pérez',nombre_registro:'Cooperativa del Sur',campos_modificados:['telefono','correo'],cambio_estado:null,accion_especial:null},
    {...evento,id:'4',operacion:'INSERT',entidad:'planes',correo:'ana@fge.org',nombre_registro:'Plan 2026',campos_modificados:null},
    {...evento,id:'3',entidad:'productos',correo:'ana@fge.org',nombre_registro:'Bolso',campos_modificados:[],cambio_estado:'archivado'},
    {...evento,id:'2',operacion:'INSERT',entidad:'autenticacion',correo:'ana@fge.org',accion_especial:'inicio_sesion_fallido',referencia:'exitoso: false'},
  ];
  await page.setViewportSize({width:1440,height:1000}); await abrir(page);
  const tabla=page.locator('#audit-resultados');
  await expect(tabla).toContainText('ana@fge.org');
  await expect(tabla).toContainText('Modificó la organización «Cooperativa del Sur». Cambió: teléfono y correo.');
  await expect(tabla).toContainText('Agregó el plan de intervención «Plan 2026».');
  await expect(tabla).toContainText('Eliminó el producto «Bolso». Queda archivado en el historial.');
  await expect(tabla).toContainText('Intento de inicio de sesión fallido');
  await expect(tabla).not.toContainText('127.0.0.1');
});
