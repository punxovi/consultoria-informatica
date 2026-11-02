# Probar KAN-166

1. Configura `backend/.env` y `frontend/.env` desde sus ejemplos.
2. Desde la raíz ejecuta `npm.cmd ci` y `npm.cmd run dev`.
3. Abre `http://127.0.0.1:4321/login` e inicia sesión con una cuenta ADMIN.
4. En Programas, crea un registro con dos líneas y resultados diferentes.
5. Recarga el detalle para confirmar la persistencia.
6. Edita un texto y un resultado, guarda y vuelve a recargar.
7. Archiva el programa y confirma que desaparece del catálogo activo.
8. Con COORD comprueba que crear, editar y archivar no estén disponibles.

## Pruebas de código

```powershell
npm.cmd run test --workspace=frontend
npm.cmd run test --workspace=@fge/programs-service
npm.cmd run build:frontend
```

Las operaciones viajan por `/api/v1/programs`; los endpoints `/_actions` ya no
forman parte de la aplicación.
