# Recursos del PDF institucional

- `logo-fge.png`: copia exacta de `frontend/public/Logo-FGE-SIN-FONDO.png`, recurso
  institucional ya disponible en el repositorio. El generador recorta su margen
  transparente al componer el PDF, sin cambiar los píxeles ni el logotipo.
- Los colores provienen de `frontend/src/styles/global.css`: violeta `#4c4688`,
  verde `#199d6b` y la escala neutra existente.
- `LiberationSans-Regular.ttf` y `LiberationSans-Bold.ttf`: fuentes originales,
  sin modificar, distribuidas en los recursos `standard_fonts` de PDF.js del
  runtime de herramientas utilizado para esta entrega. Se redistribuyen bajo
  SIL Open Font License 1.1, incluida íntegramente en `LICENSE_LIBERATION`.
  Son tipografías sans serif con soporte para español; no se atribuye a FGE una
  tipografía corporativa específica que el repositorio no define.

Los recursos son locales para que el servicio pueda desplegarse sin depender
de `frontend/public`, de una CDN, de fuentes del sistema o de una conexión de red.
