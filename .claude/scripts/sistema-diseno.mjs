#!/usr/bin/env node
// Genera un sistema de diseño de forma DETERMINISTA a partir de un tokens.json:
//  - calcula ratios de contraste WCAG de PARES REALES fg/bg (los que el sitio usa) y, como
//    referencia secundaria, el "mejor texto posible" por color (colores planos y escalas 50..900),
//  - escribe tokens.css (variables CSS),
//  - escribe brandbook.html (manual de diseño AUTOCONTENIDO, con tipografías embebidas en base64),
//  - AUTO-VERSIONA: nunca sobrescribe; crea v1, v2, v3... y una copia "latest",
//  - reporta en consola la duración total de la tarea (desde el sello de inicio del skill).
// El LLM solo produce tokens.json (la parte con criterio); esto es puro mecanismo → 0 tokens.
// Uso:  node .claude/scripts/sistema-diseno.mjs [ruta/tokens.json]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const scriptStart = Date.now();

const inPath = process.argv[2] || 'design/tokens.json';
let data;
try { data = JSON.parse(readFileSync(inPath, 'utf8')); }
catch (e) { console.error(`No pude leer ${inPath}: ${e.message}\nEscribe primero tokens.json (ver la descripción del command).`); process.exit(1); }

// ---------------------------------------------------------------------------
// Entrada normalizada (todo opcional salvo que se indique; degradación elegante)
// ---------------------------------------------------------------------------
const fonts       = data.fonts       || {};
const fontWeights = data.fontWeights || {};
const colors      = data.colors      || {};
const colorScales = data.colorScales || {};
const typeScale   = data.typeScale   || {};
const radii       = data.radii       || {};
const radiiScale  = data.radiiScale  || {};
const spacing     = data.spacing     || {};
const shadows     = data.shadows     || {};
const gradients   = data.gradients   || {};
const logo        = data.logo        || (typeof data.logo === 'string' ? { nota: data.logo } : {});

const fTitulo = fonts.titulo || fonts.cuerpo || 'system-ui';
const fCuerpo = fonts.cuerpo || fTitulo;

// Tokens marcados como "propuesto" (no observados en el sitio). Convención simple y opcional:
// array de nombres de variable en estilo css-var SIN el "--" (p. ej. "lh-cuerpo", "espacio-6",
// "color-acento", "sombra-md"). Retrocompatible: si no viene, nada se marca.
const propuestoSet = new Set(
  (Array.isArray(data.propuesto) ? data.propuesto : [])
    .map(s => String(s).replace(/^--/, '').trim().toLowerCase())
);
const esProp = name => propuestoSet.has(String(name).replace(/^--/, '').trim().toLowerCase());

// ---------------------------------------------------------------------------
// Slug determinista para el site (data.slug > data.name > data.site)
// ---------------------------------------------------------------------------
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60) || 'sitio';
}
const slug = slugify(data.slug || data.name || data.site || 'sitio');

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------
const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const c = String(hex).replace('#', '').padStart(6, '0');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const r2 = n => Math.round(n * 100) / 100;
const passAA = (r, large = false) => r >= (large ? 3 : 4.5);
const isHex = v => /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(String(v || '').trim());
// para un color de fondo, el texto (blanco/negro) que mejor contrasta
const bestText = bg => (ratio(bg, '#FFFFFF') >= ratio(bg, '#000000') ? '#FFFFFF' : '#111111');
function normHex(h) {
  let c = String(h || '').trim().replace('#', '').toLowerCase();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  return '#' + c;
}

// --- Pares REALES fg/bg (el par que el sitio de verdad usa) ------------------
// Esto reemplaza al engañoso "0 fallan AA": aquí medimos la combinación real.
function pairRow(p) {
  const fg = String(p.fg || '').trim();
  const bg = String(p.bg || '').trim();
  const large = !!p.large;
  const r = r2(ratio(fg, bg));
  const need = large ? 3 : 4.5;
  return { fg, bg, uso: p.uso || '', large, ratio: r, need, aa: r >= need };
}
const pairsRaw = Array.isArray(data.pairs) ? data.pairs : [];
const pairs = pairsRaw.filter(p => p && isHex(p.fg) && isHex(p.bg)).map(pairRow);
const pairsFail = pairs.filter(p => !p.aa);
const findPairForBg = bg => pairs.find(p => normHex(p.bg) === normHex(bg));

