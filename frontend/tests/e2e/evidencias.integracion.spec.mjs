import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const real=process.env.EVIDENCIAS_SUPABASE_REAL==='1';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=','base64');

test('interfaz → cliente HTTP → Gateway → Backend: carga, persistencia, descarga privada, publicación y retiro',async({page,context,request})=>{
  const config=JSON.parse(process.env.QA_EVIDENCIAS_CONFIG);
  const {gatewayUrl,supabaseUrl,anonKey,token,user,actionId,planId}=config;
  const auth={authorization:`Bearer ${token}`};
  const nombre=`qa-scrum-115-${Date.now()}.png`;
  let evidence;
  await context.addInitScript(({url,token,user})=>{
    const key=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'qa-no-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user}));
  },{url:supabaseUrl,token,user});
  const calls=[];
  page.on('request',r=>{if(r.url().includes('/evidences'))calls.push({url:r.url(),method:r.method()});});
  try {
    await page.goto(`/planes/${planId}/acciones/${actionId}`);
    await expect(page.locator('#ev-archivo')).toBeEnabled();
    await page.locator('#ev-archivo').setInputFiles({name:nombre,mimeType:'image/png',buffer:png});
    await page.locator('#ev-origen').fill('Prueba SCRUM-115');
    await page.locator('#ev-descripcion').fill('PNG sintético sin datos personales. Verificación de integración.');
    await page.locator('#ev-personas').selectOption('sin_personas');
    await page.locator('#ev-guardar').click();
    await expect(page.locator('#ev-exito')).toContainText('Archivo guardado correctamente');
    const list=await request.get(`${gatewayUrl}/api/v1/evidences?id_accion=${actionId}`,{headers:auth});
    expect(list.ok()).toBe(true);
    evidence=(await list.json()).data.evidences.find(e=>e.nombre_original===nombre);
    expect(evidence.id_accion).toBe(actionId);expect(evidence.estado_carga).toBe('disponible');
    expect(evidence.incorporado_por).toBe(user.id);
    const publicUrl=`${gatewayUrl}/api/v1/public/evidences/${evidence.id_evidencia}/file`;
    expect((await request.get(publicUrl)).status()).toBe(404);
    expect((await request.get(`${gatewayUrl}/api/v1/evidences/${evidence.id_evidencia}/file`)).status()).toBe(401);
    expect((await request.get(`${supabaseUrl}/storage/v1/object/public/fge-evidencias/${actionId}/${evidence.id_evidencia}`)).ok()).toBe(false);
    const stored=await request.get(`${supabaseUrl}/rest/v1/evidencias?id_evidencia=eq.${evidence.id_evidencia}&select=id_evidencia,id_accion,estado_carga`,{headers:{...auth,apikey:anonKey}});
    expect(stored.ok()).toBe(true);expect((await stored.json())[0].id_accion).toBe(actionId);
    await page.reload();await expect(page.locator('#ev-lista')).toContainText(nombre);
    await expect(page.locator('#ev-detalle')).toBeHidden();
    await page.locator('#ev-lista article').filter({hasText:nombre}).getByRole('button').click();
    await expect(page.locator('#ev-detalle')).toBeVisible();
    await expect(page.locator('#ev-descargar')).toBeInViewport();
    const downloadEvent=page.waitForEvent('download');await page.locator('#ev-descargar').click();
    const download=await downloadEvent;expect(download.suggestedFilename()).toBe(nombre);
    expect(await readFile(await download.path())).toEqual(png);
    page.once('dialog',d=>d.accept());await page.locator('#ev-publicar').click();
    await expect(page.locator('#ev-enlace-publico')).toHaveAttribute('href',publicUrl);
    const published=await request.get(publicUrl);expect(published.status()).toBe(200);expect(await published.body()).toEqual(png);
    expect(published.headers()['cache-control']).toBe('no-store');
    page.once('dialog',d=>d.accept('Fin de la prueba de integración.'));await page.locator('#ev-revocar').click();
    await expect(page.locator('#ev-exito')).toContainText('Consentimiento revocado');
    expect((await request.get(publicUrl)).status()).toBe(404);
    await expect(page.locator('#ev-enlace-publico')).toBeHidden();
    expect(calls.every(c=>c.url.startsWith(gatewayUrl))).toBe(true);
    expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  } finally {
    if(real) {
      if(!evidence) {
        const list=await request.get(`${gatewayUrl}/api/v1/evidences?id_accion=${actionId}`,{headers:auth});
        if(list.ok())evidence=(await list.json()).data.evidences.find(e=>e.nombre_original===nombre);
      }
      if(evidence) {
        const current=await request.get(`${gatewayUrl}/api/v1/evidences/${evidence.id_evidencia}`,{headers:auth});
        expect(current.ok()).toBe(true);evidence=(await current.json()).data.evidence;
        if(evidence.estado_publicacion==='publicada') {
          const withdrawn=await request.patch(`${gatewayUrl}/api/v1/evidences/${evidence.id_evidencia}`,{headers:auth,data:{version_esperada:evidence.version,cambios:{estado_publicacion:'retirada'}}});
          expect(withdrawn.ok()).toBe(true);evidence=(await withdrawn.json()).data.evidence;
        }
        const archived=await request.post(`${supabaseUrl}/rest/v1/rpc/archivar_evidencia_segura`,{headers:{...auth,apikey:anonKey},data:{p_id:evidence.id_evidencia,p_version:evidence.version}});
        expect(archived.ok()).toBe(true);
        console.log('Evidencia QA archivada:',evidence.id_evidencia);
      }
    }
  }
});
