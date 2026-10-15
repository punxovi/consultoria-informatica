# SCRUM-112 — Indicadores y resultados

Se agregó la sección **Indicadores y resultados** al detalle de una Acción. Permite seleccionar varios indicadores del catálogo, asignar sus metas y registrar o actualizar resultados con fecha y observaciones. Meta y resultado se muestran por separado; un resultado de cero se distingue de uno todavía sin registrar.

Incluye validaciones junto a los campos, estados vacíos, carga, errores, confirmaciones y diseño adaptable a celular.

## Cómo probar

1. Ejecutar `npm run dev` desde la raíz e iniciar sesión.
2. Entrar a **Planes → detalle de un plan → detalle de una acción**.
3. En **Indicadores y resultados**, pulsar **Probar demostración de indicadores**.
4. Seleccionar indicadores, ingresar metas y asociarlos. Probar registrar un resultado, editar la meta y actualizar el resultado.

La demo solo aparece en desarrollo, usa datos temporales y se reinicia al recargar. No escribe en el servidor. El modo real se intenta por defecto y muestra un error si el servicio aún no está disponible.

## Qué falta del backend

Implementar el catálogo y las rutas HTTP con persistencia, permisos y control de versiones. El cliente ya está separado de la interfaz; el contrato propuesto está en [CONTRATO-INDICADORES.md](CONTRATO-INDICADORES.md). Tener los schemas o la tabla de indicadores no equivale a tener estas rutas implementadas.

Para conectar, implementar o ajustar ese contrato y probar en modo real. La demo no necesita quitarse para conectar: solo se activa mediante su botón y no está disponible en producción.

## Verificación

- 81 pruebas del frontend y 7 pruebas de navegador aprobadas.
- Compilación correcta; revisión visual en escritorio y móvil.
- Comprobación Astro: sin errores ni advertencias (14 sugerencias existentes).

La rama parte del trabajo de Evidencias del PR #60. El PR de esta tarea se abre sobre esa rama para mostrar solo Indicadores; después de integrar #60, cambiar su base a `sprint-6` antes de integrarlo.