// --- Referencia SECUNDARIA: mejor texto posible por color -------------------
function contrastRow(name, hex) {
  const tw = r2(ratio(hex, '#FFFFFF')), tb = r2(ratio(hex, '#000000'));
  const txt = bestText(hex), best = r2(ratio(hex, txt));
  return { name, hex, tw, tb, txt, best, aa: passAA(best) };
}

// filas de contraste: colores planos + cada paso de las escalas
const rows = Object.entries(colors).filter(([, v]) => isHex(v)).map(([n, v]) => contrastRow(n, v));
const scaleRows = [];
for (const [fam, steps] of Object.entries(colorScales)) {
  for (const [k, v] of Object.entries(steps)) {
    if (isHex(v)) scaleRows.push(contrastRow(`${fam}-${k}`, v));
  }
}
const allRows = [...rows, ...scaleRows];
const fails = rows.filter(r => !r.aa);

// ---------------------------------------------------------------------------
// tokens.css (variables CSS)
// ---------------------------------------------------------------------------
const cssVars = [
  `  --font-titulo: '${fTitulo}', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;`,
  `  --font-cuerpo: '${fCuerpo}', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;`,
  ...Object.entries(colors).map(([k, v]) => `  --color-${k}: ${v};`),
];
for (const [fam, steps] of Object.entries(colorScales)) {
  for (const [k, v] of Object.entries(steps)) cssVars.push(`  --color-${fam}-${k}: ${v};`);
}
for (const [k, v] of Object.entries(typeScale)) {
  const t = typeof v === 'object' ? v : { size: v };
  if (t.size)       cssVars.push(`  --fs-${k}: ${t.size};`);
  if (t.lineHeight) cssVars.push(`  --lh-${k}: ${t.lineHeight};`);
  if (t.weight)     cssVars.push(`  --fw-${k}: ${t.weight};`);
}
for (const [k, v] of Object.entries(radii))      cssVars.push(`  --radio-${k}: ${v};`);
for (const [k, v] of Object.entries(radiiScale)) cssVars.push(`  --radio-${k}: ${v};`);
for (const [k, v] of Object.entries(spacing))    cssVars.push(`  --espacio-${k}: ${v};`);
for (const [k, v] of Object.entries(shadows))    cssVars.push(`  --sombra-${k}: ${v};`);
for (const [k, v] of Object.entries(gradients))  cssVars.push(`  --gradiente-${k}: ${v};`);

const css = `/* Sistema de diseño extraído de ${data.site || slug} — generado por sistema-diseno.mjs */\n:root {\n${cssVars.join('\n')}\n}\n`;

// ---------------------------------------------------------------------------
// Embebido de tipografías: en tiempo de generación descarga los woff2 de Google
// Fonts (con User-Agent de navegador para obtener woff2) y los incrusta en base64
// como @font-face, para que el brandbook sea AUTOCONTENIDO (se abre sin conexión).
// Fallback robusto: si algo falla (sin red), se mantiene @import y se avisa; un
// fallo de red NUNCA rompe la generación.
// ---------------------------------------------------------------------------
const fontNotes = [];
function googleFamily(name, weights) {
  const ws = (weights && weights.length ? [...new Set(weights)].sort((a, b) => a - b) : [400, 700]).join(';');
  return `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${ws}`;
}
function buildFontPlan() {
  // fonts.google === false → no embeber (fuente no-Google / de sistema); solo documentar.
  const fams = [];
  const seen = new Set();
  const consider = [
    { name: fonts.titulo, weights: fontWeights.titulo, url: fonts.tituloUrl, google: fonts.tituloGoogle },
    { name: fonts.cuerpo, weights: fontWeights.cuerpo, url: fonts.cuerpoUrl, google: fonts.cuerpoGoogle },
  ];
  for (const f of consider) {
    if (!f.name || seen.has(f.name.toLowerCase())) continue;
    seen.add(f.name.toLowerCase());
    if (f.url) { fontNotes.push(`${f.name}: fuente externa (${f.url}) — enlázala tú; no es Google Fonts.`); continue; }
    if (f.google === false || fonts.google === false) { fontNotes.push(`${f.name}: no se embebe (fuente de sistema o licenciada aparte).`); continue; }
    fams.push(googleFamily(f.name, f.weights));
  }
  if (!fams.length) return { param: '', importUrl: '' };
  const param = fams.join('&');
  return { param, importUrl: `@import url('https://fonts.googleapis.com/css2?${param}&display=swap');` };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
async function fetchWithTimeout(url, opts = {}, ms = 6000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...opts, signal: controller.signal }); }
  finally { clearTimeout(t); }
}

