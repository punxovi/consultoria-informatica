# Migración del contexto Planes, Acciones y Actas

El paso 5 crea `interventions-service`, un microservicio con módulos de dominio separados para Planes de Intervención, Acciones y Actas de Reunión. Pertenecen al mismo contexto porque cada Acta conserva su relación con una Organización y un Plan, y puede vincularse a una Acción.

El API Gateway publica tres espacios independientes:

- `/api/v1/plans`: listado, detalle, creación y actualización de planes.
- `/api/v1/actions`: listado, detalle, creación y actualización de acciones.
- `/api/v1/meeting-minutes`: listado, detalle, creación y actualización de actas.

El servicio corre en el puerto `4104`, propaga el token de la sesión a Supabase y conserva las políticas RLS, auditoría y control de versión existentes. Valida UUID, textos, fechas, estados, filtros, campos adicionales, el motivo obligatorio de una acción cancelada y las relaciones Organización–Plan–Acción de cada Acta.

Las pantallas actuales de Planes usan el Gateway sin cambiar su HTML ni sus estilos. Sus catálogos obtienen Organizaciones y Programas mediante los microservicios ya migrados. El cliente de Acciones queda preparado para la interfaz visual posterior; las Astro Actions antiguas fueron retiradas.

`npm run dev` inicia el servicio junto al resto de la plataforma. También puede ejecutarse de forma aislada con `npm run dev:interventions`.
