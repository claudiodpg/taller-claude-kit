#!/usr/bin/env node
// Genera un sistema de diseño de forma DETERMINISTA a partir de un tokens.json.
// El LLM SOLO aporta criterio (mirar el sitio y decidir) y escribe tokens.json;
// TODO lo calculable —contraste, alternativas accesibles, HTML, CSS, subsetting de
// fuentes, tiempos— lo hace este script. Ningún campo acepta HTML del modelo: la prosa
// es texto plano y se escapa < > & (barrera anti-inyección desde el sitio inspeccionado).
//
// Salidas:
//  - tokens.css (variables CSS)
//  - brandbook.html (manual AUTOCONTENIDO, con tipografías embebidas en base64, subset latino)
//  - AUTO-VERSIONA: nunca sobrescribe; crea v1, v2, v3... y una copia "latest"
//
// El brandbook NO contiene timestamps ni número de versión: dos corridas del mismo
// tokens.json producen HTML byte a byte idéntico.
//
// Uso:
//   node .claude/scripts/sistema-diseno.mjs [ruta/tokens.json]   → genera
//   node .claude/scripts/sistema-diseno.mjs --fin                → cierra e imprime duración
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

const CACHE_DIR = '.claude/.cache';
const STAMP = join(CACHE_DIR, 'sd-run.json');   // {id, inicioMs, prompt, via}  (lo escribe el hook o el paso 0)
const LAST  = join(CACHE_DIR, 'sd-last.json');  // {id, slug, version, corridas, inicioMs, via, paths...}

const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const writeJson = (p, o) => { try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o)); } catch { /* no romper */ } };

