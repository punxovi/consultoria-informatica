# Correos de solicitudes de cotización

Al confirmar una solicitud, una migración crea notificaciones para la persona
solicitante y para el Coordinador activo asignado al país. La cola se inserta en
la misma transacción que la solicitud. El Backend envía el mensaje al iniciar y
cada 15 segundos; los errores reintentan con espera creciente hasta ocho veces.
El fallo del proveedor no revierte ni vuelve a crear solicitudes.

El correo de Coordinación incluye referencia, contacto, teléfono, mensaje,
país, productos, cantidades, unidades y organizaciones. La confirmación informa
que la solicitud fue recibida y enumera sus productos.

## Configuración requerida

El flujo que ya existía en el proyecto usa SMTP de Supabase Auth para enlaces de
acceso. Ese mecanismo no permite enviar mensajes arbitrarios de cotización. El
Backend usa Resend para estos correos; se requiere:

1. Aplicar `supabase/migrations/20261107120000_fge_notificaciones_email_cotizacion.sql`.
2. Crear una API key en Resend y verificar el dominio o remitente que se usará.
3. En el `.env` que lee el Backend, configurar `RESEND_API_KEY`, `EMAIL_FROM`
   (por ejemplo `Fundación Gestionar Esperanzas <cotizaciones@tudominio.cl>`) y
   `SUPABASE_SERVICE_ROLE_KEY`. No publicar esa clave ni incluirla en el Frontend.
4. Confirmar que cada país tenga un Coordinador activo asignado. Si el registro
   no tiene responsable, se envía la confirmación al solicitante y no se genera
   un correo de Coordinación.

Si faltan credenciales, la solicitud se registra normalmente y el Backend
mantiene las notificaciones pendientes; no se envían hasta completar la
configuración y reiniciar el Backend. El sistema conserva el estado y el error
de los intentos para diagnóstico en `public.notificaciones_email_cotizacion`;
no consultar esa tabla con una clave pública.
