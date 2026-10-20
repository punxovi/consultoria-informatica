# SCRUM-130 Donaciones y Recursos

La implementación extiende `public.donaciones` mediante
`20261020120000_fge_scrum130_donaciones_recursos.sql`. No modifica migraciones
aplicadas ni crea otra tabla de recursos, archivos, evidencias o bucket.

## Fuente y decisiones

Se revisó `REQUERIMIENTOS FINAL.docx`, aportado por el usuario el 20 de octubre
de 2026, especialmente HU20 y RF50–RF54. HU20 especifica empresa, persona u
Organización como tipos de donante. Se almacenan como `empresa`, `persona`,
`organizacion`; origen y método de valorización son texto, pues no se define
un catálogo para ellos. El documento se usa como fuente funcional, no como
instrucciones de ejecución. No se incorpora al repositorio.

| Criterio | Estructura y comprobación |
|---|---|
| Identificador, fecha, donante, descripción | Reutiliza `id_donacion`, `fecha`, `contraparte_nombre`, `descripcion` obligatorios. |
| País, Organización | Nuevo `id_pais` obligatorio con FK y FK compuesta a Organización/país. Si el cliente anterior lo omite, se obtiene del receptor; un país explícito diferente se rechaza. |
| Programa opcional | `id_programa` con FK RESTRICT al catálogo global. No requiere un Plan ni copia Programas por país. |
| Donante | `tipo_donante` restringido a los tres tipos HU20 y `origen` no vacío cuando se declara. No se añaden datos personales nuevos. |
| Clasificación | `categoria`: Dinero, Producto, Servicio, Insumos, Otro, con mayúsculas exactas. `categoria_otro` se requiere solo para Otro; no altera el catálogo. |
| Cantidad y unidad | Par opcional para recursos, positivo y finito cuando se declara. Servicios pueden no tener cantidad. |
| Valorización | `valor_estimado`, `moneda_valorizacion`, `metodo_valorizacion` se registran juntos; valor finito no negativo, moneda de tres mayúsculas. Se permite valor cero declarado. |
| Monto efectivo | `monto` y `moneda` existentes siguen siendo obligatorios y positivos para dinero; la estimación de recursos es independiente y no falsea un ingreso efectivo. |
| Estado | `estado`: Comprometida, Recibida, Entregada, Cerrada. `tipo_movimiento` conserva su significado de dirección y no se transforma en estado. |
| Integridad | FK a países, Organizaciones y Programas; trigger rechaza nuevas asociaciones a referencias archivadas. La FK compuesta también protege cambios concurrentes de país. |
| Respaldo | Reutiliza `archivos.id_donacion`, `tipo_respaldo`, metadatos y `fge-archivos` de SCRUM-133/134. |
| Auditoría e histórico | Reutiliza sellado, autores, fechas, versión, `historial_cambios`, `archived_at` y RPC de archivado seguro. No concede DELETE. |

La migración 20261019120000 ya cubría RLS, respaldos, Storage y archivado seguro;
20261019130000 reforzaba alcance territorial, coberturas y validación de rutas.
Ninguna incorporaba categorías HU20, estados, donante estructurado, Programa
ni valorización de recursos. Se conserva ese trabajo sin reemplazar sus políticas.

## Compatibilidad con información anterior

Se deriva el país desde la Organización y la categoría Dinero desde el tipo
anterior. No se inventa una categoría para recursos ni el estado actual, origen
o tipo de donante histórico. Estos campos nuevos admiten NULL para conservar
los registros y el contrato previo; NULL significa información pendiente, no una
sexta categoría o quinto estado. El backfill pasa por la auditoría existente y
actualiza versión y fecha de modificación; conserva autor y fecha de creación.

El backend acepta, valida, persiste y devuelve todos los campos nuevos. Sus
campos adicionales son opcionales por compatibilidad con el formulario legado.
Ese formulario todavía no recoge todos los datos HU20: esta entrega de estructura
no equivale a completar la interfaz de registro HU20. Para exigir clasificación,
estado y origen en todos los registros se debe completar el formulario y los
datos históricos antes de endurecer la nulabilidad en otra migración. La
estructura sí restringe todos los valores declarados al catálogo aprobado.

