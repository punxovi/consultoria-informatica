import { test, expect } from '@playwright/test';
import { stringify } from 'devalue';
const id = '17600000-0000-4000-8000-000000000001';
const plan = { periodo_anual:2026,id_plan:id,nombre:'Plan prueba',version:3,organizacion:{nombre:'Organización'},programa:{nombre:'Programa'},fecha_inicio:'2026-01-01',fecha_termino:'2026-12-31',responsable_nombre:'Responsable',objetivo_general:'Objetivo',objetivos_especificos:'Objetivos',situacion_necesidad:'Necesidad',resultado_esperado:'Resultado' };
const accion = { id_accion:id,id_plan:id,nombre:'Acción prueba',version:2,plan:{nombre:'Plan prueba'},estado:'no_iniciada',responsable_nombre:'Responsable',fecha_inicio:'2026-01-01',fecha_termino:'2026-12-31' };
let borrado, peticiones, fallo;
test.beforeEach(async ({ context }) => {
  borrado = false; peticiones = []; fallo = false;
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'qa-admin',refresh_token:'qa-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'17600000-0000-4000-8000-000000000001',email:'qa@example.test',user_metadata:{}}})));
  await context.route('**/rest/v1/rpc/get_user_roles', route => route.fulfill({json:[{codigo:'ADMIN',alcance:'global',id_pais:null}]}));
  await context.route('**/_actions/**', async route => {
    const nombre = new URL(route.request().url()).pathname.split('/').filter(Boolean).pop();
    if (nombre.startsWith('archivar')) {
      peticiones.push({ nombre, entrada:route.request().postDataJSON() });
      await new Promise(resolve => setTimeout(resolve, 250));
      if (fallo) return route.fulfill({contentType:'application/json+devalue',body:stringify({ok:false,codigo:'SIN_PERMISO',mensaje:'Tu usuario no tiene permiso para eliminar este registro.',datos:null})});
      borrado = true;
    }
    const datos = nombre === 'obtenerPlanPorId' ? plan : nombre === 'listarPlanes' ? (borrado ? [] : [plan]) : nombre === 'listarAcciones' ? (borrado ? [] : [accion]) : nombre === 'obtenerAccionPorId' ? accion : {id};
    return route.fulfill({contentType:'application/json+devalue',body:stringify({ok:true,datos})});
  });
});

test('eliminar plan requiere confirmar, envía versión y vuelve al listado', async ({ page }) => {
  await page.goto(`/planes/${id}`);
  await page.getByRole('button',{name:'Eliminar plan',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('todas sus acciones');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  expect(peticiones).toHaveLength(0);
  await page.getByRole('button',{name:'Eliminar plan',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar eliminación'}).click();
  await expect(page.getByRole('button',{name:'Confirmar eliminación'})).toBeDisabled();
  await expect(page.locator('#plan-confirmacion')).toHaveText('Plan eliminado correctamente.');
  await expect(page.locator('#planes-listado article')).toHaveCount(0);
  expect(peticiones).toEqual([{nombre:'archivarPlan',entrada:{id,version_esperada:3}}]);
});

test('eliminar acción muestra rechazo sin perder detalle y permite reintentar', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/planes/${id}/acciones/${id}`);
  await page.getByRole('button',{name:'Eliminar acción',exact:true}).click();
  expect(await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  fallo = true;
  await page.getByRole('button',{name:'Confirmar eliminación'}).click();
  await expect(page.locator('#eliminar-error')).toContainText('no tiene permiso');
  expect(borrado).toBe(false);
  fallo = false;
  await page.getByRole('button',{name:'Confirmar eliminación'}).click();
  await expect(page.locator('#accion-confirmacion')).toHaveText('Acción eliminada correctamente.');
  await expect(page.locator('#acciones-listado article')).toHaveCount(0);
  expect(peticiones.at(-1)).toEqual({nombre:'archivarAccion',entrada:{id,version_esperada:2}});
});
