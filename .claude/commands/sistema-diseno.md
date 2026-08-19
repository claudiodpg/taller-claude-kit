---
description: Extrae el sistema de diseño de un sitio web (le pasas una URL) y produce tokens reutilizables + un brandbook en HTML. Úsalo cuando quieras basar tu diseño en una referencia real.
---

Extrae el sistema de diseño del sitio: $ARGUMENTS

Tú haces **solo la parte que requiere criterio** (mirar el sitio a fondo y decidir los tokens). Todo lo
mecánico —calcular contraste, escribir el CSS, generar el brandbook HTML, versionar— lo hace un
**script determinista**, para gastar pocos tokens y entregar en segundos, no en minutos.

## Pasos

1. **Inspecciona el sitio a fondo.** Ábrelo con el navegador/DevTools (o, si no puedes navegar, pídeme
   una captura o el HTML). No te quedes en lo superficial: la calidad del brandbook depende de lo que
   extraigas aquí. Identifica todo lo que puedas:
   - **Tipografía:** familias (título/cuerpo), y sus **pesos** reales (400/500/700/900…).
   - **Color:** los colores clave con su **hex** (primario, oscuros, acento, neutros, texto,
     texto-muted, fondo) y, si el sitio tiene una **escala** por familia (50…900), captúrala.
   - **Escala tipográfica:** tamaños de h1, h2, h3, cuerpo, small, caption (con line-height y peso).
   - **Radios** (botón, card) y su **escala** (sm/md/lg/full).
   - **Espaciado** (la retícula: 4/8/12/16/24/32…), **sombras**, **gradientes**, y una **nota del logo**.

2. **Escribe SOLO `design/tokens.json`.** Captura toda la riqueza que hayas encontrado — **no
   empobrezcas** el sistema. TODOS los campos salvo `site` son **opcionales**: incluye lo que veas,
   omite lo que no puedas determinar (el script degrada con elegancia). No inventes valores. No
   calcules contraste ni escribas HTML a mano — de eso se encarga el script.

   Esquema completo (usa los bloques que apliquen):
   ```json
   {
     "site": "https://ejemplo.com",
     "name": "Ejemplo",
     "slug": "ejemplo",
     "fonts": { "titulo": "Raleway", "cuerpo": "Inter" },
     "fontWeights": { "titulo": [400, 700, 900], "cuerpo": [400, 500, 600] },
     "colors": {
       "primario": "#14A797", "primario-oscuro": "#118C7F", "acento": "#E85829",
       "texto": "#111111", "texto-muted": "#555555", "fondo": "#FFFFFF"
     },
     "colorScales": {
       "primario": { "50":"#E7F6F4","100":"#C4E9E4","500":"#14A797","900":"#063A34" },
       "neutro":   { "50":"#F7F7F8","500":"#5F5F68","900":"#111114" }
     },
     "typeScale": {
       "h1": { "size":"40px","lineHeight":"1.1","weight":700 },
       "h2": { "size":"30px","lineHeight":"1.2","weight":700 },
       "cuerpo": { "size":"16px","lineHeight":"1.5","weight":400 },
       "caption": { "size":"11px","lineHeight":"1.4","weight":500 }
     },
     "radii": { "boton": "40px", "card": "12px" },
     "radiiScale": { "sm":"4px","md":"8px","lg":"16px","full":"9999px" },
     "spacing": { "1":"4px","2":"8px","3":"12px","4":"16px","6":"24px","8":"32px" },
     "shadows": { "sm":"0 1px 2px rgba(0,0,0,.08)","md":"0 4px 12px rgba(0,0,0,.12)" },
     "gradients": { "hero":"linear-gradient(135deg,#14A797,#E85829)" },
     "logo": { "nota":"Logotipo horizontal, monocromo sobre oscuros.", "url":"https://ejemplo.com/logo.svg" }
   }
   ```
   - **Compatibilidad:** un `tokens.json` mínimo (solo `site` + `fonts` + `colors` + `radii`) sigue
     funcionando; el brandbook solo muestra las secciones para las que haya datos.
   - **Tipografías:** el script las **embebe** vía Google Fonts (`@import`) usando `fontWeights`. Si una
     fuente NO es de Google, pon `"tituloUrl"`/`"cuerpoUrl"` con su enlace (o `"google": false`) y el
     script lo documentará en vez de embeberla.

3. **Corre el script determinista** (mide contraste AA, escribe tokens.css + brandbook.html y
   **versiona** automáticamente — nunca sobrescribe):
   ```bash
   node .claude/scripts/sistema-diseno.mjs design/tokens.json
   ```
   La salida va a `design/<slug>/vN/` (v1, v2, v3…, según lo ya existente) más una copia **latest** en
   `design/<slug>/brandbook.html` y `design/<slug>/tokens.css`. Re-correrlo sobre el mismo sitio crea
   una versión nueva sin borrar las anteriores.

4. **Cierra reportando** las rutas exactas que imprimió el script: la **versión nueva**
   (`design/<slug>/vN/brandbook.html`) y la **latest** (`design/<slug>/brandbook.html`), más cómo
   abrirla: `open design/<slug>/brandbook.html`. Menciona en una línea: número de versión ·
   tipografía · primario · acento · si algún color falla AA.

## Reglas de entrega (importante)
- **Completa TODO en una sola pasada. No te detengas a preguntar "¿lo termino?"**: el entregable son
  los archivos versionados, y el script los escribe siempre. No pares tras `tokens.json`.
- **No empobrezcas el sistema.** La verdadera calidad se gana en el paso 1–2: extrae escalas, pesos,
  espaciado, sombras y gradientes cuando existan. Un brandbook rico nace de un `tokens.json` rico.
- **Cierra SIEMPRE diciendo dónde quedaron los archivos** (versión nueva + latest) y cómo abrir el
  brandbook. No esperes a que el usuario pregunte por los entregables.
- No calcules contraste ni redactes el HTML tú mismo: eso lo hace el script (determinista, sin tokens).
- Si `node` no está disponible, dilo y ofrece el equivalente; no reimplementes el script a mano.