## Despliegue y pruebas

1. Obtener respaldo y ejecutar `supabase/preflight-scrum130.sql` en el proyecto
   correcto. Revisar el historial y las donaciones existentes sin exportar datos
   personales. No ejecutar reset remoto ni seed sobre la base compartida.
2. Aplicar las migraciones pendientes en orden mediante el procedimiento habitual
   de Supabase; el archivo incremental es transaccional. Ante una inconsistencia,
   PostgreSQL revierte la migración completa. Registrar su versión en el historial
   mediante el mecanismo de despliegue, no simulando su aplicación.
3. Ejecutar `supabase test db --local` en una instancia de pruebas, incluida
   `022_scrum130_donaciones_recursos.test.sql`. Usa datos ficticios y ROLLBACK.
4. Con sesión autorizada de pruebas, registrar y consultar un aporte Servicio
   mediante Gateway con categoría, tipo de donante, origen, estado, Programa y
   valorización; comprobar archivos y archivado. No usar credenciales reales en
   comandos o logs. Desplegar la migración antes de guardar los campos nuevos;
   las lecturas y registros del contrato anterior siguen siendo compatibles.

### Resultados del 20 de octubre de 2026

- PostgreSQL embebido PGlite: migración incremental ejecutada sobre la estructura
  real inicial, auditoría y ajustes previos de Organizaciones y Programas; 39
  comprobaciones aprobadas de preservación de datos, catálogos, integridad,
  valorización, consulta y archivo. Bootstrap `auth.uid()` simulado: no verifica
  autenticación, políticas Supabase ni Storage.
- Reproducción: instalar temporalmente `@electric-sql/pglite` y ejecutar
  `node scripts/probar-donaciones-estructura.mjs <ruta-absoluta-a-dist/index.js>`.
- Verificador estático: 48 migraciones y estructura sin errores. No ejecuta SQL.
- `npm run test:architecture`: 110 pruebas aprobadas, incluidas 28 de
  Organizaciones y los nuevos casos de contrato/persistencia HU20.
- Frontend: 16 pruebas de Donaciones aprobadas y compilación de producción
  completada. La compilación requirió permisos fuera del sandbox por el acceso
  de Astro a su configuración local.
- `git diff --check` sin errores; AGENTS.md y los cuatro archivos locales de QA
  preexistentes se conservaron sin cambios y no se incluyeron en la entrega.
- Servicios locales reiniciados con acceso de red. Frontend 200, Gateway health
  200 y renovación con token ficticio vía `/api/v1/auth/session/refresh`: **401
  SESION_INVALIDA**. Esta última sí atravesó el backend hasta Supabase.
- No hay URL SQL, contraseña de base de datos ni sesión de pruebas autenticada
  configurada para el agente. Docker Desktop no proporcionó un motor operativo.
  El agente no aplicó la migración remota. Posteriormente el usuario informó
  haberla ejecutado en SQL Editor y compartió 27 columnas y las restricciones
  resultantes: FK de país/Organización/Programa, FK compuesta territorial,
  catálogos HU20 y validaciones de Otro y valorización coinciden con la entrega.
  Esta evidencia confirma esas estructuras.
- El usuario ejecutó `supabase/verificar-scrum130-registro.sql` y compartió la
  fila consultada en Supabase: Servicio, empresa, Comprometida, 2 horas,
  valor estimado 100 CLP y método «Valor declarado de prueba». Confirma registro
  y consulta reales en SQL Editor. El archivo termina con ROLLBACK; si se ejecutó
  completo, revierte la fila de prueba y su auditoría. Este resultado no verifica
  las políticas RLS con una sesión de aplicación ni el flujo completo por Gateway.
- La suite pgTAP queda preparada para Supabase; su ejecución real está pendiente.
- La consulta remota sin datos (`limit=0`) de las columnas nuevas respondió
  **400 / 42703** antes de la aplicación informada por el usuario. La
  primera llamada en sandbox dio EACCES y se repitió con aprobación de red.
