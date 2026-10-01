# Migración del contexto Planes y Acciones

El paso 5 crea `interventions-service`, un microservicio con dos módulos de dominio separados: Planes de Intervención y Acciones. Ambos pertenecen al mismo contexto porque toda Acción debe validar y conservar su relación con un Plan.

El API Gateway publica dos espacios independientes:

- `/api/v1/plans`: listado, detalle, creación y actualización de planes.
- `/api/v1/actions`: listado, detalle, creación y actualización de acciones.

El servicio corre en el puerto `4104`, propaga el token de la sesión a Supabase y conserva las políticas RLS, auditoría y control de versión existentes. Valida UUID, textos, fechas, estados, filtros, campos adicionales y el motivo obligatorio de una acción cancelada.

Las pantallas actuales de Planes usan el Gateway sin cambiar su HTML ni sus estilos. Sus catálogos obtienen Organizaciones y Programas mediante los microservicios ya migrados. El cliente de Acciones queda preparado para la interfaz visual posterior; las Astro Actions antiguas permanecen temporalmente como respaldo de transición.

`npm run dev` inicia el servicio junto al resto de la plataforma. También puede ejecutarse de forma aislada con `npm run dev:interventions`.