let fontEmbedError = '';
async function embedGoogleFonts(param) {
  if (!param) return { faceCss: '', ok: false };
  try {
    const cssRes = await fetchWithTimeout(`https://fonts.googleapis.com/css2?${param}&display=swap`, { headers: { 'User-Agent': UA } }, 6000);
    if (!cssRes.ok) throw new Error(`CSS HTTP ${cssRes.status}`);
    const cssText = await cssRes.text();
    // bloques @font-face con el subset comentado justo antes (/* latin */, /* latin-ext */…)
    const blocks = [];
    const re = /\/\*\s*([^*]+?)\s*\*\/\s*(@font-face\s*{[\s\S]*?})/g;
    let m;
    while ((m = re.exec(cssText)) !== null) blocks.push({ subset: m[1].trim().toLowerCase(), block: m[2] });
    if (!blocks.length) {
      const re2 = /@font-face\s*{[\s\S]*?}/g; let m2;
      while ((m2 = re2.exec(cssText)) !== null) blocks.push({ subset: '', block: m2[0] });
    }
    // Nos quedamos con latin y latin-ext (cubre español) para no inflar el archivo.
    const keep = blocks.filter(b => !b.subset || b.subset === 'latin' || b.subset === 'latin-ext');
    const chosen = keep.length ? keep : blocks;
    const out = [];
    for (const b of chosen) {
      const um = /url\((https:\/\/[^)]+\.woff2)\)/.exec(b.block);
      if (!um) continue;
      const fr = await fetchWithTimeout(um[1], { headers: { 'User-Agent': UA } }, 6000);
      if (!fr.ok) throw new Error(`woff2 HTTP ${fr.status}`);
      const buf = Buffer.from(await fr.arrayBuffer());
      const dataUri = `data:font/woff2;base64,${buf.toString('base64')}`;
      out.push(b.block.replace(um[1], dataUri));
    }
    if (!out.length) throw new Error('no se hallaron woff2 en el CSS de Google Fonts');
    return { faceCss: out.join('\n'), ok: true };
  } catch (e) {
    fontEmbedError = e.message || String(e);
    return { faceCss: '', ok: false };
  }
}

const fontPlan = buildFontPlan();
const fontEmbed = await embedGoogleFonts(fontPlan.param);
const fontFaceCss = fontEmbed.faceCss;
const fontEmbedded = fontEmbed.ok;
// Si había fuentes Google que embeber y falló, caemos a @import y avisamos.
const fontFallbackImport = (fontPlan.param && !fontEmbedded) ? fontPlan.importUrl : '';

// ---------------------------------------------------------------------------
// brandbook.html (AUTOCONTENIDO cuando las fuentes se embeben; si no, @import + aviso)
// ---------------------------------------------------------------------------
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const propTag = name => esProp(name) ? ' <span class="prop">propuesto</span>' : '';

const swatch = r => `
  <div class="sw">
    <div class="chip" style="background:${r.hex};color:${r.txt}">${esc(r.hex)}</div>
    <div class="meta">
      <b>${esc(r.name)}${propTag('color-' + r.name)}</b>
      <span>mejor texto ${r.txt === '#FFFFFF' ? 'blanco' : 'negro'} · ${r.best}:1 ${r.aa ? '✓' : '✗'} <em>(posible, no el uso real)</em></span>
    </div>
  </div>`;

function scaleStrip(fam, steps) {
  const cells = Object.entries(steps).filter(([, v]) => isHex(v)).map(([k, v]) => {
    const txt = bestText(v), best = r2(ratio(v, txt));
    return `<div class="step" style="background:${v};color:${txt}"><span>${esc(k)}</span><small>${esc(v)}</small><small>${best}:1 ${passAA(best) ? '✓' : '✗'}</small></div>`;
  }).join('');
  return `<div class="scale"><h3>${esc(fam)}</h3><div class="steps">${cells}</div></div>`;
}

