# SCRUM-143 — Diseño de Organizaciones

Se tomó como base el diseño local de Planes de Intervención y el prototipo de Organizaciones.

- Listado con tarjetas en dos columnas, descripción y beneficiarios, bordes y tonos pastel. Se agregaron accesos para limpiar filtros y actualizar.
- Ficha con cabecera morada, título destacado, resumen con datos reales, pestañas y bloques de información más legibles.
- Formularios agrupados en identificación/contacto, ubicación/tipo y comunidad/alcance. Conservan sus campos y validaciones.
- Navegación de regreso en la barra superior de ficha, creación y edición.
- Estilos compartidos por las secciones internas y accesos desde Intervenciones y Seguimiento. Los enlaces a Planes abren el listado general; allí se selecciona la organización.
- Se corrigieron dos errores previos de Donaciones: selector de Cancelar y tipo TypeScript del selector de respaldo.

## Para revisar

Ejecutar `npm run dev`, entrar con ADMIN o COORD y abrir **Organizaciones**. Revisar listado, búsqueda, detalle, pestañas, accesos internos, creación y edición. Probar también en ancho móvil.

La revisión automática cubre 16 pruebas de navegador (Organizaciones, Expediente Legal y Compromisos), 9 pruebas de validaciones/cliente y compilación. Astro check termina con 0 errores y 0 advertencias; mantiene 26 sugerencias existentes. Las pruebas usan datos de prueba, sin modificar Supabase del equipo.

Para repetir la revisión visual: desde `frontend`, ejecutar `npx playwright test --config playwright.organizaciones-visual.config.mjs`. Las capturas quedan en `frontend/test-results`.

## Alcance

Se conservaron las conexiones HTTP y las ocho secciones actuales. No se copiaron cifras, alertas ni porcentajes ficticios del prototipo. El filtro por programa del listado sigue pendiente de conexión, tal como estaba antes; esta tarea cambia la presentación y no implementa esa relación.

La rama `codex/SCRUM-143-refactor-organizaciones` parte de los archivos que ya incluían el refactor de Planes y se comparte para revisión visual, sin PR. La barra superior y el gris de las descripciones usan el mismo diseño que Planes.
