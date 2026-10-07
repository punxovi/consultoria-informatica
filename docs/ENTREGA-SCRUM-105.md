# SCRUM-105 — Compromisos

## Qué se hizo

Agregué **Compromisos** dentro de la ficha de Organización: listado, detalle, registro y edición. Incluye acuerdo, responsable, contacto, fecha límite, observaciones y estado. Los nuevos quedan **Pendientes**; al editar se pueden marcar **Cumplidos**. Si vence la fecha, se muestra **Vencido** sin cambiar el estado interno.

También se pueden agregar varios compromisos antes de guardar un acta. En la demostración quedan asociados, aparecen en su detalle y se pueden gestionar desde Compromisos. El detalle del compromiso enlaza al acta de origen y, si el servicio entrega sus identificadores, a la acción.

## Cómo probar

1. Con los `.env` del frontend y backend configurados, ejecutar `npm install` y `npm run dev` desde la raíz.
2. Iniciar sesión, abrir una organización y entrar en **Actas de Reunión**. Registrar un acta, completar sus datos y usar **Agregar compromiso al acta** una o varias veces. Guardar.
3. Entrar en **Compromisos → Probar demostración**. Consultar los acuerdos, editar, cambiar el estado y probar cancelar. También se pueden registrar más compromisos seleccionando un acta existente.

**La demo es solo para desarrollo: no guarda datos ni archivos en el servidor y se pierde al recargar.** No hay que modificar la URL. El botón **Volver al servicio real** recarga la página. El modo normal usa HTTP y muestra error mientras no exista el servicio; no confirma guardados ficticios.

## Pendiente del backend

Implementar el [contrato HTTP propuesto](CONTRATO-COMPROMISOS.md), con permisos, persistencia y auditoría de cambios de estado. El cliente está en `frontend/src/lib/compromisos/cliente.ts`. La integración con Actas utiliza su demostración existente; el guardado real del acta y sus compromisos debe implementarse como una sola operación.

Verificado: 50 pruebas del frontend, 5 pruebas de navegador y compilación. Las pruebas HTTP usan respuestas simuladas, no Supabase real. El chequeo de tipos mantiene dos errores previos ajenos a esta tarea: Diagnóstico y una importación antigua de Acciones.