// ---------------------------------------------------------------------------
// Formato de duración "3m 20.5s" / "20.5s"
// ---------------------------------------------------------------------------
function fmtDur(s) {
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m ${r.toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Subcomando --fin: lee el sello, calcula la duración, imprime el bloque de cierre,
// añade una línea a design/.sd-runs.jsonl y RECIÉN entonces borra el sello.
// Se llama UNA vez, justo antes del mensaje final (aunque el generador haya corrido
// dos veces en la misma tarea, la duración total es una sola).
// ---------------------------------------------------------------------------
if (process.argv.includes('--fin')) {
  const stamp = readJson(STAMP);
  const last = readJson(LAST);
  if (!last) {
    console.log('No hay una corrida registrada para cerrar. ¿Corriste el generador antes de --fin?');
    process.exit(0);
  }
  const inicioMs = (stamp && Number.isFinite(stamp.inicioMs)) ? stamp.inicioMs
    : (Number.isFinite(last.inicioMs) ? last.inicioMs : Date.now());
  const via = (stamp && stamp.via) || last.via || 'generador';
  const finMs = Date.now();
  const duracionS = Math.round(((finMs - inicioMs) / 1000) * 10) / 10;
  const nota = via === 'hook'
    ? 'desde el envío del comando hasta la generación del cierre'
    : 'desde la primera acción del agente (hook no instalado)';

  // Bloque de cierre EXACTO (va en el chat, nunca dentro del brandbook).
  console.log(`1. CSS ......... ${last.cssVer}`);
  console.log(`2. Brandbook ... ${last.htmlVer}   (latest: ${last.htmlLatest})`);
  console.log(`3. Duración .... ${fmtDur(duracionS)}  (${nota})`);

  // Registro histórico.
  const jsonl = join(last.baseDir || 'design', '.sd-runs.jsonl');
  try {
    appendFileSync(jsonl, JSON.stringify({
      slug: last.slug, version: last.version,
      inicioMs, finMs, duracionS, corridasScript: last.corridas || 1,
    }) + '\n');
  } catch { /* no romper por el registro */ }

  // Recién ahora se borra el sello (y el estado de la última corrida).
  try { rmSync(STAMP, { force: true }); } catch { /* idem */ }
  try { rmSync(LAST, { force: true }); } catch { /* idem */ }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------
const inPath = process.argv[2] || 'design/tokens.json';
let data;
try { data = JSON.parse(readFileSync(inPath, 'utf8')); }
catch (e) { console.error(`No pude leer ${inPath}: ${e.message}\nEscribe primero tokens.json (ver la descripción del command).`); process.exit(1); }

// Entrada normalizada (todo opcional salvo que se indique; degradación elegante).
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

// Tokens marcados como "propuesto" (no observados). Array de nombres css-var SIN "--".
const propuestoSet = new Set(
  (Array.isArray(data.propuesto) ? data.propuesto : [])
    .map(s => String(s).replace(/^--/, '').trim().toLowerCase())
);
const esProp = name => propuestoSet.has(String(name).replace(/^--/, '').trim().toLowerCase());

// Slug determinista (data.slug > data.name > data.site).
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
// WCAG contrast — se COMPARA SIEMPRE el ratio CRUDO contra el umbral.
// Solo al IMPRIMIR se trunca (Math.floor a 2 decimales), nunca se redondea, para
// no mostrar jamás un número que sugiera un cumplimiento inexistente
// (p. ej. 2.998242 con large:true FALLA y se muestra 2.99, no 3).
// ---------------------------------------------------------------------------
const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const c = String(hex).replace('#', '').padStart(6, '0');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const t2 = n => Math.floor(n * 100) / 100;                 // trunca para IMPRIMIR
const passAA = (rawR, large = false) => rawR >= (large ? 3 : 4.5); // compara CRUDO
const isHex = v => /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(String(v || '').trim());
const bestText = bg => (ratio(bg, '#FFFFFF') >= ratio(bg, '#000000') ? '#FFFFFF' : '#111111');
function normHex(h) {
  let c = String(h || '').trim().replace('#', '').toLowerCase();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  return '#' + c;
}
const rgb = hex => { const c = normHex(hex).slice(1); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
const dist = (h1, h2) => { const a = rgb(h1), b = rgb(h2); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
const mix = (hex, target, tt) => { const a = rgb(hex), b = rgb(target); return toHex([0, 1, 2].map(i => a[i] + (b[i] - a[i]) * tt)); };

// Color seguro para inline-style (evita CSS-injection desde el sitio inspeccionado).
const col = (v, fb = '#000000') => isHex(v) ? normHex(v).toUpperCase() : fb;
// Valor CSS libre saneado (gradientes, tamaños, sombras): sin caracteres de escape.
const sty = v => String(v == null ? '' : v).replace(/[<>"'{}\\;]/g, '').slice(0, 200);
// Prosa a una línea, longitud limitada.
const oneLine = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// --- Pares REALES fg/bg (la combinación que el sitio de verdad usa) ----------
function pairRow(p) {
  const fg = String(p.fg || '').trim();
  const bg = String(p.bg || '').trim();
  const large = !!p.large;
  const rawR = ratio(fg, bg);              // CRUDO para comparar
  const need = large ? 3 : 4.5;
  return {
    fg, bg, uso: p.uso || '', large,
    ratio: t2(rawR),                        // truncado para IMPRIMIR
    rawR, need, aa: rawR >= need,
    nota: p.nota ? oneLine(p.nota, 200) : '',
  };
}
const pairsRaw = Array.isArray(data.pairs) ? data.pairs : [];
const pairs = pairsRaw.filter(p => p && isHex(p.fg) && isHex(p.bg)).map(pairRow);
const pairsFail = pairs.filter(p => !p.aa);
const findPairForBg = bg => pairs.find(p => normHex(p.bg) === normHex(bg));

// Alternativa accesible automática para un par que falla: tono de la MISMA familia
// más cercano al original que sí alcance el umbral; si no hay escalas, deriva el color
// oscureciéndolo/aclarándolo en pasos de 5% hasta pasar (marcado como tono derivado).
function suggestAlt(p) {
  const need = p.large ? 3 : 4.5;
  const fg = normHex(p.fg), bg = normHex(p.bg);
  // 1) Basado en escalas: encuentra la familia de fg y elige el tono más cercano que pase.
  let fam = null;
  for (const [f, steps] of Object.entries(colorScales)) {
    for (const v of Object.values(steps)) { if (isHex(v) && normHex(v) === fg) { fam = f; break; } }
    if (fam) break;
  }
  if (fam) {
    const cands = Object.values(colorScales[fam]).filter(isHex).map(normHex)
      .filter(v => ratio(v, bg) >= need);
    if (cands.length) {
      cands.sort((a, b) => (dist(a, fg) - dist(b, fg)) || (a < b ? -1 : 1));
      const best = cands[0];
      return { hex: best.toUpperCase(), ratio: t2(ratio(best, bg)), fromPalette: true, fam };
    }
  }
  // 2) Derivado: mezcla hacia negro/blanco en pasos de 5%; se elige el más cercano que pase.
  let dark = null, light = null;
  for (let i = 1; i <= 20; i++) {
    const s = i * 0.05;
    if (!dark)  { const c = mix(fg, '#000000', s); if (ratio(c, bg) >= need) dark = { hex: c, s }; }
    if (!light) { const c = mix(fg, '#FFFFFF', s); if (ratio(c, bg) >= need) light = { hex: c, s }; }
  }
  let pick = null;
  if (dark && light) pick = (dark.s <= light.s) ? dark : light;
  else pick = dark || light;
  if (pick) return { hex: pick.hex, ratio: t2(ratio(pick.hex, bg)), fromPalette: false };
  return null;
}

// --- Referencia SECUNDARIA: mejor texto posible por color (no es el uso real) -
function contrastRow(name, hex) {
  const tw = ratio(hex, '#FFFFFF'), tb = ratio(hex, '#000000');
  const txt = bestText(hex), bestRaw = ratio(hex, txt);
  return { name, hex, tw: t2(tw), tb: t2(tb), txt, best: t2(bestRaw), aa: passAA(bestRaw) };
}
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
// Embebido de tipografías (Google Fonts → woff2 base64), quedándose SOLO con el
// subset pedido (por defecto "latin") para que el archivo pese poco. Configurable
// con fonts.subsets:["latin","latin-ext"]. Un fallo de red NUNCA rompe la generación.
// ---------------------------------------------------------------------------
const subsetsWanted = new Set(
  (Array.isArray(fonts.subsets) && fonts.subsets.length ? fonts.subsets : ['latin'])
    .map(s => String(s).toLowerCase())
);
const fontNotes = [];
function googleFamily(name, weights) {
  const ws = (weights && weights.length ? [...new Set(weights)].sort((a, b) => a - b) : [400, 700]).join(';');
  return `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${ws}`;
}
function buildFontPlan() {
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
    // Bloques @font-face con el subset comentado justo antes (/* latin */, /* latin-ext */…).
    const blocks = [];
    const re = /\/\*\s*([^*]+?)\s*\*\/\s*(@font-face\s*{[\s\S]*?})/g;
    let m;
    while ((m = re.exec(cssText)) !== null) blocks.push({ subset: m[1].trim().toLowerCase(), block: m[2] });
    if (!blocks.length) {
      const re2 = /@font-face\s*{[\s\S]*?}/g; let m2;
      while ((m2 = re2.exec(cssText)) !== null) blocks.push({ subset: '', block: m2[0] });
    }
    // Conserva SOLO los subsets pedidos (por defecto latin); descarta cyrillic/greek/vietnamese/etc.
    const keep = blocks.filter(b => !b.subset || subsetsWanted.has(b.subset));
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
const fontFallbackImport = (fontPlan.param && !fontEmbedded) ? fontPlan.importUrl : '';

// ---------------------------------------------------------------------------
// brandbook.html — AUTOCONTENIDO. Toda la prosa se ESCAPA (anti-inyección).
// ---------------------------------------------------------------------------
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const propTag = name => esProp(name) ? ' <span class="prop">propuesto</span>' : '';

// --- Prosa opcional (H): resumen, noDeterminado, notas, muestrasTexto ---------
const resumen = data.resumen && typeof data.resumen === 'object' ? data.resumen : null;
const resumenHtml = resumen && (resumen.estilo || resumen.descripcion)
  ? `<div class="resumen-estilo">${resumen.estilo ? `<b>${esc(oneLine(resumen.estilo, 120))}</b> ` : ''}${resumen.descripcion ? esc(oneLine(resumen.descripcion, 400)) : ''}</div>`
  : '';

const noDet = Array.isArray(data.noDeterminado) ? data.noDeterminado : [];
const noDetSection = noDet.length
  ? `<h2>No determinado — el sitio no lo define</h2>
<p class="sub">Dimensiones que <b>no</b> pudieron observarse en el sitio; no se inventaron valores. Distinto de <span class="prop">propuesto</span> (ahí sí se sugiere un valor).</p>
<div class="nodef">${noDet.map(n => `<div class="nodef-item"><b>${esc(oneLine(n.que || '', 80))}</b>${n.detalle ? `<span>${esc(oneLine(n.detalle, 240))}</span>` : ''}</div>`).join('')}</div>`
  : '';

const ALLOWED_SEC = new Set(['resumen', 'paleta', 'tipografia', 'componentes', 'contraste', 'logo', 'general']);
const notasAll = (Array.isArray(data.notas) ? data.notas : []).slice(0, 8)
  .filter(n => n && ALLOWED_SEC.has(String(n.seccion || '').toLowerCase()))
  .map(n => ({
    seccion: String(n.seccion).toLowerCase(),
    tono: String(n.tono || 'info').toLowerCase() === 'aviso' ? 'aviso' : 'info',
    titulo: oneLine(n.titulo || '', 120),
    texto: oneLine(n.texto || '', 300),
  }));
function notasDe(sec) {
  return notasAll.filter(n => n.seccion === sec)
    .map(n => `<div class="${n.tono === 'aviso' ? 'warn' : 'note'}">${n.titulo ? `<b>${esc(n.titulo)}</b> ` : ''}${esc(n.texto)}</div>`)
    .join('');
}

const muestrasTexto = (data.muestrasTexto && typeof data.muestrasTexto === 'object') ? data.muestrasTexto : {};
function sampleText(name) {
  const k = String(name).toLowerCase();
  if (muestrasTexto[k] != null && String(muestrasTexto[k]).trim()) return oneLine(muestrasTexto[k], 120);
  return `${name} — Diseñar con criterio`;
}

// --- Swatches y escalas ------------------------------------------------------
const swatch = r => `
  <div class="sw">
    <div class="chip" style="background:${col(r.hex)};color:${r.txt}">${esc(r.hex)}</div>
    <div class="meta">
      <b>${esc(r.name)}${propTag('color-' + r.name)}</b>
      <span>mejor texto ${r.txt === '#FFFFFF' ? 'blanco' : 'negro'} · ${r.best}:1 ${r.aa ? '✓' : '✗'} <em>(posible, no el uso real)</em></span>
    </div>
  </div>`;

function scaleStrip(fam, steps) {
  const cells = Object.entries(steps).filter(([, v]) => isHex(v)).map(([k, v]) => {
    const txt = bestText(v), bestRaw = ratio(v, txt);
    return `<div class="step" style="background:${col(v)};color:${txt}"><span>${esc(k)}</span><small>${esc(v)}</small><small>${t2(bestRaw)}:1 ${passAA(bestRaw) ? '✓' : '✗'}</small></div>`;
  }).join('');
  return `<div class="scale"><h3>${esc(fam)}</h3><div class="steps">${cells}</div></div>`;
}

// Botón de referencia (fallback sin pairs): usa el mejor texto y rotula la verdad.
function btnDemo(bg, label = 'Botón') {
  const p = findPairForBg(bg);
  const txt = p ? p.fg : bestText(bg);
  const need = p && p.large ? 3 : 4.5;
  const rawR = ratio(txt, bg);
  const pass = rawR >= need;
  const rad = radii.boton || radiiScale.md || '8px';
  const tag = p ? 'uso real' : 'sugerido, no el uso real';
  return `<div class="btnwrap">
    <button style="background:${col(bg)};color:${col(txt)};border:0;border-radius:${sty(rad)};padding:.6rem 1.1rem;font:600 14px var(--font-cuerpo);cursor:pointer">${esc(label)}</button>
    <small class="btnmeta ${pass ? 'ok' : 'bad'}">${t2(rawR)}:1 ${pass ? '✓ AA' : '✗ falla AA'} · ${esc(tag)}</small>
  </div>`;
}

// Botón desde un par REAL (fg/bg del sitio).
function btnFromPair(p) {
  const need = p.large ? 3 : 4.5;
  const rawR = ratio(p.fg, p.bg);
  const pass = rawR >= need;
  const rad = radii.boton || radiiScale.md || '8px';
  return `<div class="btnwrap">
    <button style="background:${col(p.bg)};color:${col(p.fg)};border:0;border-radius:${sty(rad)};padding:.6rem 1.1rem;font:600 14px var(--font-cuerpo);cursor:pointer">Botón</button>
    <small class="btnmeta ${pass ? 'ok' : 'bad'}">${t2(rawR)}:1 ${pass ? '✓ AA' : '✗ falla AA'} · uso real${p.uso ? ' · ' + esc(p.uso) : ''}</small>
  </div>`;
}

// Tipografía.
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
  <div style="font:${sty(weight)} ${sty(size)}/${sty(lh || 1.2)} ${fam}">${esc(sampleText(name))}</div></div>`;
}

const weightsBlock = (label, ws) => (ws && ws.length)
  ? `<div class="weights"><b>${esc(label)}</b> ${[...new Set(ws)].sort((a, b) => a - b).map(w => `<span style="font-weight:${w};font-family:var(--font-${/titulo|título/i.test(label) ? 'titulo' : 'cuerpo'})">${w}</span>`).join('')}</div>`
  : '';

function radiusBox(k, v) {
  return `<div class="rbox"><div class="rdemo" style="border-radius:${sty(v)}"></div><code>--radio-${esc(k)}</code><small>${esc(v)}${propTag('radio-' + k)}</small></div>`;
}
function spaceBar(k, v) {
  return `<div class="spitem"><span class="spbar" style="width:${sty(v)}"></span><code>--espacio-${esc(k)}</code><small>${esc(v)}${propTag('espacio-' + k)}</small></div>`;
}
function shadowBox(k, v) {
  return `<div class="shbox" style="box-shadow:${sty(v)}"><code>--sombra-${esc(k)}</code></div>`;
}
function gradientBox(k, v) {
  return `<div class="gbox" style="background:${sty(v)}"><code>--gradiente-${esc(k)}</code></div>`;
}

const section = (cond, title, body) => cond ? `<h2>${title}</h2>\n${body}\n` : '';

// --- Sección de pares reales (el titular de contraste va aquí) ---------------
function pairCard(p) {
  const alt = p.aa ? null : suggestAlt(p);
  const altHtml = p.aa ? ''
    : (alt
        ? `<span class="alt">alternativa sugerida: <code>${esc(alt.hex)}</code> (${alt.ratio}:1)${alt.fromPalette ? '' : ' <em>tono derivado, no de la paleta</em>'}</span>`
        : `<span class="alt">sin alternativa cambiando solo el texto; revisa el fondo</span>`);
  const notaHtml = p.nota ? `<span class="pairnota">${esc(p.nota)}</span>` : '';
  return `<div class="pair ${p.aa ? 'ok' : 'bad'}">
    <div class="pairswatch" style="background:${col(p.bg)};color:${col(p.fg)}">Aa</div>
    <div class="pairmeta">
      <b>${p.ratio}:1 ${p.aa ? '✓ AA' : '✗ falla AA'}</b>
      <span class="mono">${esc(p.fg)} sobre ${esc(p.bg)}${p.large ? ' · texto grande' : ''}</span>
      ${p.uso ? `<span class="uso">${esc(p.uso)}</span>` : ''}
      ${altHtml}
      ${notaHtml}
    </div>
  </div>`;
}
const pairsSection = pairs.length
  ? `<h2>Contraste en uso real (pares)</h2>
<p class="sub">Combinaciones fg/bg tal como el sitio las usa. Umbral AA: 4.5:1 (texto normal), 3:1 (texto grande). <b>Este es el número que importa</b>, no el "mejor texto posible".</p>
${pairsFail.length
    ? `<div class="warn"><b>Pares que fallan AA: ${pairsFail.length}</b><ul>${pairsFail.map(p => {
        const alt = suggestAlt(p);
        return `<li><code>${esc(p.fg)}</code> sobre <code>${esc(p.bg)}</code> — <b>${p.ratio}:1</b>${p.uso ? ' · ' + esc(p.uso) : ''}${alt ? ` → alternativa <code>${esc(alt.hex)}</code> (${alt.ratio}:1)${alt.fromPalette ? '' : ', tono derivado' }` : ''}</li>`;
      }).join('')}</ul></div>`
    : `<div class="okbox"><b>Pares que fallan AA: 0</b> — todas las combinaciones reales evaluadas pasan.</div>`}
<div class="grid pairs">${pairs.map(pairCard).join('')}</div>`
  : `<h2>Contraste en uso real (pares)</h2>
<div class="warn">No se dieron los pares reales del sitio (campo <code>pairs</code> en tokens.json); el AA que se muestra abajo es del <b>mejor texto posible</b>, <b>no del uso real</b>. Captura las combinaciones fg/bg que el sitio usa de verdad (texto del botón sobre su fondo, texto del menú, primario-como-texto…) para medir el contraste verdadero.</div>`;

// --- Botones desde pairs (o fallback a claves fijas solo si NO hay pairs) -----
const buttonPairs = pairs.filter(p => /bot[oó]n|button/i.test(p.uso || ''));
let btnHtml;
if (buttonPairs.length) {
  btnHtml = buttonPairs.map(btnFromPair).join('');
} else if (!pairs.length) {
  btnHtml = `${colors.primario ? btnDemo(colors.primario, 'Primario') : ''}${colors.acento ? btnDemo(colors.acento, 'Acento') : ''}${colors['primario-oscuro'] ? btnDemo(colors['primario-oscuro'], 'Oscuro') : ''}`;
} else {
  btnHtml = `<p class="sub">No se identificaron pares de botón en <code>pairs</code> (ningún <code>uso</code> menciona "botón"). Añade uno para ver la muestra con el color real.</p>`;
}

// --- Usos reales (plantilla por tipo; el LLM da datos, el script dibuja) ------
function tituloStyle(t) {
  const color = col((t && t.color) || '#111111');
  const size = sty((t && t.size) || '28px');
  const weight = sty(String((t && t.weight) || 700));
  return `font:${weight} ${size}/1.15 var(--font-titulo);color:${color}`;
}
function usoBarra(u) {
  const bg = col(u.bg || '#ffffff'), fg = col(u.fg || '#111111');
  const items = (Array.isArray(u.items) ? u.items : []).slice(0, 8).map(i => `<span>${esc(oneLine(i, 40))}</span>`).join('');
  const cta = u.cta ? `<button style="background:${col(u.cta.bg || '#000000')};color:${col(u.cta.fg || '#ffffff')};border:0;border-radius:8px;padding:.4rem .9rem;font:600 13px var(--font-cuerpo)">${esc(oneLine(u.cta.texto || 'CTA', 24))}</button>` : '';
  return `<div class="uso-barra" style="background:${bg};color:${fg}"><b style="font-family:var(--font-titulo)">${esc(oneLine(u.marca || 'Marca', 24))}</b><nav>${items}</nav>${cta}</div>`;
}
function usoHero(u) {
  const fondo = sty(u.fondo || '#f4f4f4');
  const t = u.titulo || {};
  const sub = u.subtitulo ? `<p style="margin:.6rem 0 0;color:${col(u.subColor || '#333333')};max-width:44ch">${esc(oneLine(u.subtitulo, 160))}</p>` : '';
  return `<div class="uso-hero" style="background:${fondo}"><div class="hero-in"><div style="${tituloStyle(t)}">${esc(oneLine(t.texto || 'Título del hero', 80))}</div>${sub}</div></div>`;
}
function usoFooter(u) {
  const bg = col(u.bg || '#111111'), fg = col(u.fg || '#ffffff');
  return `<div class="uso-footer" style="background:${bg};color:${fg}">${esc(oneLine(u.texto || '© Pie de página', 160))}</div>`;
}
function usoCard(u) {
  const bg = col(u.bg || '#ffffff');
  const radio = sty(u.radio || radii.card || radiiScale.lg || '12px');
  const somRaw = u.sombra ? (shadows[u.sombra] || u.sombra) : (shadows.md || '0 4px 12px rgba(0,0,0,.12)');
  const som = sty(somRaw);
  const t = u.titulo || {}, c = u.cuerpo || {};
  const titulo = `<div style="${tituloStyle({ texto: t.texto, color: t.color || '#111111', size: t.size || '18px', weight: t.weight || 700 })}">${esc(oneLine(t.texto || 'Título', 60))}</div>`;
  const cuerpo = `<p style="margin:.4rem 0 0;color:${col(c.color || '#444444')};font-size:${sty(c.size || '14px')}">${esc(oneLine(c.texto || 'Cuerpo de la tarjeta.', 160))}</p>`;
  return `<div class="uso-card" style="background:${bg};border-radius:${radio};box-shadow:${som}">${titulo}${cuerpo}</div>`;
}
const usos = Array.isArray(data.usos) ? data.usos : [];
function usoBlock(u) {
  switch (String((u && u.tipo) || '').toLowerCase()) {
    case 'barra':  return usoBarra(u);
    case 'hero':   return usoHero(u);
    case 'footer': return usoFooter(u);
    case 'card':   return usoCard(u);
    default:       return '';
  }
}
const usosSection = usos.length
  ? `<h2>Usos reales</h2>
<p class="sub">Composiciones típicas del sitio, dibujadas con los colores y tokens reales.</p>
<div class="usos">${usos.map(usoBlock).join('')}</div>`
  : '';

// --- Qué NO es marca ---------------------------------------------------------
const noMarca = Array.isArray(data.noMarca) ? data.noMarca : [];
const noMarcaSection = noMarca.length
  ? `<h2>Qué NO es marca</h2>
<p class="sub">Valores presentes en el sitio que <b>no</b> son decisiones de marca (temas por defecto de frameworks, resets…). No los tomes como tokens.</p>
<table><thead><tr><th>Valor</th><th>Origen</th><th>Nota</th></tr></thead><tbody>
${noMarca.map(n => `<tr><td><code>${esc(oneLine(n.valor || '', 80))}</code></td><td>${esc(oneLine(n.origen || '', 80))}</td><td>${esc(oneLine(n.nota || '', 160))}</td></tr>`).join('')}
</tbody></table>`
  : '';

// --- Resumen ejecutivo (4 líneas) — siempre presente -------------------------
const resumenEjec = `<div class="resumen-ejec">
  <div><b>Tipografía</b> título ${esc(fTitulo)} · cuerpo ${esc(fCuerpo)}</div>
  <div><b>Primario</b> ${esc(colors.primario || '—')}</div>
  <div><b>Acento</b> ${esc(colors.acento || '—')}</div>
  <div><b>Pares que fallan AA</b> ${pairs.length ? String(pairsFail.length) : 's/d (sin pares)'}</div>
</div>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brandbook · ${esc(data.site || slug)}</title>
<style>${fontFaceCss ? fontFaceCss + '\n' : ''}${fontFallbackImport ? fontFallbackImport + '\n' : ''}${css}
*{box-sizing:border-box} body{margin:0;font:16px/1.5 var(--font-cuerpo);color:${colors.texto || '#111'};background:${colors.fondo || '#fff'};padding:2.5rem clamp(1rem,5vw,4rem);max-width:1120px;margin:0 auto}
h1{font:700 34px var(--font-titulo);margin:0 0 .2rem} h2{font:700 20px var(--font-titulo);margin:2.6rem 0 .8rem;border-bottom:1px solid #e5e5e5;padding-bottom:.3rem}
h3{font:600 15px var(--font-titulo);margin:1rem 0 .5rem}
.sub{color:${colors['texto-muted'] || '#666'};margin:0 0 1.2rem;max-width:70ch}
.resumen-ejec{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.5rem 1.2rem;background:#f7f7f8;border:1px solid #eaeaea;border-radius:10px;padding:.9rem 1.1rem;margin:.4rem 0 1rem;font-size:14px} .resumen-ejec b{display:block;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;color:#888;font-weight:700}
.resumen-estilo{margin:.2rem 0 1rem;max-width:75ch;font-size:14.5px;color:#333}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.9rem}
.sw{border:1px solid #eaeaea;border-radius:10px;overflow:hidden} .chip{padding:1.6rem .8rem;font:600 13px var(--font-cuerpo)}
.meta{padding:.6rem .8rem;font-size:12.5px;display:flex;flex-direction:column;gap:.15rem} .meta span{color:#777} .meta em{color:#999;font-style:normal}
.pairs{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pair{display:flex;gap:.7rem;align-items:flex-start;border:1px solid #eaeaea;border-radius:10px;padding:.6rem;border-left-width:4px}
.pair.ok{border-left-color:#2f9e44} .pair.bad{border-left-color:#e03131}
.pairswatch{flex:0 0 auto;width:56px;height:56px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 20px var(--font-titulo)}
.pairmeta{display:flex;flex-direction:column;gap:.15rem;font-size:12.5px} .pairmeta b{font-size:13px} .pairmeta .mono{color:#777;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px} .pairmeta .uso{color:#555}
.pairmeta .alt{color:#b5480f;font-weight:600} .pairmeta .alt em{color:#a06a3a;font-weight:400;font-style:normal} .pairmeta .pairnota{color:#777;font-style:italic}
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
.usos{display:flex;flex-direction:column;gap:1rem}
.uso-barra{display:flex;align-items:center;gap:1rem;padding:.7rem 1.1rem;border-radius:10px} .uso-barra nav{display:flex;gap:1rem;flex-wrap:wrap;flex:1;font-size:14px} .uso-barra nav span{opacity:.95}
.uso-hero{border-radius:12px;padding:2.4rem 1.6rem;min-height:150px;display:flex;align-items:center} .hero-in{max-width:60ch}
.uso-footer{border-radius:10px;padding:1.4rem 1.2rem;font-size:14px}
.uso-card{max-width:340px;padding:1.1rem 1.2rem}
table{border-collapse:collapse;width:100%;font-size:14px} td,th{border-bottom:1px solid #eee;padding:.5rem .6rem;text-align:left}
.warn{background:#fff4e6;border:1px solid #f0c98a;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;font-size:14px} .warn ul{margin:.4rem 0 0;padding-left:1.2rem} .warn li{margin:.15rem 0}
.okbox{background:#ebfbee;border:1px solid #a3d9b1;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;font-size:14px}
.note{background:#eef6ff;border:1px solid #bcd8f5;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;font-size:14px}
.nodef{display:flex;flex-direction:column;gap:.4rem} .nodef-item{border-left:3px solid #cbd5e1;padding:.3rem .7rem;font-size:14px} .nodef-item b{margin-right:.4rem} .nodef-item span{color:#666}
.prop{display:inline-block;background:#f3e8ff;color:#7a3fb0;border:1px solid #dcc3f0;border-radius:5px;padding:0 .35rem;font-size:10.5px;font-weight:600;vertical-align:middle;margin-left:.25rem}
.samples>*{margin:.3rem 0} code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}
.legend{color:#888;font-size:12.5px;margin:.4rem 0 0}
</style></head><body>
<h1>Brandbook</h1>
<p class="sub">Sistema de diseño de <b>${esc(data.site || slug)}</b> · generado automáticamente · título ${esc(fTitulo)} · cuerpo ${esc(fCuerpo)}. Marca <span class="prop">propuesto</span> = valor no observado en el sitio, sugerido por el kit.</p>
${resumenEjec}
${resumenHtml}
${notasDe('resumen')}
${fontFallbackImport ? `<div class="warn"><b>Fuentes por conexión (no se pudieron embeber).</b> Se usa <code>@import</code> a Google Fonts; el brandbook requiere red para verse con las tipografías correctas.${fontEmbedError ? ` <small>(${esc(fontEmbedError)})</small>` : ''}</div>` : ''}
${fontEmbedded ? '<div class="note"><b>Fuentes embebidas</b> (base64, subset latino): el brandbook es autocontenido y se abre sin conexión.</div>' : ''}
${(!fontPlan.param && !fontFaceCss && !fontFallbackImport) ? '<div class="note">Tipografías de sistema (no hay fuentes web que embeber).</div>' : ''}
${fontNotes.length ? `<div class="note"><b>Fuentes:</b> ${fontNotes.map(esc).join(' ')}</div>` : ''}

${pairsSection}
${notasDe('contraste')}

<h2>Paleta</h2>
<div class="grid">${rows.map(swatch).join('')}</div>
<p class="legend">Referencia secundaria: el "mejor texto posible" por color (blanco o negro) — <b>no es el par que el sitio usa</b>. El contraste real está arriba, en los pares.</p>
${fails.length ? `<div class="warn"><b>Referencia secundaria:</b> ${fails.length} color(es) no alcanzan AA ni con su mejor texto posible: ${fails.map(f => `${esc(f.name)} (${f.best}:1)`).join(', ')}. Úsalos para acentos/gráficos, no para texto pequeño.</div>` : ''}
${notasDe('paleta')}

${section(Object.keys(colorScales).length, 'Escalas de color (50 → 900)',
  Object.entries(colorScales).map(([fam, steps]) => scaleStrip(fam, steps)).join(''))}

<h2>Tipografía</h2>
<div class="samples">${typeSamples.map(typeSampleRow).join('')}</div>
${weightsBlock('Título', fontWeights.titulo)}
${weightsBlock('Cuerpo', fontWeights.cuerpo)}
<p style="max-width:60ch;margin-top:.8rem">Cuerpo — ${esc(fCuerpo)}. El zorro veloz salta sobre el perro perezoso. 0123456789.</p>
${notasDe('tipografia')}

<h2>Botones y componentes</h2>
<p class="sub">Cada botón muestra su combinación de color REAL (par fg/bg) con su ratio y AA. Un ✗ significa que el sitio usa un contraste que no pasa AA.</p>
<div class="samples" style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:flex-start">
  ${btnHtml}
</div>
<div style="margin-top:1.2rem;padding:1.1rem 1.2rem;max-width:360px;border:1px solid #eaeaea;border-radius:${sty(radii.card || radiiScale.lg || '12px')};${shadows.md ? 'box-shadow:' + sty(shadows.md) : ''}">
  <b style="font-family:var(--font-titulo)">Card de ejemplo</b>
  <p class="sub" style="margin:.3rem 0 0">Usa radio de card y una sombra del sistema.</p>
</div>
${notasDe('componentes')}

${usosSection}

${section(Object.keys(radii).length + Object.keys(radiiScale).length, 'Radios',
  `<div class="rowbox">${[...Object.entries(radii), ...Object.entries(radiiScale)].map(([k, v]) => radiusBox(k, v)).join('')}</div>`)}

${section(Object.keys(spacing).length, 'Espaciado',
  `<div>${Object.entries(spacing).map(([k, v]) => spaceBar(k, v)).join('')}</div>`)}

${section(Object.keys(shadows).length, 'Sombras',
  `<div>${Object.entries(shadows).map(([k, v]) => shadowBox(k, v)).join('')}</div>`)}

${section(Object.keys(gradients).length, 'Gradientes',
  `<div>${Object.entries(gradients).map(([k, v]) => gradientBox(k, v)).join('')}</div>`)}

${section(logo.nota || logo.url, 'Logo',
  `<div class="note">${logo.nota ? esc(logo.nota) + ' ' : ''}${logo.url ? `Referencia: <code>${esc(logo.url)}</code>` : ''}</div>${notasDe('logo')}`)}

${noMarcaSection}

${noDetSection}

<h2>Tokens</h2>
<table><thead><tr><th>Token</th><th>Valor</th><th>Estado</th><th>Mejor texto (posible, no uso real)</th></tr></thead><tbody>
${rows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${esProp('color-' + r.name) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${scaleRows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${esProp('color-' + r.name) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${Object.entries(typeScale).map(([k, v]) => {
  const t = typeof v === 'object' ? v : { size: v };
  const out = [];
  const tokRow = (name, val) => `<tr><td>--${esc(name)}</td><td><code>${esc(val)}</code></td><td>${esProp(name) ? '<span class="prop">propuesto</span>' : 'observado'}</td><td>—</td></tr>`;
  if (t.size)       out.push(tokRow(`fs-${k}`, t.size));
  if (t.lineHeight) out.push(tokRow(`lh-${k}`, t.lineHeight));
  if (t.weight)     out.push(tokRow(`fw-${k}`, t.weight));
  return out.join('');
}).join('')}
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
${notasDe('general')}

<p class="sub" style="margin-top:2rem">Los tokens reutilizables están en <code>tokens.css</code>. Pásaselos a Claude para diseñar tus pantallas con este sistema.</p>
</body></html>`;

// ---------------------------------------------------------------------------
// Auto-versionado determinista (nunca sobrescribe). Acepta tokens.json en
// design/tokens.json O en design/<slug>/tokens.json (F1): en ambos casos la base
// de salida es "design/".
// ---------------------------------------------------------------------------
const dirOfIn = dirname(inPath);
const baseDir = (basename(dirOfIn) === slug) ? dirname(dirOfIn) : dirOfIn;
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
// copia "latest"
writeFileSync(join(siteDir, 'tokens.css'), css);
writeFileSync(join(siteDir, 'brandbook.html'), html);

const htmlVer = join(verDir, 'brandbook.html');
const cssVer = join(verDir, 'tokens.css');
const htmlLatest = join(siteDir, 'brandbook.html');
const cssLatest = join(siteDir, 'tokens.css');

// ---------------------------------------------------------------------------
// Bookkeeping de sello para --fin (NO borra el sello; eso lo hace --fin).
// El sello lo escribe el hook (UserPromptSubmit) o el paso 0 del command; si no
// existe, el generador crea uno propio (via:"generador") para que --fin funcione.
// ---------------------------------------------------------------------------
mkdirSync(CACHE_DIR, { recursive: true });
let stamp = readJson(STAMP);
if (!stamp || !Number.isFinite(stamp.inicioMs)) {
  stamp = { id: 'gen-' + Date.now(), inicioMs: Date.now(), prompt: '', via: 'generador' };
  writeJson(STAMP, stamp);
}
const prevLast = readJson(LAST);
const corridas = (prevLast && prevLast.id === stamp.id) ? (prevLast.corridas || 0) + 1 : 1;
writeJson(LAST, {
  id: stamp.id, slug, version: nextV, corridas,
  inicioMs: stamp.inicioMs, via: stamp.via,
  baseDir, htmlVer, cssVer, htmlLatest, cssLatest,
});

// ---------------------------------------------------------------------------
// Salida (para que el agente reporte sin adivinar)
// ---------------------------------------------------------------------------
console.log('SISTEMA DE DISEÑO GENERADO');
console.log(`  site: ${data.site || slug}  ·  slug: ${slug}  ·  versión: v${nextV}${maxV ? ` (antes v1..v${maxV})` : ''}`);
console.log('  versión nueva:');
console.log('    ' + htmlVer);
console.log('    ' + cssVer);
console.log('    ' + join(verDir, 'tokens.json'));
console.log('  latest (siempre la última):');
console.log('    ' + htmlLatest + '   (ábrelo con:  open ' + htmlLatest + ')');
console.log('    ' + cssLatest);
console.log(`  tipografías: ${fontEmbedded ? 'embebidas en base64, subset ' + [...subsetsWanted].join('+') + ' (autocontenido)' : (fontFallbackImport ? 'por conexión @import (no se pudieron embeber' + (fontEmbedError ? ': ' + fontEmbedError : '') + ')' : 'de sistema / externas (nada que embeber)')}`);

if (pairs.length) {
  console.log(`Pares reales evaluados: ${pairs.length} · que fallan AA: ${pairsFail.length}`);
  for (const p of pairsFail) {
    const alt = suggestAlt(p);
    console.log(`  ✗ ${p.fg} sobre ${p.bg} — ${p.ratio}:1${p.uso ? ' (' + p.uso + ')' : ''}${alt ? ` → alternativa ${alt.hex} (${alt.ratio}:1)${alt.fromPalette ? '' : ', derivada'}` : ''}`);
  }
} else {
  console.log('⚠ Sin "pairs" en tokens.json: el AA por-swatch NO es el uso real del sitio. Añade pairs (fg/bg) para medir el contraste verdadero.');
}
console.log(`Colores planos: ${rows.length} · en escalas: ${scaleRows.length} · referencia secundaria (no alcanzan AA ni con su mejor texto): ${fails.length}${fails.length ? ' (' + fails.map(f => f.name).join(', ') + ')' : ''}`);
console.log('Cierre: corre  node .claude/scripts/sistema-diseno.mjs --fin  antes del mensaje final para reportar la duración total.');
