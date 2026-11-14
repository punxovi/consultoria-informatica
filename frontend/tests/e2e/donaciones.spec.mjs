import { test, expect } from '@playwright/test';
const id = '17600000-0000-4000-8000-000000000001';
const donationId = '17600000-0000-4000-8000-000000000002';
const pais = { id_pais: id, nombre: 'Chile', codigo_iso: 'CL' };
const org = { id_organizacion:id, id_pais:id, nombre:'Comedor Las Palmas', nombre_representante:'Ana', telefono:'912345678', publico_objetivo:'Familias', descripcion_breve:'Comedor comunitario', tipo_organizacion:'comedor_merendero', numero_beneficiarios:50, pais, version:1, archived_at:null };
const donation = { id_donacion:donationId, id_organizacion:id, fecha:'2026-11-05', tipo_movimiento:'recibida', contraparte_nombre:'Empresa Solidaria', tipo_donante:'empresa', origen:'Campaña de alimentos', descripcion:'Aporte de alimentos', tipo_aporte:'recurso', cantidad:20, unidad:'cajas', estado:'Recibida', version:3 };
test.beforeEach(async ({ context }) => {
  await context.addCookies([{name:'fge_access_token',value:'qa',url:'http://127.0.0.1:4331'}]);
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa',refresh_token:'qa',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.org',user_metadata:{}}})));
  await context.route('**/rest/v1/rpc/get_user_roles', r => r.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/auth/v1/user', r => r.fulfill({json:{id,email:'qa@example.org'}}));
  await context.route('**/api/v1/**', r => {
    const path=new URL(r.request().url()).pathname;
    const data=path.endsWith('/session')?{authenticated:true,user:{id}}:path.endsWith('/countries')?{countries:[pais]}:path.endsWith('/programs')?{programs:[]}:path.endsWith('/files')?{files:[]}:path.endsWith('/donations')?{donations:[donation,{...donation,id_donacion:id,tipo_movimiento:'entregada',contraparte_nombre:'Centro Comunitario',estado:'Entregada'}]}:path.endsWith('/legal-record')?{expediente:null}:{organization:org};
    return r.fulfill({json:{ok:true,data}});
  });
});
async function abrir(page) {
  await page.goto(`/organizaciones/${id}`);
  await page.locator('[data-tab="seguimiento"]').click();
  await page.locator('[data-org-seccion="donaciones"]').click();
  await expect(page.locator('#don-lista article')).toHaveCount(2);
}
test('listado y detalle distinguen ambas partes sin alterar el estado ni la referencia', async ({page}) => {
  await abrir(page);
  await expect(page.locator('#don-lista article').first()).toContainText('Recibida por la organización');
  await expect(page.locator('#don-lista article').last()).toContainText('Entregada por la organización');
  await page.locator('[data-ver-detalle]').last().click();
  await expect(page.locator('#don-detalle-emisor')).toHaveText('Comedor Las Palmas');
  await expect(page.locator('#don-detalle-receptor')).toHaveText('Centro Comunitario');
  await expect(page.locator('#don-detalle-estado')).toHaveText('Entregada');
  await expect(page.locator('#don-detalle-referencia')).toContainText(`${id} · Versión 3`);
  await page.locator('#don-detalle-volver').click();
  await page.locator('[data-ver-detalle]').first().click();
  await expect(page.locator('#don-detalle-emisor')).toHaveText('Empresa Solidaria');
  await expect(page.locator('#don-detalle-receptor')).toHaveText('Comedor Las Palmas');
  await page.locator('#don-adjuntar-certificado').click();
  await expect(page.locator('#don-respaldo-tipo')).toHaveValue('certificado');
  await expect(page.locator('#don-respaldo-archivo')).toBeFocused();
});
test('formulario explica el sentido y conserva legibilidad en móvil', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await abrir(page);
  await page.locator('#don-nueva').click();
  await page.locator('#don-contraparte').fill('Centro Comunitario');
  await expect(page.locator('#don-sentido')).toContainText('Recibe: Comedor Las Palmas');
  await page.locator('#don-tipo-movimiento').selectOption('entregada');
  await expect(page.locator('#don-sentido')).toContainText('Entrega: Comedor Las Palmas. Recibe: Centro Comunitario.');
  expect(await page.locator('#seccion-donaciones').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('donaciones-movil.png'),fullPage:true});
});

test('certificado: reserva, carga, consulta posterior y descarga autenticada', async ({page}, info) => {
  let archivo;
  const solicitudes=[];
  await page.route('**/donations/*/files**', async r => {
    const req=r.request(); solicitudes.push(req);
    if(req.method()==='POST') {
      expect(req.postDataJSON().tipo_respaldo).toBe('certificado');
      archivo={...req.postDataJSON(), id_archivo:id, id_donacion:donationId, bucket_id:'fge-archivos', ruta_objeto:`donaciones/${donationId}/${id}.pdf`, categoria:'certificado', estado_carga:'reservado', version:1};
    } else if(req.method()==='PUT') archivo={...archivo,estado_carga:'disponible',version:2};
    else if(new URL(req.url()).pathname.endsWith('/file')) return r.fulfill({contentType:'application/pdf',body:'%PDF-1.4 prueba'});
    return r.fulfill({json:{ok:true,data:req.method()==='GET'?{files:archivo?[archivo]:[]}:{file:archivo}}});
  });
  await abrir(page);
  await page.locator('[data-ver-detalle]').first().click();
  await page.locator('#don-adjuntar-certificado').click();
  await page.locator('#don-respaldo-guardar').click();
  await expect(page.locator('#don-respaldo-archivo')).toHaveAttribute('aria-invalid','true');
  await page.locator('#don-respaldo-archivo').setInputFiles({name:'certificado.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 prueba')});
  await page.locator('#don-respaldo-guardar').click();
  await expect(page.locator('#don-exito')).toContainText('incorporado exitosamente');
  await page.locator('#don-detalle-volver').click();
  await page.locator('[data-ver-detalle]').first().click();
  await page.locator('.chip-filtro-respaldo[data-tipo="certificado"]').click();
  await expect(page.locator('#don-respaldos-lista')).toContainText('certificado.pdf');
  const descarga=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Descargar'}).click();
  expect((await descarga).suggestedFilename()).toBe('certificado.pdf');
  expect(solicitudes.every(r=>r.headers().authorization==='Bearer qa')).toBe(true);
  await page.screenshot({path:info.outputPath('donaciones-detalle.png'),fullPage:true});
});
