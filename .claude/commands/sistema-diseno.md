---
description: Extrae el sistema de diseño de un sitio web (le pasas una URL) y produce tokens reutilizables + un brandbook en HTML. Úsalo cuando quieras basar tu diseño en una referencia real.
---

Extrae el sistema de diseño del sitio: $ARGUMENTS

Tú haces **solo la parte que requiere criterio** (mirar el sitio a fondo y decidir los tokens). Todo lo
mecánico —calcular contraste, derivar alternativas accesibles, escribir el CSS, generar el brandbook
HTML, subsetear y embeber fuentes, medir tiempos, versionar— lo hace un **script determinista**, para
gastar pocos tokens y entregar en segundos, no en minutos.

> **Principio no negociable:** el LLM solo aporta **criterio** (observar el sitio y decidir) y escribe
> **únicamente `tokens.json`**. NINGÚN campo acepta HTML: la prosa es **texto plano**; el script escapa
> `<`/`>`/`&` (barrera anti-inyección desde el sitio inspeccionado). No calcules contraste ni redactes
> HTML tú mismo.

## Pasos

0. **Sella el inicio (respaldo).** La duración total (desde el **envío** del comando) la sella el hook
   `UserPromptSubmit` → `.claude/hooks/sd-sello.mjs` en `.claude/.cache/sd-run.json`. Si ese hook **no**
   está instalado, crea tú el sello de respaldo (solo si aún no existe, para no pisar el del hook):
   ```bash
   node -e "const fs=require('fs');const p='.claude/.cache/sd-run.json';if(!fs.existsSync(p)){fs.mkdirSync('.claude/.cache',{recursive:true});fs.writeFileSync(p,JSON.stringify({id:'paso0-'+Date.now(),inicioMs:Date.now(),prompt:'',via:'paso0'}))}"
   ```
   El sello vive en `.claude/.cache/` (NO en los entregables) y **no** se borra en la corrida normal del
   generador: lo lee y lo borra el subcomando `--fin` al cierre (paso 4).

1. **Inspecciona el sitio a fondo.** Ábrelo con el navegador/DevTools (o, si no puedes navegar, pídeme
   una captura o el HTML). No te quedes en lo superficial: la calidad del brandbook depende de lo que
   extraigas aquí. Identifica todo lo que puedas:
   - **Tipografía:** familias (título/cuerpo), sus **pesos** reales (400/500/700/900…) y, si quieres el
     archivo aún más liviano, los `subsets` (por defecto `latin`).
   - **Color:** los colores clave con su **hex** (primario, oscuros, acento, neutros, texto,
     texto-muted, fondo) y, si el sitio tiene una **escala** por familia (50…900), captúrala. Las
     escalas alimentan las **alternativas accesibles** que el script sugiere para los pares que fallan.
   - **Pares de contraste REALES (crítico):** las combinaciones **texto sobre fondo** que el sitio de
     verdad usa — texto del botón sobre su fondo, texto del menú sobre su barra, un color de marca usado
     **como texto**, etc. Anota `fg` (texto) y `bg` (fondo) de cada una. Sin esto el contraste medido es
     una ilusión: **no hay aprobado sin evidencia**.
   - **Escala tipográfica:** tamaños de h1, h2, h3, cuerpo, small, caption (con line-height y peso).
   - **Radios** (botón, card) y su **escala** (sm/md/lg/full).
   - **Espaciado** (la retícula: 4/8/12/16/24/32…), **sombras**, **gradientes**, y una **nota del logo**.
   - **Usos reales:** composiciones típicas (barra de menú, hero, tarjeta, pie) con sus colores.
   - **Qué NO es marca:** valores del sitio que **no** son decisiones de marca (temas por defecto de un
     framework, resets), para no confundirlos con tokens.
   - **Prosa con criterio** (texto plano, corto): un resumen del **estilo**, lo que **no** pudiste
     determinar, y avisos por sección.

