#!/usr/bin/env node
// Genera un sistema de diseño de forma DETERMINISTA a partir de un tokens.json:
//  - calcula ratios de contraste WCAG (colores planos y escalas 50..900),
//  - escribe tokens.css (variables CSS),
//  - escribe brandbook.html (manual de diseño autocontenido, con tipografías embebidas),
//  - AUTO-VERSIONA: nunca sobrescribe; crea v1, v2, v3... y una copia "latest".
// El LLM solo produce tokens.json (la parte con criterio); esto es puro mecanismo → 0 tokens.
// Uso:  node .claude/scripts/sistema-diseno.mjs [ruta/tokens.json]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

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
// Embebido de tipografías (Google Fonts vía @import; si no, se documenta)
// ---------------------------------------------------------------------------
const fontNotes = [];
function googleFamily(name, weights) {
  const ws = (weights && weights.length ? [...new Set(weights)].sort((a, b) => a - b) : [400, 700]).join(';');
  return `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${ws}`;
}
function buildFontImport() {
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
  if (!fams.length) return '';
  return `@import url('https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap');`;
}
const fontImport = buildFontImport();

// ---------------------------------------------------------------------------
// brandbook.html (autocontenido; único enlace externo posible: Google Fonts)
// ---------------------------------------------------------------------------
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const swatch = r => `
  <div class="sw">
    <div class="chip" style="background:${r.hex};color:${r.txt}">${esc(r.hex)}</div>
    <div class="meta">
      <b>${esc(r.name)}</b>
      <span>texto ${r.txt === '#FFFFFF' ? 'blanco' : 'negro'} · ${r.best}:1 ${r.aa ? '✓ AA' : '✗ falla AA'}</span>
    </div>
  </div>`;

function scaleStrip(fam, steps) {
  const cells = Object.entries(steps).filter(([, v]) => isHex(v)).map(([k, v]) => {
    const txt = bestText(v), best = r2(ratio(v, txt));
    return `<div class="step" style="background:${v};color:${txt}"><span>${esc(k)}</span><small>${esc(v)}</small><small>${best}:1 ${passAA(best) ? '✓' : '✗'}</small></div>`;
  }).join('');
  return `<div class="scale"><h3>${esc(fam)}</h3><div class="steps">${cells}</div></div>`;
}

const btnDemo = (bg, label = 'Botón') => `<button style="background:${bg};color:${bestText(bg)};border:0;border-radius:${radii.boton || radiiScale.md || '8px'};padding:.6rem 1.1rem;font:600 14px var(--font-cuerpo);cursor:pointer">${esc(label)}</button>`;

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
  const lhCss = lh ? `line-height:${lh};` : '';
  return `<div class="tsample"><div class="tmeta"><code>${esc(name)}</code><span>${esc(size)} · ${esc(String(weight))}${lh ? ' · lh ' + esc(String(lh)) : ''}</span></div>
  <div style="font:${weight} ${size}/${lh || 1.2} ${fam}">${esc(name)} — Diseñar con criterio</div></div>`;
}

const weightsBlock = (label, ws) => (ws && ws.length)
  ? `<div class="weights"><b>${esc(label)}</b> ${[...new Set(ws)].sort((a, b) => a - b).map(w => `<span style="font-weight:${w};font-family:var(--font-${/titulo|título/i.test(label) ? 'titulo' : 'cuerpo'})">${w}</span>`).join('')}</div>`
  : '';

function radiusBox(k, v) {
  return `<div class="rbox"><div class="rdemo" style="border-radius:${esc(v)}"></div><code>--radio-${esc(k)}</code><small>${esc(v)}</small></div>`;
}
function spaceBar(k, v) {
  return `<div class="spitem"><span class="spbar" style="width:${esc(v)}"></span><code>--espacio-${esc(k)}</code><small>${esc(v)}</small></div>`;
}
function shadowBox(k, v) {
  return `<div class="shbox" style="box-shadow:${esc(v)}"><code>--sombra-${esc(k)}</code></div>`;
}
function gradientBox(k, v) {
  return `<div class="gbox" style="background:${esc(v)}"><code>--gradiente-${esc(k)}</code></div>`;
}

