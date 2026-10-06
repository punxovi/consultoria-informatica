# SCRUM-99: Expediente Legal

La ficha de Organización incorpora la pestaña **Expediente Legal**, con consulta, registro y edición. Se mantiene un expediente por organización, según el modelo actual. Incluye personalidad jurídica obligatoria, datos legales opcionales y tres PDF opcionales de hasta 10 MB cada uno. Los documentos pueden quedar pendientes o marcarse como «No aplica»; seleccionar un PDF establece «Cargado».

## Probar desde el IDE

1. Desde la raíz del repositorio, ejecutar `npm run dev`. Esto inicia el frontend y los servicios HTTP necesarios para iniciar sesión y consultar organizaciones.
2. Iniciar sesión y abrir la ficha de una organización.
3. Para probar la interfaz mientras falta el servicio legal, agregar `?expediente=demo` al final de la dirección y abrir la pestaña **Expediente Legal**.
4. Registrar antecedentes, seleccionar personalidad jurídica y probar los PDF. Guardar, consultar, editar y cancelar.

La demostración solo está habilitada en desarrollo y muestra un aviso permanente. Los datos y archivos no se envían al servidor; se pierden al recargar. No es una alternativa de almacenamiento real.

Sin ese parámetro se utiliza el cliente HTTP real. En la base de sprint-5 revisada (`e58c122`) todavía no existe el servicio legal: se muestra un error de servicio no disponible, sin presentar un expediente vacío ni confirmar un guardado inexistente. Esta tarea deja la interfaz y el cliente preparados; la persistencia real depende de implementar el contrato siguiente. No se requieren nuevas migraciones para probar la demostración.

## Contrato HTTP propuesto para integrar el servicio

Ruta: `/api/v1/organizations/:id/legal-record`, con `Authorization: Bearer <token>`.

- `GET`: devuelve `{ ok: true, data: { expediente } }`. `expediente: null` representa una organización sin antecedentes. Una ruta inexistente no representa un expediente vacío.
- `POST`: registra el expediente.
- `PATCH`: actualiza el expediente existente.

POST y PATCH envían `multipart/form-data`. El campo `datos` contiene JSON con `estado_personalidad_juridica` (`si`, `no`, `en_proceso`), `tipo_personalidad_juridica` (vacío, `PJ`, `ONG`, `Fundación`), `numero_registro`, `fecha_constitucion` (vacío o YYYY-MM-DD), `vigencia_directiva` y `documentos` (tipo y estado). PATCH incluye `version_esperada` para evitar sobrescribir cambios de otra sesión.

Los archivos opcionales usan los nombres `identidad_representante`, `identificacion_legal` y `estatutos`. La ausencia de un archivo en una edición conserva el documento existente. El navegador genera el límite multipart; el cliente no fija manualmente Content-Type.

Las respuestas de guardado devuelven el expediente completo: campos anteriores, `id_informacion_legal`, `id_organizacion`, `version` entera positiva, `updated_at` y los tres documentos. Cada documento contiene `tipo`, `estado` (`pendiente`, `no_aplica`, `cargado`) y `nombre_archivo` (obligatorio cuando está cargado, null en los demás estados). Los campos opcionales null se normalizan a texto vacío en el cliente.

Errores: `{ ok: false, error: { code, message } }` con el estado HTTP correspondiente. Un 409 conserva el formulario y exige recargar antes de guardar de nuevo. Los errores de permisos o guardado conservan los valores ingresados.

El servicio deberá comprobar permisos y acceso a la organización, validar contenido/tamaño real de PDF, almacenar documentos privados y resolver el guardado de datos y archivos sin confirmar operaciones incompletas. El estado Cargado debe verificarse en el servidor. El modelo y el cliente están separados de la interfaz para ajustar el contrato cuando exista el servicio definitivo.

## Verificación

Desde la raíz:

```sh
npm run test --workspace=frontend
npm run test:e2e:expediente --workspace=frontend
npm run build --workspace=frontend
```

Las pruebas de navegador interceptan las respuestas HTTP; no usan ni modifican Supabase real. Cubren registro, PDF inválido, validación obligatoria, edición, cancelación, errores, conflictos, demostración y ancho móvil. En Windows utilizan Microsoft Edge.

La revisión general de tipos (`npm exec --workspace=frontend -- astro check`) detectó 17 errores previos ajenos a esta tarea: 16 en Diagnóstico y uno por una importación de Actions antigua en `src/lib/acciones/presentacion.ts`. La compilación del frontend sí finaliza correctamente.
