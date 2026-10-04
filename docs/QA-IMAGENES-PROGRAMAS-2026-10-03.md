**Resultado: no aprobar todavía la tarea «Implementar almacenamiento y procesamiento de imágenes de Programas» (RF73/HU03).**

**Seguimiento posterior de integración KAN-176:** los resultados de este informe
describen el commit inicial `232d299`. Durante la implementación posterior se
corrigieron los reintentos que duplicaban programas o provocaban conflictos, el
error oculto de imagen en el detalle y el descarte de imágenes al recargar datos.
Los scripts de navegador se actualizaron para verificar esas correcciones.
Los pendientes específicos del backend de imágenes (límite de tamaño y
verificación binaria en Storage) no forman parte de esta corrección de integración
y conservan el estado indicado abajo. Ver [validación actual de KAN-176](PROBAR-KAN-176.md).

La funcionalidad principal está implementada y funciona en las pruebas locales, pero hay incumplimientos en el límite de tamaño del backend y en la recuperación de errores del frontend. Se revisaron los siete criterios de la captura, primero el backend y después la interfaz. No se modificó la implementación: se añadieron únicamente pruebas de QA y este informe.

Fecha: 3 de octubre de 2026. Rama revisada: `feature/KAN-176-integrar-modulo`. Commit inicial: `232d299`. El árbol de trabajo estaba limpio antes de añadir estos artefactos.

**Backend: hallazgos y comprobaciones**

1. **[P2] El límite del servidor no coincide con «inferior a 600 KB».**

   En `supabase/migrations/20260922111500_fge_programas_storage_rls.sql`, línea 5, el bucket permite 614.400 bytes; la restricción de metadatos en la línea 38 utiliza `<= 614400`. El navegador, en cambio, exige `< 600000` en `frontend/src/lib/programas/imagen.ts`, línea 18, y la documentación de KAN-166 describe 600.000 bytes.

   Se reprodujo con las migraciones reales en PostgreSQL embebido: insertar imágenes declaradas de 600.000, 610.000 y 614.400 bytes no produce rechazo. Una de 614.401 bytes sí se rechaza. Incluso interpretando 600 KB como 600 KiB, se permite el valor exacto del límite, aunque el requisito pide un peso inferior.

   Corrección necesaria: acordar una sola unidad y aplicar un límite estricto coherente en Storage, metadatos y navegador. Para el contrato actual de la interfaz, el máximo permitido debe ser 599.999 bytes.

2. **La comprobación del formato real depende del navegador.**

   La conversión se implementa mediante `createImageBitmap` y `canvas.toBlob` en `frontend/src/lib/programas/imagen.ts`, líneas 3–23. No se encontró un procesador de imágenes del lado servidor en este repositorio. El bucket permite MIME JPEG, PNG y WebP; las políticas de escritura de `storage.objects` comprueban el prefijo y la extensión `.webp`, y `public.archivos` comprueba el MIME declarado en los metadatos.

   Por inspección, estas reglas no verifican que los bytes del objeto sean WebP ni vinculan su tamaño real con `tamano_bytes`. No se probó una carga manipulada contra el servicio real de Storage, por lo que no se presenta como un bypass HTTP reproducido. Sí queda pendiente acreditar que una llamada directa al backend no puede saltarse las garantías de formato de la interfaz.

   Si el requisito exige esas garantías también para clientes que no usan el formulario, hace falta validación del contenido en un componente de servidor o una comprobación equivalente antes de marcar la imagen como disponible.

3. **Comprobaciones que pasaron:** un ADMIN puede asociar metadatos WebP válidos; la FK rechaza programas inexistentes; los metadatos finales JPEG, PNG, GIF y PDF se rechazan; COORD puede consultar pero no insertar metadatos ni objetos; una ruta con extensión GIF se rechaza por RLS.

   El almacenamiento es privado, con rutas únicas por programa y URL firmada de 300 segundos. La función `guardarImagen` primero sube el objeto y después registra `archivos`; si falla ese registro intenta eliminar el objeto subido. Se verificó esta compensación en la prueba de navegador con transporte de Storage simulado. El error de la eliminación compensatoria no se comprueba en el código, por lo que no hay garantía de limpieza si esa segunda petición también falla.

**Frontend: defectos reproducidos**

4. **[P1] Reintentar una imagen fallida durante la creación duplica el programa.**

   Ubicación: `frontend/src/lib/programas/formulario.ts`, líneas 24–25 y 219–228.

   Pasos: abrir Crear programa, completar datos y elegir una imagen; hacer que Storage rechace la primera subida; volver a pulsar Guardar cuando Storage ya responde correctamente.

   Resultado: se ejecuta `crearPrograma` dos veces y PostgreSQL conserva dos programas distintos con el mismo nombre. La prueba observó dos UUID diferentes. El primer programa queda creado sin la imagen; el segundo recibe la imagen.

   Causa: el ID devuelto por la primera creación queda solo en la variable local `nuevoId`. El formulario conserva `id` vacío y el siguiente envío vuelve a pasar por la creación. La documentación de KAN-166 afirma que se conserva el ID para reintentar, pero el código actual no lo hace.

   Corrección necesaria: conservar ID y versión inmediatamente después de guardar el programa y reintentar la fase de imagen sobre ese mismo registro.