// Botón: usa el color de texto REAL del par correspondiente (no el "mejor texto"
// automático). Si el color no tiene par definido, cae al mejor texto pero se rotula
// "sugerido, no el uso real". La insignia ✓/✗ muestra la verdad, aunque falle.
function btnDemo(bg, label = 'Botón') {
  const p = findPairForBg(bg);
  const txt = p ? p.fg : bestText(bg);
  const need = p && p.large ? 3 : 4.5;
  const r = r2(ratio(txt, bg));
  const pass = r >= need;
  const rad = radii.boton || radiiScale.md || '8px';
  const tag = p ? 'uso real' : 'sugerido, no el uso real';
  return `<div class="btnwrap">
    <button style="background:${bg};color:${txt};border:0;border-radius:${rad};padding:.6rem 1.1rem;font:600 14px var(--font-cuerpo);cursor:pointer">${esc(label)}</button>
    <small class="btnmeta ${pass ? 'ok' : 'bad'}">${r}:1 ${pass ? '✓ AA' : '✗ falla AA'} · ${esc(tag)}</small>
  </div>`;
}

// tipografía: escala (usa typeScale si viene; si no, una escala por defecto)
const defaultTypeSamples = [
  ['h1', '40px', 700], ['h2', '30px', 700], ['h3', '24px', 600],
  ['cuerpo', '16px', 400], ['small', '13px', 400], ['caption', '11px', 500],
];
const typeSamples = Object.keys(typeScale).length
  ? Object.entries(typeScale).map(([k, v]) => {
      const t = typeof v === 'object' ? v : { size: v };
      return [k, t.size || '16px', t.weight || 400, t.lineHeight];
    })
  : defaultTypeSamples;

function typeSampleRow([name, size, weight, lh]) {
  const fam = /^(h1|h2|h3|display|titulo|título)/i.test(name) ? 'var(--font-titulo)' : 'var(--font-cuerpo)';
  const sizeTag = propTag('fs-' + name);
  const wTag = propTag('fw-' + name);
  const lhTag = propTag('lh-' + name);
  return `<div class="tsample"><div class="tmeta"><code>${esc(name)}</code><span>${esc(size)}${sizeTag} · ${esc(String(weight))}${wTag}${lh ? ' · lh ' + esc(String(lh)) + lhTag : ''}</span></div>
  <div style="font:${weight} ${size}/${lh || 1.2} ${fam}">${esc(name)} — Diseñar con criterio</div></div>`;
}

const weightsBlock = (label, ws) => (ws && ws.length)
  ? `<div class="weights"><b>${esc(label)}</b> ${[...new Set(ws)].sort((a, b) => a - b).map(w => `<span style="font-weight:${w};font-family:var(--font-${/titulo|título/i.test(label) ? 'titulo' : 'cuerpo'})">${w}</span>`).join('')}</div>`
  : '';

function radiusBox(k, v) {
  return `<div class="rbox"><div class="rdemo" style="border-radius:${esc(v)}"></div><code>--radio-${esc(k)}</code><small>${esc(v)}${propTag('radio-' + k)}</small></div>`;
}
function spaceBar(k, v) {
  return `<div class="spitem"><span class="spbar" style="width:${esc(v)}"></span><code>--espacio-${esc(k)}</code><small>${esc(v)}${propTag('espacio-' + k)}</small></div>`;
}
function shadowBox(k, v) {
  return `<div class="shbox" style="box-shadow:${esc(v)}"><code>--sombra-${esc(k)}</code></div>`;
}
function gradientBox(k, v) {
  return `<div class="gbox" style="background:${esc(v)}"><code>--gradiente-${esc(k)}</code></div>`;
}

const section = (cond, title, body) => cond ? `<h2>${title}</h2>\n${body}\n` : '';

