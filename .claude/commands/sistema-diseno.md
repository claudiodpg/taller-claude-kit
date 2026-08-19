---
description: Extrae el sistema de diseño de un sitio web (le pasas una URL) y produce tokens reutilizables + un brandbook en HTML. Úsalo cuando quieras basar tu diseño en una referencia real.
---

Extrae el sistema de diseño del sitio: $ARGUMENTS

Tú haces **solo la parte que requiere criterio** (mirar el sitio y decidir los tokens). Todo lo
mecánico —calcular contraste, escribir el CSS, generar el brandbook HTML— lo hace un **script
determinista**, para gastar pocos tokens y entregar en segundos, no en minutos.

## Pasos

1. **Inspecciona el sitio.** Ábrelo con el navegador/DevTools (o, si no puedes navegar, pídeme una
   captura o el HTML). Identifica: familias tipográficas (título/cuerpo), colores con su **hex**
   (primario, oscuros, acento, neutros, texto, texto-muted, fondo), y radios (botón, card).

2. **Escribe SOLO `design/tokens.json`** con este esquema exacto (no calcules contraste ni escribas
   HTML a mano — de eso se encarga el script):
   ```json
   {
     "site": "https://ejemplo.com",
     "fonts": { "titulo": "Raleway", "cuerpo": "Raleway" },
     "colors": {
       "primario": "#14A797", "primario-oscuro": "#118C7F", "acento": "#E85829",
       "texto": "#111111", "texto-muted": "#555555", "fondo": "#FFFFFF"
     },
     "radii": { "boton": "40px", "card": "8px" }
   }
   ```
   Usa solo lo que veas en el sitio; omite lo que no puedas determinar. No inventes.

3. **Corre el script determinista** (escribe tokens.css + brandbook.html y mide contraste AA):
   ```bash
   node .claude/scripts/sistema-diseno.mjs design/tokens.json
   ```

4. **Cierra reportando** las rutas exactas que imprimió el script (`design/tokens.css` y
   `design/brandbook.html`) y cómo abrirlo: `open design/brandbook.html`. Menciona en una línea
   tipografía · primario · acento · si algún color falla AA.

## Reglas de entrega (importante)
- **Completa TODO en una sola pasada. No te detengas a preguntar "¿lo termino?"**: el entregable son
  los DOS archivos, y el script los escribe siempre. No pares tras `tokens.json`.
- **Cierra SIEMPRE diciendo dónde quedaron los archivos** y cómo abrir el brandbook. No esperes a que
  el usuario pregunte por los entregables.
- No calcules contraste ni redactes el HTML tú mismo: eso lo hace el script (determinista, sin tokens).
- Si `node` no está disponible, dilo y ofrece el equivalente; no reimplementes el script a mano.