const section = (cond, title, body) => cond ? `<h2>${title}</h2>\n${body}\n` : '';

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brandbook · ${esc(data.site || slug)}</title>
<style>${fontImport ? fontImport + '\n' : ''}${css}
*{box-sizing:border-box} body{margin:0;font:16px/1.5 var(--font-cuerpo);color:${colors.texto || '#111'};background:${colors.fondo || '#fff'};padding:2.5rem clamp(1rem,5vw,4rem)}
h1{font:700 34px var(--font-titulo);margin:0 0 .2rem} h2{font:700 20px var(--font-titulo);margin:2.4rem 0 .8rem;border-bottom:1px solid #e5e5e5;padding-bottom:.3rem}
h3{font:600 15px var(--font-titulo);margin:1rem 0 .5rem}
.sub{color:${colors['texto-muted'] || '#666'};margin:0 0 1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.9rem}
.sw{border:1px solid #eaeaea;border-radius:10px;overflow:hidden} .chip{padding:1.6rem .8rem;font:600 13px var(--font-cuerpo)}
.meta{padding:.6rem .8rem;font-size:12.5px;display:flex;flex-direction:column;gap:.15rem} .meta span{color:#777}
.scale{margin:.4rem 0 1.1rem} .steps{display:flex;flex-wrap:wrap;gap:2px;border-radius:10px;overflow:hidden}
.step{flex:1 1 70px;min-width:70px;padding:.7rem .4rem;display:flex;flex-direction:column;gap:.1rem;font-size:11px}
.step span{font-weight:700} .step small{opacity:.85}
.tsample{padding:.5rem 0;border-bottom:1px solid #f0f0f0} .tmeta{display:flex;gap:.6rem;align-items:baseline;margin-bottom:.2rem} .tmeta span{color:#888;font-size:12px}
.weights{margin:.6rem 0;display:flex;gap:.9rem;align-items:baseline;flex-wrap:wrap} .weights span{font-size:20px}
.rowbox{display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end}
.rbox{text-align:center;font-size:12px} .rdemo{width:64px;height:64px;background:${colors.primario || '#14A797'};margin:0 auto .3rem} .rbox small{display:block;color:#888}
.spitem{display:flex;align-items:center;gap:.7rem;margin:.35rem 0;font-size:12px} .spbar{display:inline-block;height:14px;background:${colors.acento || colors.primario || '#E85829'};border-radius:3px} .spitem small{color:#888}
.shbox{display:inline-flex;align-items:flex-end;justify-content:center;width:130px;height:90px;margin:.6rem 1rem .6rem 0;background:#fff;border-radius:12px;padding:.5rem;font-size:11px;color:#666}
.gbox{display:inline-flex;align-items:flex-end;width:180px;height:90px;margin:.6rem 1rem .6rem 0;border-radius:12px;padding:.5rem;color:#fff;font-size:11px}
.gbox code,.shbox code{background:rgba(255,255,255,.75);color:#222;padding:.1rem .35rem;border-radius:4px}
table{border-collapse:collapse;width:100%;font-size:14px} td,th{border-bottom:1px solid #eee;padding:.5rem .6rem;text-align:left}
.warn{background:#fff4e6;border:1px solid #f0c98a;border-radius:8px;padding:.8rem 1rem;margin:.5rem 0;font-size:14px}
.note{background:#eef6ff;border:1px solid #bcd8f5;border-radius:8px;padding:.8rem 1rem;margin:.5rem 0;font-size:14px}
.samples>*{margin:.3rem 0} code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}
</style></head><body>
<h1>Brandbook</h1>
<p class="sub">Sistema de diseño de <b>${esc(data.site || slug)}</b> · generado automáticamente · título ${esc(fTitulo)} · cuerpo ${esc(fCuerpo)}</p>
${fontImport ? '' : '<div class="note">Tipografías no embebidas vía Google Fonts; se usan las de sistema como respaldo.</div>'}
${fontNotes.length ? `<div class="note"><b>Fuentes:</b> ${fontNotes.map(esc).join(' ')}</div>` : ''}

<h2>Paleta</h2>
<div class="grid">${rows.map(swatch).join('')}</div>
${fails.length ? `<div class="warn"><b>Contraste:</b> ${fails.length} color(es) no alcanzan AA como fondo de texto: ${fails.map(f => `${esc(f.name)} (${f.best}:1)`).join(', ')}. Úsalos para acentos/gráficos, no para texto pequeño.</div>` : ''}

${section(Object.keys(colorScales).length, 'Escalas de color (50 → 900)',
  Object.entries(colorScales).map(([fam, steps]) => scaleStrip(fam, steps)).join(''))}

<h2>Tipografía</h2>
<div class="samples">${typeSamples.map(typeSampleRow).join('')}</div>
${weightsBlock('Título', fontWeights.titulo)}
${weightsBlock('Cuerpo', fontWeights.cuerpo)}
<p style="max-width:60ch;margin-top:.8rem">Cuerpo — ${esc(fCuerpo)}. El zorro veloz salta sobre el perro perezoso. 0123456789.</p>

<h2>Botones y componentes</h2>
<div class="samples" style="display:flex;gap:.7rem;flex-wrap:wrap;align-items:center">
  ${colors.primario ? btnDemo(colors.primario, 'Primario') : ''}
  ${colors.acento ? btnDemo(colors.acento, 'Acento') : ''}
  ${colors['primario-oscuro'] ? btnDemo(colors['primario-oscuro'], 'Oscuro') : ''}
</div>
<div style="margin-top:1rem;padding:1.1rem 1.2rem;max-width:360px;border:1px solid #eaeaea;border-radius:${radii.card || radiiScale.lg || '12px'};${shadows.md ? 'box-shadow:' + esc(shadows.md) : ''}">
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
<table><thead><tr><th>Token</th><th>Valor</th><th>Contraste (mejor texto)</th></tr></thead><tbody>
${rows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${scaleRows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${[...Object.entries(radii), ...Object.entries(radiiScale)].map(([k, v]) => `<tr><td>--radio-${esc(k)}</td><td><code>${esc(v)}</code></td><td>—</td></tr>`).join('')}
${Object.entries(spacing).map(([k, v]) => `<tr><td>--espacio-${esc(k)}</td><td><code>${esc(v)}</code></td><td>—</td></tr>`).join('')}
${Object.entries(shadows).map(([k, v]) => `<tr><td>--sombra-${esc(k)}</td><td><code>${esc(v)}</code></td><td>—</td></tr>`).join('')}
${Object.entries(gradients).map(([k, v]) => `<tr><td>--gradiente-${esc(k)}</td><td><code>${esc(v)}</code></td><td>—</td></tr>`).join('')}
</tbody></table>

<h2>Reporte de contraste (WCAG AA)</h2>
<table><thead><tr><th>Color</th><th>Hex</th><th>vs blanco</th><th>vs negro</th><th>Mejor</th><th>AA</th></tr></thead><tbody>
${allRows.map(r => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.hex)}</code></td><td>${r.tw}:1</td><td>${r.tb}:1</td><td>${r.best}:1 (texto ${r.txt === '#FFFFFF' ? 'blanco' : 'negro'})</td><td>${r.aa ? '✓ AA' : '✗'}</td></tr>`).join('')}
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
console.log(`Colores planos: ${rows.length} · en escalas: ${scaleRows.length} · fallan AA como fondo de texto: ${fails.length}${fails.length ? ' (' + fails.map(f => f.name).join(', ') + ')' : ''}`);
