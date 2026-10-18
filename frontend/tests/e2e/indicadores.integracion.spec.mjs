import { test, expect } from '@playwright/test';
const real=process.env.INDICADORES_SUPABASE_REAL==='1';

test('interfaz → HTTP → Gateway → Backend → persistencia: asociación, meta y resultados',async({page,context,request})=>{
  const {gatewayUrl,supabaseUrl,anonKey,token,user,actionId,planId,catalogId}=JSON.parse(process.env.QA_INDICADORES_CONFIG);
  const auth={authorization:`Bearer ${token}`},dbAuth={...auth,apikey:anonKey};
  let item;
  await context.addInitScript(({url,token,user})=>{
    localStorage.setItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`,JSON.stringify({
      access_token:token,refresh_token:'qa-no-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user,
    }));
  },{url:supabaseUrl,token,user});
  const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/(indicators|results)(\/|$)/.test(new URL(r.url()).pathname))calls.push({url:r.url(),method:r.method()});});
  async function stored(table,id,value) {
    const r=await request.get(`${supabaseUrl}/rest/v1/${table}?${id}=eq.${value}`,{headers:dbAuth});
    expect(r.ok()).toBe(true);return (await r.json())[0];
  }
  try {
    await page.goto(`/planes/${planId}/acciones/${actionId}`);
    await expect(page.locator('#ind-asociar')).toBeEnabled();
    await page.locator(`[data-catalogo="${catalogId}"]`).check();
    await page.locator(`[data-meta="${catalogId}"]`).fill('20');
    const created=page.waitForResponse(r=>r.url()===`${gatewayUrl}/api/v1/actions/${actionId}/indicators`&&r.request().method()==='POST');
    await page.locator('#ind-asociar').click();
    const response=await created;expect(response.ok()).toBe(true);item=(await response.json()).data.indicadores[0];
    await expect(page.locator('#ind-exito')).toHaveText('Indicadores asociados correctamente.');
    expect(item.id_accion).toBe(actionId);expect(item.id_catalogo).toBe(catalogId);
    const persisted=await stored('indicadores','id_indicador',item.id_indicador);
    expect(persisted.id_accion).toBe(actionId);expect(persisted.id_catalogo).toBe(catalogId);expect(persisted.created_by).toBe(user.id);
    const card=page.locator(`[data-indicador="${item.id_indicador}"]`);
    await card.getByRole('button',{name:'Registrar resultado',exact:true}).click();
    await page.locator('#ind-valor').fill('0');await page.locator('#ind-fecha').fill('2026-10-17');
    await page.locator('#ind-observaciones').fill('QA SCRUM-118: resultado cero');await page.locator('#ind-guardar').click();
    await expect(page.locator('#ind-exito')).toHaveText('Resultado guardado correctamente.');
    await expect(card.locator('dd').nth(1)).toHaveText('0');
    await card.getByRole('button',{name:'Editar meta',exact:true}).click();
    await page.locator('#ind-valor').fill('30');await page.locator('#ind-guardar').click();
    await expect(page.locator('#ind-exito')).toHaveText('Meta actualizada correctamente.');
    await expect(card.locator('dd').first()).toHaveText('30');await expect(card.locator('dd').nth(1)).toHaveText('0');
    await card.getByRole('button',{name:'Actualizar resultado',exact:true}).click();
    await page.locator('#ind-valor').fill('25');await page.locator('#ind-observaciones').fill('QA SCRUM-118: resultado actualizado');
    await page.locator('#ind-guardar').click();await expect(page.locator('#ind-exito')).toHaveText('Resultado guardado correctamente.');
    await page.reload();await expect(card.locator('dd').first()).toHaveText('30');await expect(card.locator('dd').nth(1)).toHaveText('25');
    const list=await request.get(`${gatewayUrl}/api/v1/actions/${actionId}/indicators`,{headers:auth});
    expect(list.ok()).toBe(true);item=(await list.json()).data.indicadores.find(i=>i.id_indicador===item.id_indicador);
    const result=await stored('resultados','id_resultado',item.resultado.id_resultado);
    expect(Number(result.valor_medido)).toBe(25);expect(result.id_indicador).toBe(item.id_indicador);expect(Number(result.version)).toBe(2);
    expect(Number((await stored('indicadores','id_indicador',item.id_indicador)).meta)).toBe(30);
    expect((await request.get(`${gatewayUrl}/api/v1/indicators/catalog`)).status()).toBe(401);
    expect(calls.every(c=>c.url.startsWith(gatewayUrl))).toBe(true);
    expect(calls.filter(c=>c.method==='POST')).toHaveLength(2);expect(calls.filter(c=>c.method==='PATCH')).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally {
    if(real&&item) {
      const current=await stored('indicadores','id_indicador',item.id_indicador);
      const cleanup=await request.post(`${supabaseUrl}/rest/v1/rpc/archivar_indicador_seguro`,{
        headers:dbAuth,data:{p_id:item.id_indicador,p_version:current.version},
      });
      expect(cleanup.ok()).toBe(true);
      console.log('Asociación QA y resultado archivados:',item.id_indicador);
    }
  }
});
