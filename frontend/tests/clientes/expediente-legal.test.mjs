import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteExpediente } from '../../src/lib/expediente-legal/cliente.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';
import { camposLegalSchema, documentosVacios, validarPdf } from '../../src/lib/expediente-legal/modelo.ts';
const campos = { estado_personalidad_juridica:'en_proceso',tipo_personalidad_juridica:'',numero_registro:'',fecha_constitucion:'',vigencia_directiva:'' };
const id='17600000-0000-4000-8000-000000000001';
const expediente={...campos,id_organizacion:id,id_informacion_legal:id,version:2,updated_at:'2026-10-06T10:00:00Z',documentos:documentosVacios()};

test('personalidad obligatoria; los datos complementarios y documentos pueden quedar pendientes',()=>{
  assert.equal(camposLegalSchema.safeParse(campos).success,true);
  assert.equal(camposLegalSchema.safeParse({...campos,estado_personalidad_juridica:''}).success,false);
  assert.equal(camposLegalSchema.safeParse({...campos,fecha_constitucion:'2026-02-30'}).success,false);
  assert.equal(camposLegalSchema.safeParse({...campos,fecha_constitucion:'2024-02-29'}).success,true);
  assert.equal(validarPdf({name:'archivo.pdf',type:'application/pdf',size:10*1024*1024}),null);
  assert.match(validarPdf({name:'archivo.pdf',type:'application/pdf',size:10*1024*1024+1}),/10 MB/);
  assert.match(validarPdf({name:'archivo.png',type:'image/png',size:100}),/PDF/);
  assert.match(validarPdf({name:'archivo.pdf',type:'application/pdf',size:0}),/vacío/);
});

test('cliente HTTP envía multipart, token y versión; acepta expediente vacío explícito',async()=>{
  const llamadas=[];
  const transporte=createApiTransport('http://api.test',async(url,options)=>{
    llamadas.push({url,options});
    return Response.json({ok:true,data:{expediente:options.method==='GET'?null:expediente}});
  });
  const cliente=crearClienteExpediente(transporte,async()=>'token-prueba');
  assert.equal(await cliente.obtener(id),null);
  const archivo=new File(['%PDF-1.7 prueba'],'estatutos.pdf',{type:'application/pdf'});
  await cliente.crear(id,{campos,documentos:documentosVacios(),archivos:{estatutos:archivo}});
  await cliente.actualizar(id,2,{campos,documentos:documentosVacios(),archivos:{}});
  assert.equal(llamadas[1].options.method,'POST');
  assert.equal(llamadas[2].options.method,'PATCH');
  assert.equal(llamadas[1].options.headers.Authorization,undefined);
  assert.equal(llamadas[1].options.headers.authorization,'Bearer token-prueba');
  assert.equal(llamadas[1].options.headers['content-type'],undefined);
  assert.equal(llamadas[1].options.body.get('estatutos').name,'estatutos.pdf');
  assert.equal(JSON.parse(llamadas[2].options.body.get('datos')).version_esperada,2);
  assert.equal(llamadas[0].url,`http://api.test/api/v1/organizations/${id}/legal-record`);
});

test('no confunde una ruta pendiente con ausencia de expediente y conserva errores del servicio',async()=>{
  const cliente=crearClienteExpediente(createApiTransport('',async()=>Response.json({ok:false,error:{code:'RUTA_NO_ENCONTRADA',message:'Ruta no encontrada'}},{status:404})),async()=>'token');
  await assert.rejects(cliente.obtener(id),{code:'RUTA_NO_ENCONTRADA',status:404});
  const otro=crearClienteExpediente(createApiTransport('',async()=>Response.json({ok:true,data:{expediente:{...expediente,id_organizacion:'otra'}}})),async()=>'token');
  await assert.rejects(otro.obtener(id),{code:'RESPUESTA_INVALIDA'});
  const conflicto=crearClienteExpediente(createApiTransport('',async()=>Response.json({ok:false,error:{code:'CONFLICTO_CONCURRENCIA',message:'Recarga los datos'}},{status:409})),async()=>'token');
  await assert.rejects(conflicto.actualizar(id,1,{campos,documentos:documentosVacios(),archivos:{}}),{status:409});
});

test('el transporte mantiene el envío JSON de los demás módulos',async()=>{
  await createApiTransport('',async(_url,options)=>{
    assert.equal(options.headers['content-type'],'application/json');
    assert.equal(options.body,'{"nombre":"Prueba"}');
    return Response.json({ok:true,data:{}});
  }).request('/organizations',{method:'POST',body:{nombre:'Prueba'}});
});
