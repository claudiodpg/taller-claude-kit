---
description: Extrae el sistema de diseño de un sitio web (le pasas una URL) y produce tokens reutilizables + un brandbook en HTML. Úsalo cuando quieras basar tu diseño en una referencia real.
---

Extrae el sistema de diseño del sitio indicado: $ARGUMENTS

## Pasos

1. **Inspecciona el sitio.** Abre la URL con el navegador/DevTools disponible (o, si no puedes
   navegar, pídeme una captura o el HTML). Identifica y anota:
   - **Colores**: primario, acentos y neutros, con su hex.
   - **Tipografía**: familias de títulos y de cuerpo, y sus pesos.
   - **Espaciados y radios**: escala de espacios; radio de bordes y de botones.
   - **Estilo general**: minimal / corporativo / etc.
2. **Escribe los tokens** en `design/tokens.css` como CSS variables con nombre
   (`--color-primario`, `--color-acento`, `--font-titulo`, `--font-cuerpo`, `--radio-boton`, …).
3. **Genera `design/brandbook.html`**: un manual de diseño autocontenido (un solo archivo, sin
   dependencias externas) que muestre, listo para abrir en el navegador:
   - la **paleta** (swatches con su hex),
   - la **tipografía** (muestras de título y cuerpo),
   - los **botones** y otros componentes base,
   - la tabla de **tokens**.
4. **Resume** en 4 líneas el sistema extraído (tipografía · primario · acento · radios).

## Reglas
- No inventes: usa solo lo que se vea en el sitio; marca lo que no puedas determinar.
- El brandbook debe cumplir **contraste AA**.
- El resultado (`design/tokens.css` + `design/brandbook.html`) es el **entregable** de la actividad;
  esos tokens son los que luego le pasas a Claude para diseñar tus pantallas.