2. **Escribe SOLO `design/<slug>/tokens.json`** (usa el mismo `<slug>` que pondrás en el archivo, para
   no pisar el de otro sitio). Captura toda la riqueza que hayas encontrado — **no empobrezcas** el
   sistema. TODOS los campos salvo `site` son **opcionales**: incluye lo que veas, omite lo que no
   puedas determinar (el script degrada con elegancia). No inventes valores.

   Esquema completo (usa los bloques que apliquen):
   ```json
   {
     "site": "https://ejemplo.com",
     "name": "Ejemplo",
     "slug": "ejemplo",
     "fonts": { "titulo": "Raleway", "cuerpo": "Inter", "subsets": ["latin"] },
     "fontWeights": { "titulo": [400, 700, 900], "cuerpo": [400, 500, 600] },
     "colors": {
       "primario": "#14A797", "primario-oscuro": "#118C7F", "acento": "#E85829",
       "texto": "#111111", "texto-muted": "#555555", "fondo": "#FFFFFF"
     },
     "pairs": [
       { "fg": "#FFFFFF", "bg": "#E85829", "uso": "texto del botón primario", "large": false },
       { "fg": "#14A797", "bg": "#FBDB89", "uso": "texto del menú", "nota": "casi no pasa" },
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
     "logo": { "nota":"Logotipo horizontal, monocromo sobre oscuros.", "url":"https://ejemplo.com/logo.svg" },
     "usos": [
       { "tipo":"barra","bg":"#FBDB89","fg":"#073C36","marca":"Ejemplo","items":["Nosotros","Servicios"],"cta":{"fg":"#FFFFFF","bg":"#E85829","texto":"Empezar"} },
       { "tipo":"hero","fondo":"linear-gradient(#FBDB89,#FFFFFF)","titulo":{"texto":"Título","color":"#14A797","size":"50px","weight":800},"subtitulo":"Bajada opcional." },
       { "tipo":"card","bg":"#FFFFFF","radio":"16px","sombra":"card","titulo":{"texto":"Tarjeta","color":"#111","size":"18px","weight":700},"cuerpo":{"texto":"Cuerpo.","color":"#555","size":"14px"} },
       { "tipo":"footer","bg":"#073C36","fg":"#FFFFFF","texto":"© 2026 Ejemplo." }
     ],
     "noMarca": [
       { "valor":"--primary-color: #3B82F6","origen":"tema por defecto de PrimeVue","nota":"no es el azul de la marca" }
     ],
     "resumen": { "estilo":"Cálido y natural", "descripcion":"Paleta terrosa con un verde de marca y naranja de acento…" },
     "noDeterminado": [ { "que":"line-height del cuerpo", "detalle":"el sitio no lo declara; se propone 1.5" } ],
     "notas": [ { "seccion":"paleta","tono":"aviso","titulo":"Acento sobre blanco","texto":"No usar como texto pequeño." } ],
     "muestrasTexto": { "h1":"Titulares que venden", "h2":"Subtítulos que explican", "cuerpo":"Cuerpo real del sitio." }
   }
   ```
   - **`pairs` (contraste real) — captúralo siempre que puedas.** Cada objeto es una combinación real
     `fg` (texto) sobre `bg` (fondo) con un `uso` que la describe y `large:true` si es texto grande
     (≥24px, o ≥18.66px en negrita: umbral AA 3:1 en vez de 4.5:1). Opcional `nota` (una línea). El
     script compara el ratio **crudo** (no lo redondea antes de decidir) y, por cada par que falla,
     **calcula una alternativa accesible** automática (tono de la misma familia de escala, o un tono
     derivado). Las muestras de **botón** salen de los `pairs` cuyo `uso` mencione "botón".
   - **`usos` (usos reales) — opcional.** El script dibuja una plantilla por `tipo` ∈
     `barra | hero | footer | card` con tus datos (colores, textos). Solo datos: el script maqueta.
   - **`noMarca` — opcional.** Valores del sitio que NO son marca; el script solo los tabula.
   - **`subsets` dentro de `fonts` — opcional.** Por defecto `["latin"]` (archivo más liviano); usa
     `["latin","latin-ext"]` si el sitio necesita acentos extendidos.
   - **`propuesto` (propuesto vs observado) — opcional.** Lista de nombres de token en estilo css-var
     **sin** el `--` (p. ej. `"lh-cuerpo"`, `"espacio-6"`, `"color-acento"`, `"fs-h1"`) que **no
     observaste** y estás **proponiendo** tú. El brandbook los marca con una insignia **"propuesto"**;
     los tipográficos (`--fs-*`, `--lh-*`, `--fw-*`) también aparecen en la tabla de tokens.
   - **Prosa con criterio (texto plano, obligatoria cuando se pueda):** llena `resumen`,
     `noDeterminado` y `muestrasTexto` siempre que el sitio te lo permita. `notas` acepta hasta 8 avisos
     con `seccion ∈ resumen|paleta|tipografia|componentes|contraste|logo|general` y `tono ∈ aviso|info`.
     Todo es **texto plano**: el script lo escapa. No metas HTML.
   - **Compatibilidad:** un `tokens.json` mínimo (solo `site` + `fonts` + `colors` + `radii`) sigue
     funcionando; el brandbook solo muestra las secciones para las que haya datos.
   - **Tipografías:** el script **descarga y embebe** las fuentes de Google Fonts en **base64**
     (`@font-face`, solo el subset pedido) para que el brandbook sea **autocontenido** (offline). Si no
     hay red, cae a `@import` y lo avisa. Si una fuente NO es de Google, pon `"tituloUrl"`/`"cuerpoUrl"`
     con su enlace (o `"google": false`) y el script lo documentará en vez de embeberla.

