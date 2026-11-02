// Prueba optativa sobre una instancia Supabase con la migración ya aplicada.
// Crea una evidencia QA y un PNG real; finalmente archiva el registro (sin borrar auditoría).
import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';

loadEnvFile(new URL('../backend/.env', import.meta.url));

const { SUPABASE_URL, SUPABASE_ANON_KEY, QA_ACCESS_TOKEN, QA_ACTION_ID } = process.env;
if (![SUPABASE_URL,SUPABASE_ANON_KEY,QA_ACCESS_TOKEN,QA_ACTION_ID].every(Boolean)) {
  console.error('Configure SUPABASE_URL, SUPABASE_ANON_KEY, QA_ACCESS_TOKEN y QA_ACTION_ID de una acción de pruebas.');
  process.exit(1);
}
const base = new URL(SUPABASE_URL);
if (!['https:','http:'].includes(base.protocol)) throw new Error('URL Supabase inválida.');
const headers = {apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${QA_ACCESS_TOKEN}`};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=','base64');
async function request(path, options={}) {
  const res = await fetch(new URL(path,base), {...options,headers:{...headers,...options.headers}});
  if (!res.ok) {
    // No imprimir cabeceras ni JWT. Solo el código de error del servicio.
    const error = await res.json().catch(()=>({}));
    throw new Error(`HTTP ${res.status}: ${error.code ?? error.error ?? 'fallo de operación'}`);
  }
  return res;
}
const jsonHeaders = {'content-type':'application/json',Prefer:'return=representation'};
let evidence;
async function patch(changes) {
  const res = await request(`/rest/v1/evidencias?id_evidencia=eq.${evidence.id_evidencia}&version=eq.${evidence.version}`,{
    method:'PATCH',headers:jsonHeaders,body:JSON.stringify(changes),
  });
  const rows = await res.json();
  assert.equal(rows.length,1,'Conflicto de versión o falta de permisos');
  evidence = rows[0];
}
try {
  const created = await request('/rest/v1/evidencias', {method:'POST',headers:jsonHeaders,body:JSON.stringify({
    id_accion:QA_ACTION_ID,origen:'Prueba de integración QA',descripcion:'QA Evidencias: PNG de un píxel',
    nombre_original:'qa-evidencia.png',mime_type:'image/png',tamano_bytes:png.length,
  })});
  evidence = (await created.json())[0];
  assert.ok(evidence.id_evidencia); assert.ok(evidence.incorporado_por);
  console.log('Evidencia QA creada:',evidence.id_evidencia);
  await request(`/storage/v1/object/${evidence.bucket_id}/${evidence.ruta_objeto}`,{
    method:'POST',headers:{'content-type':'image/png','x-upsert':'false'},body:png,
  });
  await patch({estado_carga:'disponible'});
  const downloaded = await request(`/storage/v1/object/authenticated/${evidence.bucket_id}/${evidence.ruta_objeto}`);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);
  await patch({consentimiento_declarado:true,declaracion_consentimiento:'Archivo sintético de QA sin datos personales; autorizado para esta prueba.'});
  assert.ok(evidence.consentimiento_at); assert.ok(evidence.consentimiento_por);
  await patch({estado_publicacion:'publicada'});
  assert.equal(evidence.publicado,true);
  await patch({estado_publicacion:'retirada',consentimiento_declarado:false,declaracion_consentimiento:'Fin de prueba de publicación QA.'});
  assert.equal(evidence.publicado,false);
  console.log('Registro, carga, confirmación, descarga idéntica, consentimiento, publicación y retiro: OK.');
} finally {
  if (evidence) {
    // Se retira antes de archivar si hubo un fallo después de publicar.
    if (evidence.publicado) await patch({estado_publicacion:'retirada'});
    await request('/rest/v1/rpc/archivar_evidencia_segura',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({p_id:evidence.id_evidencia,p_version:evidence.version}),
    });
    console.log('Registro QA archivado. Se conserva el archivo privado y su historial:',evidence.id_evidencia);
  }
}
