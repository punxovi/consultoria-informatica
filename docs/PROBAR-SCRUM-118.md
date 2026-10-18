# SCRUM-118 — Preparación y prueba manual

## Verificación realizada — 18 de octubre de 2026

Se ejecutó `node scripts/probar-indicadores-supabase.mjs` contra el proyecto Supabase de desarrollo,
con una sesión autenticada y servicios locales. Resultado: **1 passed**.

El navegador consultó el catálogo, asoció un indicador a una Acción de prueba con meta 20, registró
un resultado de 0, actualizó la meta a 30 y el resultado a 25. Después de recargar, ambos valores
se mantuvieron en pantalla. Las consultas directas a Supabase confirmaron la persistencia, las
relaciones Acción–indicador–resultado, el usuario creador y la versión 2 del resultado.
Las solicitudes de Indicadores y Resultados pasaron por el Gateway; la consulta del catálogo sin
sesión devolvió 401. No se detectaron errores de JavaScript en el navegador.

La prueba archivó su asociación y resultado (`e91f8536-23d2-437d-a46a-747ab4b046ff`) y su Acción
(`51eff7fe-0223-451a-8563-2080dc5b1a6d`). Conservó los datos de la Acción de referencia.
Esta ejecución remota utilizó un usuario autorizado; los casos de permisos de otros perfiles y
conflictos se cubren en las pruebas locales de integración, sin atribuirles una ejecución remota.

## Ubicación de la interfaz

La interfaz está en **Planes de Intervención → abrir un Plan → abrir una Acción → Indicadores y resultados**.
Todas las operaciones de este módulo pasan por el cliente HTTP, el Gateway y el servicio de Intervenciones.
La sesión existente se envía a Supabase; no se utiliza la clave de publicación ni una clave de servicio para el módulo.

## 1. Preparar Supabase

1. Abre el proyecto de desarrollo `fge-dev` en Supabase → **SQL Editor → New query**.
2. Comprueba que estén aplicadas las migraciones previas de Indicadores, Resultados y RLS:
   `20261015120000_fge_tabla_indicadores.sql`, `20261015120100_fge_tabla_resultados.sql`
   y **`20261015130000_fge_sprint6_rls.sql`**. Esta última es necesaria para permitir `id_accion`
   vacío en el catálogo y crear sus políticas de acceso. No vuelvas a ejecutar migraciones antiguas ya aplicadas.
3. Abre en VS Code **supabase/migrations/20261017120000_fge_indicadores_integracion.sql**.
   Copia todo el archivo, pégalo en una consulta nueva y pulsa **Run** una sola vez.
   Debe finalizar sin errores. No elimina datos existentes.
4. En otra consulta ejecuta completo **supabase/tests/database/018_indicadores_integracion.test.sql**.
   Debes ver `1..15` y quince filas `ok`. Esta prueba termina en `ROLLBACK`.
   Comprueba instalación y permisos; no sustituye la prueba autenticada del navegador.

### Si la carga del catálogo falla porque `id_accion` no admite NULL

El esquema remoto todavía no tiene aplicado el cambio de Sprint 6 que permite definiciones sin Acción.
Ejecuta completo **supabase/migrations/20261015130000_fge_sprint6_rls.sql** en una consulta nueva y
después repite **supabase/seeds/indicadores_desarrollo.sql**. Aplica la migración completa para instalar
también los permisos del catálogo. Si la integración SCRUM-118 ya terminó correctamente, no la repitas:
el paso pendiente es la dependencia RLS. Si aparece otro error (por ejemplo, una política ya existe),
revisa ese error antes de seguir: la transacción revierte los cambios de una ejecución fallida.

## 2. Comprobar el catálogo

```sql
SELECT id_indicador, nombre, unidad_medida
FROM public.indicadores
WHERE id_accion IS NULL AND archived_at IS NULL
ORDER BY nombre;
```

Estas filas son el catálogo institucional. Si está vacío, la interfaz informa que no hay indicadores.
El Frontend no inventa registros ni utiliza datos de demostración. Un administrador debe cargar las
definiciones acordadas por el equipo. La migración no introduce un catálogo institucional sin confirmar.

Para el catálogo vacío de **fge-dev**, se preparó **supabase/seeds/indicadores_desarrollo.sql** con
las cinco definiciones que contemplaba la interfaz SCRUM-112: beneficiarios, participantes,
capacitaciones, raciones y acciones ejecutadas. Después de la migración del paso 1, copia el archivo
completo en una consulta nueva de SQL Editor y pulsa **Run**. Deben aparecer cinco filas.
Esta carga utiliza UUID nuevos, no modifica las políticas RLS y puede repetirse sin duplicar las
definiciones activas por nombre. Es una carga inicial para desarrollo; el catálogo institucional
definitivo sigue siendo responsabilidad del equipo.

## 3. Levantar el proyecto

En la terminal de VS Code, desde la raíz del repositorio:

```powershell
npm.cmd run dev
```

