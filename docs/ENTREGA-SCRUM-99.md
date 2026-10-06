# Entrega SCRUM-99 — Expediente Legal de Organización

Fecha: 6 de octubre de 2026.
Rama de trabajo: `feature/SCRUM-99-expediente-legal`.
Destino del PR: `sprint-5`.

## Qué se hizo

- Se agregó la pestaña **Expediente Legal** dentro de la ficha de Organización, manteniendo los componentes y el diseño del proyecto.
- Se implementó la consulta, el registro y la edición de antecedentes legales, con un expediente por organización.
- El formulario incluye personalidad jurídica obligatoria (Sí, No, En proceso) y datos opcionales: tipo, número de registro, fecha de constitución y vigencia de la directiva.
- Se incorporaron tres adjuntos PDF opcionales de hasta 10 MB cada uno: identidad del representante, identificación legal y estatutos. Se muestran los estados Pendiente, No aplica y Cargado.
- Se agregaron validaciones, mensajes de error, carga, confirmación de guardado y cancelación sin modificar el registro.
- Se preparó el cliente HTTP para consultar y guardar; el transporte compartido ahora admite multipart sin cambiar los envíos JSON de otros módulos.
- Se incorporó una demostración temporal para revisar la interfaz mientras se implementa el servicio.
- Se verificó la instalación desde la raíz y el arranque del gateway y de los cinco servicios. Se agregó un `.gitignore` raíz para excluir dependencias. El `.env` local del backend no se incluye en Git.

## Alcance y pendiente

La interfaz está implementada y probada con respuestas simuladas. **Todavía no hay persistencia real del expediente ni subida real de los PDF**, porque la versión de backend revisada no contiene las rutas correspondientes. El modo normal muestra ese error; no simula un guardado exitoso.

No se implementaron eliminación de expediente, descarga de documentos ni nuevas migraciones. La consulta actual muestra campos, estados y nombres de archivo. La demostración no conserva datos después de recargar.

## Cómo revisar desde el IDE

1. Obtener la rama `feature/SCRUM-99-expediente-legal` una vez publicada y abrir la raíz del repositorio.
2. Ejecutar `npm install` en la raíz. Se necesita Node.js 22.12 o posterior.
3. Configurar `frontend/.env` con las variables del proyecto Supabase y `PUBLIC_API_BASE_URL=http://127.0.0.1:4000`.
4. Crear `backend/.env` a partir de `backend/.env.example` y completar `SUPABASE_URL` y `SUPABASE_ANON_KEY` con los valores del mismo proyecto. No subir archivos `.env` al repositorio.
5. Ejecutar `npm run dev` desde la raíz. Abre frontend, gateway y microservicios.
6. Entrar a `http://localhost:4321`, iniciar sesión con un usuario autorizado para consultar organizaciones y abrir una organización existente.
7. Añadir `?expediente=demo` al final de su URL, por ejemplo `/organizaciones/ID-REAL?expediente=demo`, y seleccionar **Expediente Legal**. Debe aparecer el aviso amarillo de demostración.

### Casos para la revisión manual

| Prueba | Resultado esperado |
| --- | --- |
| Abrir la pestaña en demostración | Estado vacío y botón para registrar |
| Guardar sin personalidad jurídica | Error de campo obligatorio |
| Completar únicamente personalidad jurídica | Permite guardar; los demás campos son opcionales |
| Adjuntar imagen o PDF mayor a 10 MB | Mensaje de validación |
| Adjuntar PDF válido | Documento marcado como Cargado en el registro de demostración |
| Elegir No aplica sin adjuntar | Se conserva ese estado |
| Editar un registro y cancelar | Los cambios no se aplican al resumen |
| Editar y guardar | Resumen actualizado y confirmación identificada como demostración |
| Recargar la página | Desaparecen los datos de demostración |
| Probar con ancho móvil | Formulario en una columna, sin desplazamiento horizontal |
| Quitar `?expediente=demo` mientras falta backend | Error de servicio no disponible, sin falso éxito |

Los errores HTTP y los conflictos de versión pueden reproducirse mediante las pruebas automatizadas, sin modificar la base de datos real.

## Cómo conectar el backend

El contrato detallado está en [PROBAR-SCRUM-99.md](PROBAR-SCRUM-99.md). Es un contrato propuesto para este cliente, pendiente de implementar o acordar con quien desarrolla el servicio.

1. Implementar GET, POST y PATCH en `/api/v1/organizations/:id/legal-record` dentro del servicio de organizaciones. Revisar su paso por el gateway.
2. Reutilizar la autenticación Bearer y las comprobaciones de acceso a la organización. Definir y probar permisos de consulta y escritura según los roles del proyecto.
3. Conectar el modelo de información legal con la organización. Resolver las migraciones necesarias para los campos, documentos y control de versión; esta entrega no modifica el esquema.
4. Procesar `multipart/form-data`: el campo `datos` lleva el JSON; los archivos usan los nombres `identidad_representante`, `identificacion_legal` y `estatutos`.
5. Validar datos y contenido real de los PDF en el servidor y guardarlos en almacenamiento privado. La validación del navegador no reemplaza la del backend. En edición, no recibir un archivo nuevo debe conservar el existente.
6. Devolver `{ ok: true, data: { expediente } }` con todos los campos del contrato. GET devuelve `expediente: null` solo cuando la organización existe y no tiene expediente. POST y PATCH devuelven el registro completo después de guardar.
7. Comprobar `version_esperada` en PATCH; ante una versión antigua devolver HTTP 409. El cliente conserva el formulario y pide recargar.
8. Probar sin `?expediente=demo`: crear, recargar para verificar persistencia, editar, comprobar documentos guardados, permisos, errores y conflictos entre sesiones.

### Archivos para la integración

- `frontend/src/lib/expediente-legal/modelo.ts`: campos, tipos y validaciones.
- `frontend/src/lib/expediente-legal/cliente.ts`: rutas, multipart, token y lectura de respuestas.
- `frontend/src/lib/expediente-legal/interfaz.ts`: comportamiento y selección entre servicio real y demostración.
- `frontend/src/lib/expediente-legal/demo.ts`: datos temporales, solo en desarrollo.
- `frontend/src/components/organizaciones/OrganizacionExpedienteLegal.astro`: interfaz visual.
- `frontend/src/lib/api/transporte.ts`: transporte HTTP compartido.

Si se respeta el contrato, no hay que reemplazar el formulario para activar el backend: el modo normal ya usa el cliente HTTP. Si cambian las rutas o la respuesta, ajustar `cliente.ts` y sus pruebas.

## Verificaciones realizadas

- 46 pruebas del frontend aprobadas.
- 5 pruebas de navegador aprobadas con respuestas HTTP simuladas.
- Compilación del frontend aprobada.
- Gateway y cinco microservicios responden HTTP 200 en `/health`; esto verifica arranque, no la persistencia legal pendiente.
- El chequeo global de tipos conserva 17 errores previos ajenos al expediente: 16 en Diagnóstico y uno en la importación antigua de Acciones.

Comandos desde la raíz:

```sh
npm run test --workspace=frontend
npm run test:e2e:expediente --workspace=frontend
npm run build --workspace=frontend
```

Las pruebas de navegador utilizan Edge en Windows. Esta entrega no implica una prueba completa de persistencia contra Supabase real.