5. **[P1] Reintentar una imagen fallida durante la edición provoca un conflicto de versión propio.**

   Ubicación: `frontend/src/lib/programas/formulario.ts`, líneas 207–228.

   Pasos: editar un programa existente, seleccionar una imagen, provocar un fallo de Storage después de actualizar el programa y volver a guardar.

   Resultado: la segunda Action devuelve `CONFLICTO_CONCURRENCIA` y «El programa fue modificado por otra sesión», aunque la única modificación es la del primer intento del mismo formulario. La imagen no llega a subirse en el reintento.

   Causa: `version` solo se carga al consultar el programa; no se actualiza con la versión devuelta por la escritura exitosa antes de subir la imagen. Este problema comparte la causa de manejo de estado con el defecto anterior y también afecta por inspección a errores al quitar una imagen después de actualizar el programa.

   Corrección necesaria: conservar la nueva versión y evitar repetir innecesariamente la escritura del programa cuando solo queda pendiente la imagen.

6. **[P2] El detalle oculta los errores de consulta de la imagen.**

   Ubicación: `frontend/src/pages/programas/[id].astro`, líneas 162–166.

   Pasos: guardar un programa con imagen, comprobar que se muestra, provocar un 503 al consultar `archivos` y recargar el detalle.

   Resultado: la imagen desaparece sin mensaje de error ni indicación de que la consulta falló. El `catch` únicamente oculta el elemento. El usuario no puede distinguir una carga fallida de un programa sin imagen.

   Corrección necesaria: mostrar un estado de error de imagen con opción de reintento, manteniendo visible el resto del programa.

**Criterios de aceptación**

| Criterio | Resultado local | Evidencia y límite |
| --- | --- | --- |
| Se pueden cargar imágenes de Programas | Funciona el flujo normal | Navegador real, Actions reales y almacenamiento simulado. |
| Se aceptan JPG, PNG y WebP | Cumple en el formulario | Tres pruebas completas, una por formato. |
| La imagen se convierte a WebP | Cumple en el navegador; garantía de servidor pendiente | Se verificaron MIME y firmas binarias RIFF/WEBP de lo enviado. |
| El archivo final pesa menos de 600 KB | Parcial; falla backend | Navegador produce menos de 600.000 bytes; servidor admite hasta 614.400 inclusive. |
| La imagen queda asociada al Programa | Funciona el flujo normal | ID y ruta enviados coinciden; FK comprobada; no se acreditó persistencia binaria en Supabase remoto. |
| Se rechazan formatos no permitidos | Cumple en el formulario; validación binaria del backend pendiente | GIF, SVG, PDF y PNG corrupto rechazados; RLS y metadatos comprobados por separado. |
| Se manejan errores de carga | No cumple completamente | Mensajes iniciales presentes, pero el reintento duplica o queda bloqueado; el detalle silencia fallos. |

**Pruebas ejecutadas**

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test`, desde `frontend` | 100/100 pruebas existentes aprobadas. |
| `npm.cmd run build`, desde `frontend` | Compilación correcta. |
| `node supabase/verificar-archivos.mjs`, desde la raíz | Comprobación estática correcta; no ejecuta pgTAP. |
| `node scripts/qa-imagenes-backend.mjs`, desde `frontend` | 11/14 comprobaciones aprobadas; 3 fallos por los límites de tamaño. |
| `npx.cmd playwright test --config scripts/qa-imagenes.config.mjs`, desde `frontend` | 9/12 pruebas aprobadas; fallan creación con reintento, edición con reintento y error de imagen en detalle. |

La prueba de compresión utilizó un JPEG de 5.670.479 bytes y 2800 × 2000 píxeles con ruido reproducible. El resultado fue un WebP de 506.048 bytes y 1280 × 914 píxeles. También se comprobó el rechazo de archivos superiores a 10 MiB, el bloqueo de guardado después de seleccionar un formato inválido y la limpieza compensatoria tras fallar el registro de metadatos.

Las pruebas nuevas expresan el comportamiento requerido: sus fallos son reproducciones de los defectos, no resultados esperados convertidos en éxitos. Se mantienen separadas de `npm test` para que se puedan ejecutar como auditoría específica.

**Alcance y evidencia**

Se usó Microsoft Edge sin interfaz visible y PostgreSQL embebido mediante el helper existente de PGlite. Las migraciones de aplicación, Actions y repositorios se ejecutaron realmente; Auth, transporte PostgREST y operaciones de Storage se simularon en el entorno local. Las imágenes sí se decodificaron y convirtieron con las APIs reales del navegador.

No había Docker, `psql` ni Supabase CLI disponibles en el entorno consultado. No se ejecutó la suite pgTAP contra Supabase completo, no se verificaron migraciones del proyecto remoto y no se escribieron datos en él. Por tanto, los resultados no certifican el almacenamiento ni los permisos desplegados remotamente.

El proceso de servidor del runner de Playwright quedó abierto durante el cierre en Windows; se detuvo únicamente el proceso iniciado por esta auditoría después de terminar los casos. El runner entregó el resultado completo: 9 aprobados y 3 fallidos. Esto es una limitación del cierre del entorno de prueba, separada de los defectos funcionales.

Los fallos conservan capturas, contexto de la página y `trace.zip` bajo `frontend/test-results/qa-imagenes/` (carpeta ignorada por Git). Los scripts de reproducción son:

- `frontend/scripts/qa-imagenes-backend.mjs`
- `frontend/scripts/qa-imagenes.config.mjs`
- `frontend/scripts/qa-imagenes.spec.mjs`

Para cerrar la tarea: corregir los reintentos y el límite de tamaño, mostrar los errores de imagen en el detalle, decidir/verificar la validación de contenido en backend y repetir la carga, consulta y permisos contra un Supabase de pruebas con las migraciones aplicadas.
