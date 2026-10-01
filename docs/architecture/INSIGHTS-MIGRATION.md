# Migración de Dashboard y Reportes

El paso 6 crea `insights-service` para las consultas consolidadas del Dashboard y los futuros Reportes. El servicio corre en el puerto `4105` y se publica mediante `/api/v1/dashboard` y `/api/v1/reports`.

El Dashboard dejó de depender de valores fijos: consulta organizaciones, beneficiarios, planes activos y acciones visibles para la sesión. Calcula alertas, progreso y la actividad de los últimos nueve meses, con filtro opcional por país. Las políticas RLS de Supabase continúan delimitando qué registros puede agregar cada usuario.

Reportes conserva su pantalla actual porque el producto todavía no define formatos, descargas ni filtros. Queda disponible `/api/v1/reports/overview` y un cliente frontend para consumir un resumen consolidado cuando se implemente esa interfaz.

## Definiciones usadas

- Plan activo: su fecha de inicio es anterior o igual a hoy y su fecha de término es posterior o igual a hoy.
- Alerta activa: Acción en estado `atrasada` o `cancelada`.
- Avance: porcentaje de Acciones `cumplida` sobre las Acciones activas visibles.
- Serie mensual: Acciones completadas y pendientes agrupadas por mes de término durante los últimos nueve meses.

`npm run dev` inicia el servicio con el resto de la plataforma. También puede iniciarse con `npm run dev:insights`.