// --- Sección de pares reales (el titular de contraste va aquí) ---------------
function pairCard(p) {
  return `<div class="pair ${p.aa ? 'ok' : 'bad'}">
    <div class="pairswatch" style="background:${p.bg};color:${p.fg}">Aa</div>
    <div class="pairmeta">
      <b>${p.ratio}:1 ${p.aa ? '✓ AA' : '✗ falla AA'}</b>
      <span class="mono">${esc(p.fg)} sobre ${esc(p.bg)}${p.large ? ' · texto grande' : ''}</span>
      ${p.uso ? `<span class="uso">${esc(p.uso)}</span>` : ''}
    </div>
  </div>`;
}
const pairsSection = pairs.length
  ? `<h2>Contraste en uso real (pares)</h2>
<p class="sub">Combinaciones fg/bg tal como el sitio las usa. Umbral AA: 4.5:1 (texto normal), 3:1 (texto grande). <b>Este es el número que importa</b>, no el "mejor texto posible".</p>
${pairsFail.length
    ? `<div class="warn"><b>Pares que fallan AA: ${pairsFail.length}</b><ul>${pairsFail.map(p => `<li><code>${esc(p.fg)}</code> sobre <code>${esc(p.bg)}</code> — <b>${p.ratio}:1</b>${p.uso ? ' · ' + esc(p.uso) : ''}</li>`).join('')}</ul></div>`
    : `<div class="okbox"><b>Pares que fallan AA: 0</b> — todas las combinaciones reales evaluadas pasan.</div>`}
<div class="grid pairs">${pairs.map(pairCard).join('')}</div>`
  : `<h2>Contraste en uso real (pares)</h2>
<div class="warn">No se dieron los pares reales del sitio (campo <code>pairs</code> en tokens.json); el AA que se muestra abajo es del <b>mejor texto posible</b>, <b>no del uso real</b>. Captura las combinaciones fg/bg que el sitio usa de verdad (texto del botón sobre su fondo, texto del menú, primario-como-texto…) para medir el contraste verdadero.</div>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brandbook · ${esc(data.site || slug)}</title>
<style>${fontFaceCss ? fontFaceCss + '\n' : ''}${fontFallbackImport ? fontFallbackImport + '\n' : ''}${css}
*{box-sizing:border-box} body{margin:0;font:16px/1.5 var(--font-cuerpo);color:${colors.texto || '#111'};background:${colors.fondo || '#fff'};padding:2.5rem clamp(1rem,5vw,4rem);max-width:1120px;margin:0 auto}
h1{font:700 34px var(--font-titulo);margin:0 0 .2rem} h2{font:700 20px var(--font-titulo);margin:2.6rem 0 .8rem;border-bottom:1px solid #e5e5e5;padding-bottom:.3rem}
h3{font:600 15px var(--font-titulo);margin:1rem 0 .5rem}
.sub{color:${colors['texto-muted'] || '#666'};margin:0 0 1.2rem;max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.9rem}
.sw{border:1px solid #eaeaea;border-radius:10px;overflow:hidden} .chip{padding:1.6rem .8rem;font:600 13px var(--font-cuerpo)}
.meta{padding:.6rem .8rem;font-size:12.5px;display:flex;flex-direction:column;gap:.15rem} .meta span{color:#777} .meta em{color:#999;font-style:normal}
.pairs{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.pair{display:flex;gap:.7rem;align-items:center;border:1px solid #eaeaea;border-radius:10px;padding:.6rem;border-left-width:4px}
.pair.ok{border-left-color:#2f9e44} .pair.bad{border-left-color:#e03131}
.pairswatch{flex:0 0 auto;width:56px;height:56px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 20px var(--font-titulo)}
.pairmeta{display:flex;flex-direction:column;gap:.15rem;font-size:12.5px} .pairmeta b{font-size:13px} .pairmeta .mono{color:#777;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px} .pairmeta .uso{color:#555}
.scale{margin:.4rem 0 1.1rem} .steps{display:flex;flex-wrap:wrap;gap:2px;border-radius:10px;overflow:hidden}
.step{flex:1 1 70px;min-width:70px;padding:.7rem .4rem;display:flex;flex-direction:column;gap:.1rem;font-size:11px}
.step span{font-weight:700} .step small{opacity:.85}
.tsample{padding:.5rem 0;border-bottom:1px solid #f0f0f0} .tmeta{display:flex;gap:.6rem;align-items:baseline;margin-bottom:.2rem} .tmeta span{color:#888;font-size:12px}
.weights{margin:.6rem 0;display:flex;gap:.9rem;align-items:baseline;flex-wrap:wrap} .weights span{font-size:20px}
.rowbox{display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end}
.rbox{text-align:center;font-size:12px} .rdemo{width:64px;height:64px;background:${colors.primario || '#14A797'};margin:0 auto .3rem} .rbox small{display:block;color:#888}
.spitem{display:flex;align-items:center;gap:.7rem;margin:.35rem 0;font-size:12px} .spbar{display:inline-block;height:14px;background:${colors.acento || colors.primario || '#E85829'};border-radius:3px} .spitem small{color:#888}
.shbox{display:inline-flex;align-items:flex-end;justify-content:center;width:130px;height:90px;margin:.6rem 1rem .6rem 0;background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:.5rem;font-size:11px;color:#666}
.gbox{display:inline-flex;align-items:flex-end;width:180px;height:90px;margin:.6rem 1rem .6rem 0;border-radius:12px;padding:.5rem;color:#fff;font-size:11px}
.gbox code,.shbox code{background:rgba(255,255,255,.75);color:#222;padding:.1rem .35rem;border-radius:4px}
.btnwrap{display:flex;flex-direction:column;gap:.3rem;align-items:flex-start} .btnmeta{font-size:11.5px} .btnmeta.ok{color:#2b8a3e} .btnmeta.bad{color:#c92a2a}
table{border-collapse:collapse;width:100%;font-size:14px} td,th{border-bottom:1px solid #eee;padding:.5rem .6rem;text-align:left}
.warn{background:#fff4e6;border:1px solid #f0c98a;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;font-size:14px} .warn ul{margin:.4rem 0 0;padding-left:1.2rem} .warn li{margin:.15rem 0}
.okbox{background:#ebfbee;border:1px solid #a3d9b1;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;font-size:14px}
.note{background:#eef6ff;border:1px solid #bcd8f5;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;font-size:14px}
.prop{display:inline-block;background:#f3e8ff;color:#7a3fb0;border:1px solid #dcc3f0;border-radius:5px;padding:0 .35rem;font-size:10.5px;font-weight:600;vertical-align:middle;margin-left:.25rem}
.samples>*{margin:.3rem 0} code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}
.legend{color:#888;font-size:12.5px;margin:.4rem 0 0}
</style></head><body>
<h1>Brandbook</h1>
<p class="sub">Sistema de diseño de <b>${esc(data.site || slug)}</b> · generado automáticamente · título ${esc(fTitulo)} · cuerpo ${esc(fCuerpo)}. Marca <span class="prop">propuesto</span> = valor no observado en el sitio, sugerido por el kit.</p>
${fontFallbackImport ? `<div class="warn"><b>Fuentes por conexión (no se pudieron embeber).</b> Se usa <code>@import</code> a Google Fonts; el brandbook requiere red para verse con las tipografías correctas.${fontEmbedError ? ` <small>(${esc(fontEmbedError)})</small>` : ''}</div>` : ''}
${fontEmbedded ? '<div class="note"><b>Fuentes embebidas</b> (base64): el brandbook es autocontenido y se abre sin conexión.</div>' : ''}
${(!fontPlan.param && !fontFaceCss && !fontFallbackImport) ? '<div class="note">Tipografías de sistema (no hay fuentes web que embeber).</div>' : ''}
${fontNotes.length ? `<div class="note"><b>Fuentes:</b> ${fontNotes.map(esc).join(' ')}</div>` : ''}

${pairsSection}

<h2>Paleta</h2>
<div class="grid">${rows.map(swatch).join('')}</div>
<p class="legend">Referencia secundaria: el "mejor texto posible" por color (blanco o negro) — <b>no es el par que el sitio usa</b>. El contraste real está arriba, en los pares.</p>
${fails.length ? `<div class="warn"><b>Referencia secundaria:</b> ${fails.length} color(es) no alcanzan AA ni con su mejor texto posible: ${fails.map(f => `${esc(f.name)} (${f.best}:1)`).join(', ')}. Úsalos para acentos/gráficos, no para texto pequeño.</div>` : ''}

${section(Object.keys(colorScales).length, 'Escalas de color (50 → 900)',
  Object.entries(colorScales).map(([fam, steps]) => scaleStrip(fam, steps)).join(''))}

<h2>Tipografía</h2>
<div class="samples">${typeSamples.map(typeSampleRow).join('')}</div>
${weightsBlock('Título', fontWeights.titulo)}
${weightsBlock('Cuerpo', fontWeights.cuerpo)}
<p style="max-width:60ch;margin-top:.8rem">Cuerpo — ${esc(fCuerpo)}. El zorro veloz salta sobre el perro perezoso. 0123456789.</p>

<h2>Botones y componentes</h2>
<p class="sub">Cada botón muestra su combinación de color REAL (par fg/bg) con su ratio y AA. Un ✗ significa que el sitio usa un contraste que no pasa AA.</p>
<div class="samples" style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:flex-start">
  ${colors.primario ? btnDemo(colors.primario, 'Primario') : ''}
  ${colors.acento ? btnDemo(colors.acento, 'Acento') : ''}
  ${colors['primario-oscuro'] ? btnDemo(colors['primario-oscuro'], 'Oscuro') : ''}
</div>
<div style="margin-top:1.2rem;padding:1.1rem 1.2rem;max-width:360px;border:1px solid #eaeaea;border-radius:${radii.card || radiiScale.lg || '12px'};${shadows.md ? 'box-shadow:' + esc(shadows.md) : ''}">
  <b style="font-family:var(--font-titulo)">Card de ejemplo</b>
  <p class="sub" style="margin:.3rem 0 0">Usa radio de card y una sombra del sistema.</p>
</div>

${section(Object.keys(radii).length + Object.keys(radiiScale).length, 'Radios',
  `<div class="rowbox">${[...Object.entries(radii), ...Object.entries(radiiScale)].map(([k, v]) => radiusBox(k, v)).join('')}</div>`)}

${section(Object.keys(spacing).length, 'Espaciado',
  `<div>${Object.entries(spacing).map(([k, v]) => spaceBar(k, v)).join('')}</div>`)}

${section(Object.keys(shadows).length, 'Sombras',
  `<div>${Object.entries(shadows).map(([k, v]) => shadowBox(k, v)).join('')}</div>`)}

${section(Object.keys(gradients).length, 'Gradientes',
  `<div>${Object.entries(gradients).map(([k, v]) => gradientBox(k, v)).join('')}</div>`)}

${section(logo.nota || logo.url, 'Logo',
  `<div class="note">${logo.nota ? esc(logo.nota) + ' ' : ''}${logo.url ? `Referencia: <code>${esc(logo.url)}</code>` : ''}</div>`)}

<h2>Tokens</h2>
<table><thead><tr><th>Token</th><th>Valor</th><th>Estado</th><th>Mejor texto (posible, no uso real)</th></tr></thead><tbody>
${rows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${esProp('color-' + r.name) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${scaleRows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${esProp('color-' + r.name) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${[...Object.entries(radii), ...Object.entries(radiiScale)].map(([k, v]) => `<tr><td>--radio-${esc(k)}</td><td><code>${esc(v)}</code></td><td>${esProp('radio-' + k) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>—</td></tr>`).join('')}
${Object.entries(spacing).map(([k, v]) => `<tr><td>--espacio-${esc(k)}</td><td><code>${esc(v)}</code></td><td>${esProp('espacio-' + k) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>—</td></tr>`).join('')}
${Object.entries(shadows).map(([k, v]) => `<tr><td>--sombra-${esc(k)}</td><td><code>${esc(v)}</code></td><td>${esProp('sombra-' + k) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>—</td></tr>`).join('')}
${Object.entries(gradients).map(([k, v]) => `<tr><td>--gradiente-${esc(k)}</td><td><code>${esc(v)}</code></td><td>${esProp('gradiente-' + k) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>—</td></tr>`).join('')}
</tbody></table>

<h2>Referencia secundaria: mejor texto posible por color (no es el uso real)</h2>
<p class="sub">Para cada color, el mejor texto (blanco/negro) y su ratio. Sirve para saber el techo de contraste de un color, <b>no</b> para afirmar que "pasa AA en el sitio". El uso real está en la sección de pares, arriba.</p>
<table><thead><tr><th>Color</th><th>Hex</th><th>vs blanco</th><th>vs negro</th><th>Mejor</th><th>AA (mejor texto)</th></tr></thead><tbody>
${allRows.map(r => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${r.tw}:1</td><td>${r.tb}:1</td><td>${r.best}:1 (texto ${r.txt === '#FFFFFF' ? 'blanco' : 'negro'})</td><td>${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
</tbody></table>

<p class="sub" style="margin-top:2rem">Los tokens reutilizables están en <code>tokens.css</code>. Pásaselos a Claude para diseñar tus pantallas con este sistema.</p>
</body></html>`;

// ---------------------------------------------------------------------------
// Auto-versionado determinista (nunca sobrescribe)
//   <base>/<slug>/v1|v2|v3/{tokens.json,tokens.css,brandbook.html}
//   <base>/<slug>/{tokens.css,brandbook.html}   ← copia "latest"
// El siguiente entero se calcula contando las versiones existentes (sin timestamps).
// ---------------------------------------------------------------------------
const baseDir = dirname(inPath);               // típicamente "design"
const siteDir = join(baseDir, slug);
mkdirSync(siteDir, { recursive: true });

let maxV = 0;
if (existsSync(siteDir)) {
  for (const entry of readdirSync(siteDir, { withFileTypes: true })) {
    const m = entry.isDirectory() && /^v(\d+)$/.exec(entry.name);
    if (m) maxV = Math.max(maxV, parseInt(m[1], 10));
  }
}
const nextV = maxV + 1;
const verDir = join(siteDir, `v${nextV}`);
mkdirSync(verDir, { recursive: true });

// versión nueva
writeFileSync(join(verDir, 'tokens.json'), JSON.stringify(data, null, 2) + '\n');
writeFileSync(join(verDir, 'tokens.css'), css);
writeFileSync(join(verDir, 'brandbook.html'), html);
// copia "latest" (apunta a la última versión)
writeFileSync(join(siteDir, 'tokens.css'), css);
writeFileSync(join(siteDir, 'brandbook.html'), html);

// ---------------------------------------------------------------------------
// Salida (para que el agente reporte sin adivinar)
// ---------------------------------------------------------------------------
const latestHtml = join(siteDir, 'brandbook.html');
const latestCss = join(siteDir, 'tokens.css');
console.log('SISTEMA DE DISEÑO GENERADO');
console.log(`  site: ${data.site || slug}  ·  slug: ${slug}  ·  versión: v${nextV}${maxV ? ` (antes v1..v${maxV})` : ''}`);
console.log('  versión nueva:');
console.log('    ' + join(verDir, 'brandbook.html'));
console.log('    ' + join(verDir, 'tokens.css'));
console.log('    ' + join(verDir, 'tokens.json'));
console.log('  latest (siempre la última):');
console.log('    ' + latestHtml + '   (ábrelo con:  open ' + latestHtml + ')');
console.log('    ' + latestCss);
console.log(`  tipografías: ${fontEmbedded ? 'embebidas en base64 (autocontenido)' : (fontFallbackImport ? 'por conexión @import (no se pudieron embeber' + (fontEmbedError ? ': ' + fontEmbedError : '') + ')' : 'de sistema / externas (nada que embeber)')}`);

// Titular de contraste: basado en PARES REALES (no en el "mejor texto posible").
if (pairs.length) {
  console.log(`Pares reales evaluados: ${pairs.length} · que fallan AA: ${pairsFail.length}`);
  for (const p of pairsFail) console.log(`  ✗ ${p.fg} sobre ${p.bg} — ${p.ratio}:1${p.uso ? ' (' + p.uso + ')' : ''}`);
} else {
  console.log('⚠ Sin "pairs" en tokens.json: el AA por-swatch NO es el uso real del sitio. Añade pairs (fg/bg) para medir el contraste verdadero.');
}
console.log(`Colores planos: ${rows.length} · en escalas: ${scaleRows.length} · referencia secundaria (no alcanzan AA ni con su mejor texto): ${fails.length}${fails.length ? ' (' + fails.map(f => f.name).join(', ') + ')' : ''}`);

// ---------------------------------------------------------------------------
// Duración total de la tarea (a CONSOLA, nunca dentro del brandbook).
// Lee el sello de inicio que el skill escribió antes de tokens.json.
// ---------------------------------------------------------------------------
let stampPath = join(baseDir, '.sd-start');
if (!existsSync(stampPath) && existsSync('design/.sd-start')) stampPath = 'design/.sd-start';
if (existsSync(stampPath)) {
  try {
    const started = parseInt(String(readFileSync(stampPath, 'utf8')).trim(), 10);
    if (Number.isFinite(started)) {
      const total = (Date.now() - started) / 1000;
      console.log(`⏱ Duración total: ${total.toFixed(1)}s (desde la llamada al skill)`);
    }
  } catch { /* no romper por el sello */ }
  try { rmSync(stampPath, { force: true }); } catch { /* idem */ }
} else {
  console.log(`⏱ Duración del script: ${((Date.now() - scriptStart) / 1000).toFixed(1)}s (sello de inicio no encontrado)`);
}
