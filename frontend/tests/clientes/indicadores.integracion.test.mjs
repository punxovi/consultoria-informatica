import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoIndicadores } from '../helpers/indicadores-entorno.mjs';
import { crearClienteIndicadores } from '../../src/lib/indicadores/cliente.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';

test('SCRUM-118: cliente HTTP → Gateway → Intervenciones → PostgreSQL con RLS', async t => {
  const env = await crearEntornoIndicadores();
  try {
    const cl = await env.fixture('CL'), ar = await env.fixture('AR');
    const action = cl.accion.id_accion;
    const client = crearClienteIndicadores(createApiTransport(env.gatewayUrl), async () => 'qa-coord');
    const admin = crearClienteIndicadores(createApiTransport(env.gatewayUrl), async () => 'qa-admin');
    const catalog = await client.catalogo();
    let item, result;
    const values = {valor_medido:0,fecha_medicion:'2026-10-17',observaciones:'Prueba de cero'};
    const http = async (path, body, token='qa-coord', method='POST') => {
      const response = await fetch(env.gatewayUrl+'/api/v1/'+path,{method,
        headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    };
    await t.test('consulta catálogo real, lista vacía y asociación atómica con metas cero', async () => {
      assert.equal(catalog.length,5);
      assert.deepEqual(await client.listar(action),[]);
      const created=await client.asociar(action,catalog.slice(0,2).map((c,i)=>({id_indicador:c.id_indicador,meta:i*10})));
      assert.equal(created.length,2);item=created[0];assert.equal(item.meta,0);
      assert.equal(item.nombre,catalog[0].nombre);
      const persisted=(await env.db.query('SELECT * FROM public.indicadores WHERE id_indicador=$1',[item.id_indicador])).rows[0];
      assert.equal(persisted.created_by,env.usuarios.COORD);assert.equal(persisted.id_accion,action);
      await assert.rejects(client.asociar(action,[{id_indicador:catalog[2].id_indicador,meta:20},{id_indicador:catalog[0].id_indicador,meta:1}]),e=>e.status===409);
      assert.equal((await client.listar(action)).length,2);
    });
    await t.test('guarda, actualiza y recarga; meta y resultado tienen versiones independientes', async () => {
      result=await client.guardarResultado(item,values);assert.equal(result.valor_medido,0);
      const updated=await client.actualizarMeta(item,25);
      assert.equal(updated.meta,25);assert.equal(updated.resultado.valor_medido,0);assert.equal(updated.version,2);
      await assert.rejects(client.actualizarMeta(item,99),e=>e.status===409);
      await assert.rejects(client.guardarResultado(item,values),e=>e.status===409);
      item=updated;result=await client.guardarResultado(item,{...values,valor_medido:17.5});
      assert.equal(result.version,2);assert.equal(result.valor_medido,17.5);
      const reloaded=(await client.listar(action)).find(i=>i.id_indicador===item.id_indicador);
      assert.equal(reloaded.meta,25);assert.equal(reloaded.resultado.valor_medido,17.5);
      await assert.rejects(client.guardarResultado(item,values),e=>e.status===409);
      item=reloaded;
    });
    await t.test('dos escrituras simultáneas no sobrescriben una versión nueva', async () => {
      const updates=await Promise.allSettled([client.actualizarMeta(item,30),client.actualizarMeta(item,40)]);
      assert.equal(updates.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(updates.find(r=>r.status==='rejected').reason.status,409);
      item=updates.find(r=>r.status==='fulfilled').value;
    });
    await t.test('rechaza payloads inválidos y relaciones ajenas; los errores llegan al cliente', async () => {
      for(const body of [{indicadores:[]},{indicadores:[{id_indicador:catalog[2].id_indicador,meta:-1}]},
        {indicadores:[{id_indicador:catalog[2].id_indicador,meta:2}],id_accion:ar.accion.id_accion}]) {
        assert.equal((await http(`actions/${action}/indicators`,body)).status,400);
      }
      assert.equal((await http('results',{id_indicador:item.id_indicador,...values,fecha_medicion:'2026-02-30'})).status,400);
      assert.equal((await http(`indicators/${item.id_indicador}`,{cambios:{meta:5}},'qa-coord','PATCH')).status,400);
      assert.equal((await http('results',{...values,id_indicador:catalog[0].id_indicador},'qa-admin')).status,404);
      assert.equal((await fetch(env.gatewayUrl+'/api/v1/indicators/catalog')).status,401);
      await assert.rejects(client.listar('ffffffff-ffff-4fff-8fff-ffffffffffff'),e=>e.status===404);
      // COORD tiene lectura global según las políticas existentes; la escritura es territorial.
      assert.deepEqual(await client.listar(ar.accion.id_accion),[]);
      await assert.rejects(client.asociar(ar.accion.id_accion,[{id_indicador:catalog[0].id_indicador,meta:20}]),e=>e.status===403);
      const [foreign]=await admin.asociar(ar.accion.id_accion,[{id_indicador:catalog[0].id_indicador,meta:20}]);
      await assert.rejects(client.actualizarMeta(foreign,30),e=>[403,404].includes(e.status));
      await assert.rejects(client.guardarResultado(foreign,values),e=>[403,404].includes(e.status));
      assert.equal((await client.listar(ar.accion.id_accion)).length,1);
    });
    await t.test('RLS directa: catálogo protegido, sin rol/anon y asociaciones inmutables', async () => {
      await assert.rejects(env.como('qa-coord',tx=>tx.query("INSERT INTO public.indicadores(nombre,unidad_medida) VALUES('No autorizado','unidad')")),{code:'42501'});
      assert.deepEqual((await env.como('qa-sin-rol',tx=>tx.query('SELECT * FROM public.indicadores'))).rows,[]);
      await assert.rejects(env.db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT public.consultar_catalogo_indicadores()');}),{code:'42501'});
      await assert.rejects(env.como('qa-admin',tx=>tx.query('UPDATE public.indicadores SET id_accion=$1 WHERE id_indicador=$2',[ar.accion.id_accion,item.id_indicador])),{code:'23514'});
      await assert.rejects(env.como('qa-admin',tx=>tx.query('UPDATE public.resultados SET id_indicador=$1 WHERE id_resultado=$2',[catalog[0].id_indicador,result.id_resultado])),{code:'23514'});
      assert.ok(env.solicitudes.some(r=>r.path.endsWith('/rpc/guardar_resultado_indicador')&&r.token==='qa-coord'));
    });
    await t.test('INVIT consulta su país y catálogo, sin modificar metas, asociaciones ni resultados', async () => {
      const guestId='17600000-0000-4000-8000-000000000003';
      const {rows:[role]}=await env.db.query(`INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
        SELECT $1,r.id_rol,'pais',p.id_pais,$2 FROM public.roles r CROSS JOIN public.paises p
        WHERE r.codigo='INVIT' AND p.codigo_iso='CL' RETURNING id_asignacion`,[guestId,env.usuarios.ADMIN]);
      try {
        const guest=crearClienteIndicadores(createApiTransport(env.gatewayUrl),async()=>'qa-sin-rol');
        assert.equal((await guest.catalogo()).length,5);
        assert.equal((await guest.listar(action)).length,2);
        await assert.rejects(guest.listar(ar.accion.id_accion),e=>e.status===404);
        await assert.rejects(guest.actualizarMeta(item,100),e=>e.status===403);
        await assert.rejects(guest.guardarResultado(item,values),e=>e.status===403);
        await assert.rejects(guest.asociar(action,[{id_indicador:catalog[2].id_indicador,meta:5}]),e=>e.status===403);
      } finally {
        await env.db.query('UPDATE public.asignaciones_roles SET revocado_at=now(),revocado_por=$2 WHERE id_asignacion=$1',[role.id_asignacion,env.usuarios.ADMIN]);
      }
    });
    await t.test('asociaciones históricas y catálogo archivado se muestran sin perder su definición', async () => {
      await env.como('qa-admin',tx=>tx.query("INSERT INTO public.indicadores(id_accion,nombre,unidad_medida) VALUES($1,'Indicador histórico','personas')",[action]));
      const row=(await env.db.query('SELECT version FROM public.indicadores WHERE id_indicador=$1',[item.id_catalogo])).rows[0];
      await env.como('qa-admin',tx=>tx.query('SELECT public.archivar_indicador_seguro($1,$2)',[item.id_catalogo,row.version]));
      assert.equal((await client.catalogo()).length,4);
      const items=await client.listar(action);
      assert.equal(items.find(i=>i.id_indicador===item.id_indicador).nombre,item.nombre);
      assert.equal(items.find(i=>i.id_catalogo===null).meta,null);
    });
  } finally {await env.cerrar();}
});
