---
description: Extrae el sistema de diseño de un sitio web (le pasas una URL) y produce tokens reutilizables + un brandbook en HTML. Úsalo cuando quieras basar tu diseño en una referencia real.
---

Extrae el sistema de diseño del sitio: $ARGUMENTS

Tú haces **solo la parte que requiere criterio** (mirar el sitio a fondo y decidir los tokens). Todo lo
mecánico —calcular contraste, escribir el CSS, generar el brandbook HTML, versionar— lo hace un
**script determinista**, para gastar pocos tokens y entregar en segundos, no en minutos.

## Pasos

0. **Sella el inicio (primer paso, antes de tokens.json).** Para poder reportar la **duración total de
   la tarea** en la conversación, escribe un sello de tiempo:
   ```bash
   node -e "const f='design/.sd-start';require('fs').mkdirSync('design',{recursive:true});require('fs').writeFileSync(f,String(Date.now()))"
   ```
   El script leerá ese sello al final, imprimirá la duración total y lo borrará. (Si no existe, el
   script reporta solo su propio tiempo como respaldo.)

1. **Inspecciona el sitio a fondo.** Ábrelo con el navegador/DevTools (o, si no puedes navegar, pídeme
   una captura o el HTML). No te quedes en lo superficial: la calidad del brandbook depende de lo que
   extraigas aquí. Identifica todo lo que puedas:
   - **Tipografía:** familias (título/cuerpo), y sus **pesos** reales (400/500/700/900…).
   - **Color:** los colores clave con su **hex** (primario, oscuros, acento, neutros, texto,
     texto-muted, fondo) y, si el sitio tiene una **escala** por familia (50…900), captúrala.
   - **Pares de contraste REALES (crítico):** las combinaciones **texto sobre fondo** que el sitio de
     verdad usa — texto del botón primario sobre su fondo, texto del menú sobre su barra, un color de
     marca usado **como texto** sobre el fondo, etc. Anota `fg` (texto) y `bg` (fondo) de cada una.
     Sin esto el contraste medido es una ilusión: **no hay aprobado sin evidencia**.
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
     "pairs": [
       { "fg": "#FFFFFF", "bg": "#E85829", "uso": "texto del botón primario", "large": false },
       { "fg": "#14A797", "bg": "#FBDB89", "uso": "texto del menú" },
       { "fg": "#14A797", "bg": "#FFFFFF", "uso": "primario como texto sobre fondo" }
     ],
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
     "propuesto": ["lh-h1", "lh-cuerpo"],
     "radii": { "boton": "40px", "card": "12px" },
     "radiiScale": { "sm":"4px","md":"8px","lg":"16px","full":"9999px" },
     "spacing": { "1":"4px","2":"8px","3":"12px","4":"16px","6":"24px","8":"32px" },
     "shadows": { "sm":"0 1px 2px rgba(0,0,0,.08)","md":"0 4px 12px rgba(0,0,0,.12)" },
     "gradients": { "hero":"linear-gradient(135deg,#14A797,#E85829)" },
     "logo": { "nota":"Logotipo horizontal, monocromo sobre oscuros.", "url":"https://ejemplo.com/logo.svg" }
   }
   ```
   - **`pairs` (contraste real) — captúralo siempre que puedas.** Cada objeto es una combinación real
     `fg` (texto) sobre `bg` (fondo) que el sitio usa, con un `uso` que la describe y `large:true` si es
     texto grande (≥24px, o ≥18.66px en negrita: umbral AA 3:1 en vez de 4.5:1). El script mide **cada
     par** y el titular de contraste (consola + brandbook) es **"Pares que fallan AA: N"**, no el
     engañoso "0 fallan" del mejor-texto-posible. Las muestras de botón usan el color de texto **real**
     del par. Si omites `pairs`, el brandbook avisa que el AA mostrado **no es el uso real**.
   - **`propuesto` (propuesto vs observado) — opcional.** Lista de nombres de token en estilo css-var
     **sin** el `--` (p. ej. `"lh-cuerpo"`, `"espacio-6"`, `"color-acento"`, `"sombra-md"`) que **no
     observaste** en el sitio y estás **proponiendo** tú (típico: los `lineHeight`). El brandbook los
     marca con una insignia **"propuesto"** y en la tabla de tokens los distingue de los **observados**.
     Marca como propuesto lo que sugieras; deja fuera lo que sí viste en el sitio.
   - **Compatibilidad:** un `tokens.json` mínimo (solo `site` + `fonts` + `colors` + `radii`) sigue
     funcionando; el brandbook solo muestra las secciones para las que haya datos.
   - **Tipografías:** el script **descarga y embebe** las fuentes de Google Fonts en **base64**
     (`@font-face`) para que el brandbook sea **autocontenido** (se abre sin conexión). Si no hay red,
     cae a `@import` y lo avisa. Si una fuente NO es de Google, pon `"tituloUrl"`/`"cuerpoUrl"` con su
     enlace (o `"google": false`) y el script lo documentará en vez de embeberla.

3. **Corre el script determinista** (mide contraste AA de los pares reales, embebe fuentes, escribe
   tokens.css + brandbook.html y **versiona** automáticamente — nunca sobrescribe):
   ```bash
   node .claude/scripts/sistema-diseno.mjs design/tokens.json
   ```
   La salida va a `design/<slug>/vN/` (v1, v2, v3…, según lo ya existente) más una copia **latest** en
   `design/<slug>/brandbook.html` y `design/<slug>/tokens.css`. Re-correrlo sobre el mismo sitio crea
   una versión nueva sin borrar las anteriores.

4. **Cierra reportando** las rutas exactas que imprimió el script: la **versión nueva**
   (`design/<slug>/vN/brandbook.html`) y la **latest** (`design/<slug>/brandbook.html`), más cómo
   abrirla: `open design/<slug>/brandbook.html`. Menciona en una línea: número de versión ·
   tipografía · primario · acento · **pares que fallan AA** (N, con su ratio). Reporta también en la
   conversación la **duración total** que imprimió el script (`⏱ Duración total: …`). Esa duración va
   **en el chat, nunca dentro del brandbook**.

## Reglas de entrega (importante)
- **Completa TODO en una sola pasada. No te detengas a preguntar "¿lo termino?"**: el entregable son
  los archivos versionados, y el script los escribe siempre. No pares tras `tokens.json`.
- **No empobrezcas el sistema.** La verdadera calidad se gana en el paso 1–2: extrae escalas, pesos,
  espaciado, sombras, gradientes y **los pares de contraste reales** cuando existan. Un brandbook rico
  nace de un `tokens.json` rico.
- **Contraste con evidencia real.** Captura `pairs` (texto/fondo que el sitio usa). El titular es
  "Pares que fallan AA: N", no el "0 fallan" del mejor-texto-posible. No hay aprobado sin evidencia.
- **Marca propuesto vs observado** (`propuesto`) para lo que sugieras tú y no viste en el sitio.
- **Cierra SIEMPRE diciendo dónde quedaron los archivos** (versión nueva + latest) y cómo abrir el
  brandbook. No esperes a que el usuario pregunte por los entregables.
- No calcules contraste ni redactes el HTML tú mismo: eso lo hace el script (determinista, sin tokens).
- Si `node` no está disponible, dilo y ofrece el equivalente; no reimplementes el script a mano.
