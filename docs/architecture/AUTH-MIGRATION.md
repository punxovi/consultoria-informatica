# Migración del dominio de autenticación

## Estado

El dominio Auth se ejecuta como servicio independiente detrás del API Gateway.
Las pantallas y estilos no fueron modificados; solo cambió el transporte.

## Endpoints

| Método | Ruta pública | Resultado |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Autentica correo y contraseña. |
| `POST` | `/api/v1/auth/password/recovery` | Solicita un enlace sin revelar si la cuenta existe. |
| `POST` | `/api/v1/auth/password/change` | Cambia la contraseña con Bearer de recuperación. |
| `GET` | `/api/v1/auth/session` | Verifica la sesión contra Supabase Auth. |
| `POST` | `/api/v1/auth/session/refresh` | Renueva una sesión expirada. |
| `POST` | `/api/v1/auth/logout` | Invalida la sesión actual. |

## Persistencia de la sesión

El servicio realiza las operaciones remotas de Supabase Auth. Después de un
login o una renovación, el Frontend almacena la sesión con Supabase JS. Esto es
necesario mientras Organizaciones, Programas, Planes y Acciones utilizan el
Bearer del navegador para aplicar RLS.

Las Astro Actions de Auth siguen presentes temporalmente como código heredado,
pero las tres pantallas de autenticación, el layout protegido y el Sidebar ya
consumen el nuevo cliente HTTP.

## Ejecución local

1. Copiar `backend/.env.example` como `backend/.env` y completar los valores.
2. Verificar `PUBLIC_API_BASE_URL=http://127.0.0.1:4000` en `frontend/.env`.
3. Desde la raíz ejecutar `npm run dev`.
4. Abrir `http://127.0.0.1:4321/login`.

El archivo `backend/.env` está excluido de Git.

## Seguridad

- La clave `service_role` no se utiliza ni se expone.
- Correo y contraseña se validan antes de contactar Supabase.
- Los errores internos de Supabase no regresan al navegador.
- Recuperación entrega la misma respuesta exista o no la cuenta.
- Cambio, consulta y cierre requieren `Authorization: Bearer`.
- Cada respuesta incluye un `request ID` para trazabilidad.
