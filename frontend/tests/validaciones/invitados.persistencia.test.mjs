import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { crearBaseProgramas, usuarios } from '../helpers/programas-db.mjs';

test('Invitados: ciclo real SQL, permisos, primer uso, vencimiento y revocación', async t => {
  const db = await crearBaseProgramas();
  const external = randomUUID(), session = randomUUID();
  try {
    await db.exec(`ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN email_confirmed_at timestamptz,
      ADD COLUMN raw_user_meta_data jsonb, ADD COLUMN raw_app_meta_data jsonb;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
    await db.query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'guest@example.invalid',now());
      `,[external]);
    await db.query(`INSERT INTO public.perfiles(id_usuario,nombre) VALUES ($1,'Identidad declarada')`,[external]);
    // Reproduce el proyecto remoto: RPC anterior creada fuera de las migraciones.
    await db.exec(`CREATE FUNCTION public.gestionar_invitados(p_operacion text,p_datos jsonb DEFAULT '{}') RETURNS jsonb
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Operación no soportada' USING ERRCODE='G0145'; END $$;`);
    await db.exec(`CREATE ROLE qa_storage_owner;
      CREATE TABLE storage.buckets_vectors(id text); ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;
      ALTER TABLE storage.buckets_vectors OWNER TO qa_storage_owner;`);
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261106120200_fge_scrum171_ciclo_invitados.sql',import.meta.url),'utf8'));
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND tablename='buckets_vectors'")).rows[0].n,0);
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acceso_invitado_vigente'")).rows[0].n,1);
    const as = (id, operation, data={}, sid=session) => db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${id ? 'authenticated' : 'anon'}`);
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [id ?? '',JSON.stringify({session_id:sid,iat:Math.floor(Date.now()/1000)+10})]);
      return (await tx.query('SELECT public.gestionar_invitados($1,$2) AS result',[operation,JSON.stringify(data)])).rows[0].result;
    });
    const check = (id,sid=session) => db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({session_id:sid})]);
      return (await tx.query(`SELECT public.validar_acceso_invitado() AS allowed,
        (SELECT count(*)::int FROM public.get_user_roles()) AS roles`)).rows[0];
    });
    let request;
    await t.test('alta pública mínima, duplicado, datos inválidos y administración protegida', async () => {
      request=await as(null,'create',{nombre:'Persona Invitada',correo:'Guest@example.invalid'});
      assert.equal(request.estado,'pendiente');
      assert.equal(request.correo,undefined);
      await assert.rejects(as(null,'create',{nombre:'Duplicado',correo:'guest@example.invalid'}),{code:'G0148'});
      await assert.rejects(as(null,'create',{nombre:'',correo:'bad'}),{code:'G0145'});
      for(const op of ['list','get','approve','reject','revoke']) {
        await assert.rejects(as(usuarios.COORD,op,{id_invitado:request.id_invitado,version_esperada:1}),{code:'42501'});
      }
      await assert.rejects(as(usuarios.ADMIN,'get',{id_invitado:randomUUID()}),{code:'G0146'});
    });
    await t.test('aprobación, conflicto y primer uso único con identidad y vigencia de 24 horas', async () => {
      await assert.rejects(as(external,'consume'),{code:'G0149'});
      await assert.rejects(as(usuarios.ADMIN,'approve',{id_invitado:request.id_invitado,version_esperada:9}),{code:'G0147'});
      const approved=await as(usuarios.ADMIN,'approve',{id_invitado:request.id_invitado,version_esperada:1});
      assert.equal(approved.utilizado_en,null);
      const consumed=await as(external,'consume');
      assert.equal(consumed.id_usuario,external);
      assert.equal(new Date(consumed.expira_en)-new Date(consumed.utilizado_en),86400000);
      assert.equal(consumed.sesion_id,undefined);
      await assert.rejects(as(external,'consume'),{code:'G0149'});
      assert.deepEqual(await check(external),{allowed:true,roles:1});
      assert.deepEqual(await check(external,randomUUID()),{allowed:false,roles:0});
    });
    await t.test('revocación niega de inmediato el JWT previamente autorizado y conserva historial',async () => {
      const current=await as(usuarios.ADMIN,'get',{id_invitado:request.id_invitado});
      await as(usuarios.ADMIN,'revoke',{id_invitado:request.id_invitado,version_esperada:current.version});
      assert.deepEqual(await check(external),{allowed:false,roles:0});
      await assert.rejects(as(external,'consume'),{code:'G0149'});
      assert.ok((await db.query(`SELECT count(*)::int n FROM fge_private.historial_cambios WHERE tabla_afectada='solicitudes_invitado'`)).rows[0].n>=4);
    });
    await t.test('rechazo y nueva solicitud; caducidad comprobada en roles y consultas directas',async () => {
      const denied=await as(null,'create',{nombre:'Persona Invitada',correo:'guest@example.invalid'});
      await as(usuarios.ADMIN,'reject',{id_invitado:denied.id_invitado,version_esperada:1});
      await assert.rejects(as(usuarios.ADMIN,'approve',{id_invitado:denied.id_invitado,version_esperada:2}),{code:'G0150'});
      const next=await as(null,'create',{nombre:'Persona Invitada',correo:'guest@example.invalid'});
      await as(usuarios.ADMIN,'approve',{id_invitado:next.id_invitado,version_esperada:1});
      await as(external,'consume');
      await db.query(`UPDATE public.solicitudes_invitado SET utilizado_en=now()-interval '25 hours',expira_en=now()-interval '1 hour' WHERE id_invitado=$1`,[next.id_invitado]);
      assert.deepEqual(await check(external),{allowed:false,roles:0});
      await db.transaction(async tx=>{
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[external]);
        assert.equal((await tx.query('SELECT count(*)::int n FROM public.programas')).rows[0].n,0);
      });
      const renewed=await as(null,'create',{nombre:'Persona Invitada',correo:'guest@example.invalid'});
      assert.equal(renewed.estado,'pendiente');
    });
    await t.test('no permite lectura ni cambios directos de solicitudes y cuentas internas siguen activas',async () => {
      await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query('SELECT * FROM public.solicitudes_invitado');}),{code:'42501'});
      assert.deepEqual(await check(usuarios.ADMIN),{allowed:true,roles:1});
    });
    await t.test('el script de comprobación remota también se ejecuta y revierte sus datos',async()=>{
      const before=(await db.query('SELECT count(*)::int n FROM public.solicitudes_invitado')).rows[0].n;
      await db.exec(await readFile(new URL('../../../supabase/checks/invitados-ciclo-acceso.sql',import.meta.url),'utf8'));
      assert.equal((await db.query('SELECT count(*)::int n FROM public.solicitudes_invitado')).rows[0].n,before);
    });
  } finally { await db.close(); }
});
