# Infraestructura de la arquitectura separada

Esta carpeta concentrará configuración de contenedores, scripts de despliegue y
observabilidad. Las migraciones existentes permanecen temporalmente en
`/supabase` para no romper el flujo local ni el historial durante la primera
etapa de la migración.

El traslado o partición de migraciones se realizará únicamente cuando cada
servicio tenga propiedad explícita de sus tablas y pruebas.
