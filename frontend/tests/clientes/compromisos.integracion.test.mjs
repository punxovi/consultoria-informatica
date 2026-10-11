import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoActas } from '../helpers/actas-entorno.mjs';
import { crearClienteActas } from '../../src/lib/actas-reunion/cliente.ts';
import { crearClienteCompromisos } from '../../src/lib/compromisos/cliente.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';
import { readFile } from 'node:fs/promises';

test('Compromisos: cliente → Gateway → Organizaciones → SQL, estados, relaciones, RLS, versiones y auditoría',async()=>{
  const env=await crearEntornoActas();
  try {
    await env.db.exec(await readFile(new URL('../../../supabase/preflight-compromisos-integracion.sql',import.meta.url),'utf8'));
    const http=createApiTransport(env.gatewayUrl), token=async()=> 'qa-admin';
    const cliente=crearClienteCompromisos(http,token), actas=crearClienteActas(http,token);
    const f=await env.fixture(), org=f.organizacion.id_organizacion;
    const camposActa={id_plan:f.planes[0].id_plan,id_accion:'',fecha_reunion:'2026-10-08',objetivo:'Reunión real',asistentes:['QA ADMIN'],asistentes_externos:'',observaciones:''};
    assert.deepEqual(await cliente.listar(org),[]); assert.deepEqual(await cliente.actas(org),[]);
    const a=await actas.crear(org,{campos:camposActa});
    const campos={id_acta:a.id_acta,descripcion:'Entregar documentos',responsable_nombre:'Ana',responsable_contacto:'ana@example.invalid',fecha_limite:'2026-12-01',estado:'pendiente',observaciones:''};
    assert.equal((await cliente.catalogo(org)).puede_gestionar,true);
    assert.equal((await cliente.actas(org))[0].id_acta,a.id_acta);
    const c=await cliente.crear(org,campos); assert.equal(c.version,1); assert.equal(c.cumplido_at,null);
    assert.equal((await cliente.listar(org))[0].id_compromiso,c.id_compromiso);
    assert.equal((await cliente.obtener(org,c.id_compromiso)).responsable_contacto,campos.responsable_contacto);
    const terminado=await cliente.actualizar(org,c.id_compromiso,1,{...campos,estado:'cumplido'});
    assert.equal(terminado.version,2); assert.ok(terminado.cumplido_at);
    const editado=await cliente.actualizar(org,c.id_compromiso,2,{...campos,estado:'cumplido',descripcion:'Acuerdo actualizado'});
    assert.equal(editado.cumplido_at,terminado.cumplido_at);
    const reabierto=await cliente.actualizar(org,c.id_compromiso,3,campos); assert.equal(reabierto.cumplido_at,null);
    await assert.rejects(cliente.actualizar(org,c.id_compromiso,1,campos),{code:'CONFLICTO_CONCURRENCIA',status:409});
    const otra=await env.fixture('AR'), otroOrg=otra.organizacion.id_organizacion;
    await assert.rejects(cliente.crear(otroOrg,campos),{code:'ACTA_NO_CORRESPONDE'});
    await assert.rejects(cliente.obtener(otroOrg,c.id_compromiso),{code:'NO_ENCONTRADO',status:404});
    await assert.rejects(cliente.obtener(org,crypto.randomUUID()),{code:'NO_ENCONTRADO',status:404});
    await assert.rejects(cliente.actualizar(otroOrg,c.id_compromiso,4,campos),{code:'NO_ENCONTRADO',status:404});
    const coord=crearClienteCompromisos(http,async()=> 'qa-coord');
    assert.equal((await coord.catalogo(otroOrg)).puede_gestionar,false);
    await assert.rejects(coord.crear(otroOrg,campos),{code:'SIN_PERMISO',status:403});
    assert.equal((await coord.crear(org,campos)).estado,'pendiente');
    const sinRol=crearClienteCompromisos(http,async()=> 'qa-sin-rol');
    await assert.rejects(sinRol.listar(org),{status:404}); await assert.rejects(sinRol.catalogo(org),{status:404});
    const base=`/api/v1/organizations/${org}/commitments`;
    await assert.rejects(http.request(base),{status:401});
    await assert.rejects(http.request(`${base}?id_acta=no-uuid`,{accessToken:'qa-admin'}),{status:400});
    assert.equal((await http.request(`${base}?id_acta=${a.id_acta}`,{accessToken:'qa-admin'})).data.compromisos.length,2);
    for(const body of [{...campos,id_acta:null},{...campos,fecha_limite:'2026-02-30'},{...campos,responsable_contacto:''},{...campos,estado:'cumplido'},{...campos,version:100}]) {
      await assert.rejects(http.request(base,{method:'POST',accessToken:'qa-admin',body}),{status:400});
    }
    for(const body of [{cambios:{estado:'cumplido'}},{version_esperada:4,cambios:{}},{version_esperada:4,cambios:{id_acta:a.id_acta}},{version_esperada:4,cambios:{cumplido_at:'2026-01-01'}},{version_esperada:4,cambios:{estado:'cancelado'}}]) {
      await assert.rejects(http.request(`${base}/${c.id_compromiso}`,{method:'PATCH',accessToken:'qa-admin',body}),{status:400});
    }
    const simultaneas=await Promise.allSettled([cliente.actualizar(org,c.id_compromiso,4,{...campos,estado:'cumplido'}),cliente.actualizar(org,c.id_compromiso,4,{...campos,descripcion:'Otra sesión'})]);
    assert.equal(simultaneas.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(simultaneas.find(r=>r.status==='rejected').reason.code,'CONFLICTO_CONCURRENCIA');
    for(const columna of ['id_acta','version','cumplido_at','archived_at','created_by']) {
      assert.equal((await env.db.query("SELECT has_column_privilege('authenticated','public.compromisos',$1,'UPDATE') AS permitido",[columna])).rows[0].permitido,false);
    }
    await env.como('qa-sin-rol',async tx=>assert.equal((await tx.query('SELECT * FROM public.compromisos')).rows.length,0));
    await assert.rejects(env.db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT public.consultar_compromisos($1)',[org]);}),{code:'42501'});
    await assert.rejects(env.como('qa-admin',tx=>tx.query("UPDATE public.compromisos SET estado='cancelado' WHERE id_compromiso=$1",[c.id_compromiso])),{code:'23514'});
    assert.ok((await env.db.query("SELECT * FROM fge_private.historial_cambios WHERE tabla_afectada='compromisos' AND tipo_accion='UPDATE' AND id_usuario=$1",[env.usuarios.ADMIN])).rows.length>0);
    const lote=await actas.crear(org,{campos:camposActa,compromisos:[{...campos,id_acta:undefined,estado:undefined}]});
    assert.ok((await cliente.listar(org)).some(r=>r.id_acta===lote.id_acta));
    // Simula un registro archivado desde administración, sin exponer esa operación al cliente.
    await env.db.transaction(async tx=>{
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[env.usuarios.ADMIN]);
      await tx.query('UPDATE public.compromisos SET archived_at=now() WHERE id_compromiso=$1',[c.id_compromiso]);
    });
    await assert.rejects(cliente.obtener(org,c.id_compromiso),{status:404});
    await assert.rejects(cliente.actualizar(org,c.id_compromiso,5,campos),{status:404});
    const escrituras=env.solicitudes.filter(r=>r.ruta.endsWith('/guardar_compromiso'));
    assert.ok(escrituras.some(r=>r.entrada.p_version===4));
    assert.ok(escrituras.every(r=>r.token!=='service_role' && !('version' in r.entrada.p_datos) && !('cumplido_at' in r.entrada.p_datos)));
  } finally {await env.cerrar();}
});
