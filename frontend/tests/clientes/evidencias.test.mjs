import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoArchivo, MAX_BYTES, datosSchema, declaracion } from '../../src/lib/evidencias/modelo.ts';
import { crearClienteEvidencias } from '../../src/lib/evidencias/cliente.ts';
const id='17600000-0000-4000-8000-000000000001';
const datos={origen:'Visita',descripcion:'Fotografía de la actividad',personas:'sin_personas',consentimiento:false,tutor:false,publicable:false};
const evidencia={id_evidencia:id,id_accion:id,version:1,origen:'Visita',descripcion:'Acta',nombre_original:'acta.pdf',mime_type:'application/pdf',tamano_bytes:5,estado_carga:'reservado',estado_publicacion:'no_publicada',consentimiento_declarado:true,declaracion_consentimiento:'No aparecen personas.'};

test('archivos: extensión y MIME compatibles, límite de 50 MiB y archivo no vacío',()=>{
  assert.equal(tipoArchivo({name:'acta.PDF',type:'application/pdf',size:MAX_BYTES}),'application/pdf');
  assert.equal(tipoArchivo({name:'audio.wav',type:'audio/x-wav',size:10}),'audio/wav');
  assert.equal(tipoArchivo({name:'video.webm',type:'',size:10}),'video/webm');
  for(const f of [{name:'x.exe',type:'',size:1},{name:'x.pdf',type:'image/png',size:1},{name:'x.pdf',type:'application/pdf',size:0},{name:'x.pdf',type:'application/pdf',size:MAX_BYTES+1}])assert.throws(()=>tipoArchivo(f));
});
test('consentimiento de menores requiere declaración general y de tutor; no se envían usuarios ni fechas inventados',()=>{
  assert.ok(datosSchema.safeParse(datos).success);
  assert.equal(datosSchema.safeParse({...datos,personas:'adultos'}).success,false);
  assert.equal(datosSchema.safeParse({...datos,personas:'menores',consentimiento:true}).success,false);
  const menores={...datos,personas:'menores',consentimiento:true,tutor:true};
  assert.ok(datosSchema.safeParse(menores).success);
  assert.match(declaracion(menores).declaracion_consentimiento,/padre, madre o tutor/);
  assert.deepEqual(Object.keys(declaracion(menores)),['consentimiento_declarado','declaracion_consentimiento']);
});
test('contrato real: reserva JSON, carga binaria con versión, publicación y descarga privada autenticada',async()=>{
  const llamadas=[];
  const c=crearClienteEvidencias('http://api.test',async()=>'jwt',async(url,init)=>{
    llamadas.push({url,init});
    if(url.endsWith('/file')&&init.method==='GET')return new Response('%PDF-',{headers:{'content-type':'application/pdf'}});
    return Response.json({ok:true,data:url.includes('?id_accion=')?{evidences:[evidencia]}:{evidence:{...evidencia,estado_carga:init.method==='PUT'?'disponible':evidencia.estado_carga}}});
  });
  await c.listar(id);await c.reservar({...evidencia,consentimiento:declaracion(datos)});
  const file=new File(['%PDF-'],'acta.pdf',{type:'application/pdf'});
  await c.subir(evidencia,file);await c.actualizar(evidencia,{estado_publicacion:'publicada'});const blob=await c.descargar(evidencia);
  assert.equal(llamadas[2].init.body,file);assert.equal(llamadas[2].init.headers['content-type'],'application/pdf');
  assert.match(llamadas[2].url,/version_esperada=1/);assert.equal(llamadas[2].init.headers.authorization,'Bearer jwt');
  assert.equal(JSON.parse(llamadas[3].init.body).version_esperada,1);assert.equal(await blob.text(),'%PDF-');
});
test('no acepta respuestas de otra acción ni descargas con error como archivos',async()=>{
  const c=crearClienteEvidencias('http://api.test',async()=>'jwt',async()=>Response.json({ok:true,data:{evidence:{...evidencia,id_accion:'17600000-0000-4000-8000-000000000002'}}}));
  await assert.rejects(()=>c.obtener(id,id),e=>e.code==='RESPUESTA_INVALIDA');
  const error=crearClienteEvidencias('http://api.test',async()=>'jwt',async()=>Response.json({ok:false,error:{code:'SIN_PERMISO',message:'Sin permiso'}},{status:403}));
  await assert.rejects(()=>error.descargar(evidencia),e=>e.status===403);
});