Si ya está ejecutándose desde antes del cambio, detenlo con `Ctrl+C` y vuelve a iniciarlo.
Abre `http://127.0.0.1:4321`, inicia sesión con un ADMIN o COORD autorizado y abre una Acción de pruebas.
Los valores `SUPABASE_URL` y `SUPABASE_ANON_KEY` del Backend y los `PUBLIC_SUPABASE_*` del Frontend
deben corresponder al mismo proyecto. `PUBLIC_API_BASE_URL` apunta al Gateway local, normalmente `http://127.0.0.1:4000`.

## 4. Recorrido manual

1. En **Indicadores y resultados**, revisa que el catálogo coincida con la consulta SQL.
2. Selecciona un indicador libre, escribe meta **20** y pulsa **Asociar indicadores**.
   Debe aparecer la confirmación y una tarjeta con meta 20 y resultado **Sin registrar**.
   Ese indicador debe quedar deshabilitado en la selección para esta Acción.
3. Pulsa **Registrar resultado**, escribe **0**, una fecha válida y una observación. Guarda.
   Debe indicar éxito y mostrar **0**, sin confundirlo con un resultado vacío.
4. Pulsa **Editar meta**, cambia a **30** y guarda. El resultado debe mantenerse en 0.
5. Pulsa **Actualizar resultado**, cambia a **25** y guarda. La meta debe mantenerse en 30.
6. Recarga la página: deben seguir apareciendo meta 30 y resultado 25.
7. Abre otra Acción: no debe mostrar la asociación de la anterior.
8. Intenta guardar valores vacíos o negativos: deben aparecer errores sin guardar.
9. Abre la misma Acción en dos pestañas. Cambia una meta en la primera y después intenta
   guardar desde la segunda sin recargar: debe aparecer un conflicto, conservar el valor escrito
   y solicitar **Actualizar indicadores** antes de reenviar.
10. Con un usuario de lectura, la consulta debe funcionar y las escrituras deben ser rechazadas.
    Un COORD solo puede escribir donde lo autoricen sus asignaciones y coberturas; su lectura global
    se mantiene conforme a las políticas existentes. Sin sesión, los endpoints devuelven 401.

En **F12 → Network → Fetch/XHR**, filtra por `indicators` o `results`. Deben verse solicitudes al puerto
del Gateway, con `Authorization: Bearer …`, y respuestas 200/201 al guardar. Puedes usar conexión lenta
para comprobar los estados de carga. No compartas el token en capturas ni en el PR.

Para comprobar persistencia, reemplaza el UUID por el de tu Acción:

```sql
SELECT i.id_indicador, i.id_accion, i.id_catalogo, i.nombre, i.meta,
       r.id_resultado, r.valor_medido, r.fecha_medicion, r.observaciones
FROM public.indicadores i
LEFT JOIN public.resultados r ON r.id_indicador = i.id_indicador AND r.archived_at IS NULL
WHERE i.id_accion = 'UUID-DE-LA-ACCION'::uuid AND i.archived_at IS NULL;
```

## 5. Prueba automática contra tu Supabase

Usa una Acción de referencia cuyo Plan puedas gestionar y un catálogo con al menos un indicador.
La prueba crea una Acción propia en ese mismo Plan, asocia un indicador, guarda y actualiza un resultado
y lee las tablas para confirmar persistencia. Al terminar archiva la asociación, su resultado y la Acción
creada por la prueba, conservando la auditoría. Funciona aunque la Acción de referencia ya tenga todos
los indicadores asociados; sus datos se conservan.

En `backend/.env.qa` (archivo local ignorado por Git) configura:

```dotenv
QA_ACCESS_TOKEN=TOKEN_DE_LA_SESION
QA_INDICADORES_ACTION_ID=UUID_DE_LA_ACCION_DE_PRUEBAS
```

Para obtener el token: inicia sesión, abre la Acción, F12 → Network, selecciona una petición
`/api/v1/actions/...` → Headers → Request Headers → Authorization. Copia solo lo que aparece después
de `Bearer ` al archivo local. No lo envíes por chat. Debe pertenecer a un usuario con permiso de escritura.
Se admite como alternativa el `QA_EVIDENCIAS_ACTION_ID` usado en SCRUM-115.

Desde la raíz:

```powershell
node scripts/probar-indicadores-supabase.mjs
```

El comando inicia sus servicios locales y un navegador de pruebas en el puerto 4336, y los cierra al finalizar.
No modifica el esquema. Debe informar **1 passed** y los ID de la asociación y la Acción QA archivadas.
Si falta una migración, el catálogo está vacío o la sesión expiró, informa el requisito pendiente.
Después de la prueba puedes vaciar `QA_ACCESS_TOKEN`.

## Pruebas locales sin credenciales remotas

```powershell
node --experimental-strip-types --test frontend/tests/clientes/indicadores.test.mjs frontend/tests/clientes/indicadores.integracion.test.mjs
npm.cmd run test:e2e:indicadores --workspace=frontend
npm.cmd run test:e2e:indicadores:integracion --workspace=frontend
```

Las pruebas de integración locales usan PostgreSQL embebido con las migraciones y RLS reales;
Auth y PostgREST se simulan mediante un adaptador. El comando remoto del paso 5 es el que verifica Supabase real.