3. **Corre el script determinista** (mide contraste AA de los pares reales con el ratio crudo, calcula
   alternativas, embebe fuentes con subset, escribe tokens.css + brandbook.html y **versiona** — nunca
   sobrescribe). El script toma el `<slug>` del propio `tokens.json`:
   ```bash
   node .claude/scripts/sistema-diseno.mjs design/<slug>/tokens.json
   ```
   La salida va a `design/<slug>/vN/` más una copia **latest** en `design/<slug>/brandbook.html` y
   `design/<slug>/tokens.css`. Dos corridas del **mismo** `tokens.json` producen HTML **byte a byte
   idéntico** (sin timestamps ni número de versión dentro del HTML).

4. **Cierra con `--fin` (una sola vez, justo antes del mensaje final).** Este subcomando lee el sello,
   calcula la duración total y **debe** proveer el bloque de cierre que va en tu mensaje:
   ```bash
   node .claude/scripts/sistema-diseno.mjs --fin
   ```
   Tu mensaje final **debe** contener exactamente ese bloque, tal como lo imprime `--fin`:
   ```
   1. CSS ......... design/<slug>/v<N>/tokens.css
   2. Brandbook ... design/<slug>/v<N>/brandbook.html   (latest: design/<slug>/brandbook.html)
   3. Duración .... 3m 20.5s  (desde el envío del comando hasta la entrega)
   ```
   La duración va **en el chat, NUNCA dentro del brandbook**. Menciona además en una línea: número de
   versión · tipografía · primario · acento · **pares que fallan AA** (N, con su ratio).

## Reglas de entrega (importante)
- **Completa TODO en una sola pasada. No te detengas a preguntar "¿lo termino?"**: el entregable son
  los archivos versionados, y el script los escribe siempre. No pares tras `tokens.json`.
- **No empobrezcas el sistema.** La calidad se gana en el paso 1–2: extrae escalas, pesos, espaciado,
  sombras, gradientes, **los pares de contraste reales**, los **usos** y la **prosa con criterio**.
- **Contraste con evidencia real.** Captura `pairs`. El titular es "Pares que fallan AA: N", no el "0
  fallan" del mejor-texto-posible. Cada par que falla trae una **alternativa accesible** calculada.
- **Marca propuesto vs observado** (`propuesto`) para lo que sugieras tú y no viste en el sitio.
- **Prosa = texto plano.** Nunca metas HTML en `resumen`/`notas`/`usos`/etc.: el script lo escapa.
- **Cierra SIEMPRE con el bloque de `--fin`** (versión nueva + latest + duración) y cómo abrir el
  brandbook (`open design/<slug>/brandbook.html`). No esperes a que el usuario pregunte.
- No calcules contraste ni redactes el HTML tú mismo: eso lo hace el script (determinista, sin tokens).
- Si `node` no está disponible, dilo y ofrece el equivalente; no reimplementes el script a mano.
