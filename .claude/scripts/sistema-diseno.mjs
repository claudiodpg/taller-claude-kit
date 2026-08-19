#!/usr/bin/env node
// Genera un sistema de diseño de forma DETERMINISTA a partir de design/tokens.json:
//  - calcula ratios de contraste WCAG,
//  - escribe design/tokens.css (variables CSS),
//  - escribe design/brandbook.html (manual de diseño autocontenido).
// El LLM solo produce tokens.json (la parte con criterio); esto es puro mecanismo → 0 tokens.
// Uso:  node .claude/scripts/sistema-diseno.mjs [ruta/tokens.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const inPath = process.argv[2] || 'design/tokens.json';
let data;
try { data = JSON.parse(readFileSync(inPath, 'utf8')); }
catch (e) { console.error(`No pude leer ${inPath}: ${e.message}\nEscribe primero design/tokens.json (ver la descripción del command).`); process.exit(1); }

const outDir = dirname(inPath);
const fonts = data.fonts || {};
const colors = data.colors || {};
const radii = data.radii || {};
const spacing = data.spacing || {};
const fTitulo = fonts.titulo || fonts.cuerpo || 'system-ui';
const fCuerpo = fonts.cuerpo || fTitulo;

// --- WCAG contrast ---
const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const c = String(hex).replace('#', '').padStart(6, '0');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const r2 = n => Math.round(n * 100) / 100;
const passAA = (r, large = false) => r >= (large ? 3 : 4.5);
// para un color de fondo, el texto (blanco/negro) que mejor contrasta
const bestText = bg => (ratio(bg, '#FFFFFF') >= ratio(bg, '#000000') ? '#FFFFFF' : '#111111');

// --- tokens.css ---
const cssVars = [
  `  --font-titulo: '${fTitulo}', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;`,
  `  --font-cuerpo: '${fCuerpo}', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;`,
  ...Object.entries(colors).map(([k, v]) => `  --color-${k}: ${v};`),
  ...Object.entries(radii).map(([k, v]) => `  --radio-${k}: ${v};`),
  ...Object.entries(spacing).map(([k, v]) => `  --espacio-${k}: ${v};`),
];
const css = `/* Sistema de diseño extraído de ${data.site || 'un sitio de ejemplo'} — generado por sistema-diseno.mjs */\n:root {\n${cssVars.join('\n')}\n}\n`;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tokens.css'), css);

// --- reporte de contraste ---
const rows = Object.entries(colors).map(([name, hex]) => {
  const tw = r2(ratio(hex, '#FFFFFF')), tb = r2(ratio(hex, '#000000'));
  const txt = bestText(hex), best = r2(ratio(hex, txt));
  return { name, hex, tw, tb, txt, best, aa: passAA(best) };
});
const fails = rows.filter(r => !r.aa);

// --- brandbook.html (autocontenido) ---
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const swatch = r => `
  <div class="sw">
    <div class="chip" style="background:${r.hex};color:${r.txt}">${r.hex}</div>
    <div class="meta">
      <b>${esc(r.name)}</b>
      <span>texto ${r.txt === '#FFFFFF' ? 'blanco' : 'negro'} · ${r.best}:1 ${r.aa ? '✓ AA' : '✗ falla AA'}</span>
    </div>
  </div>`;
const btnDemo = (bg) => `<button style="background:${bg};color:${bestText(bg)};border:0;border-radius:${radii.boton || '8px'};padding:.6rem 1.1rem;font:600 14px var(--font-cuerpo)">Botón</button>`;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brandbook · ${esc(data.site || 'sistema de diseño')}</title>
<style>${css}
*{box-sizing:border-box} body{margin:0;font:16px/1.5 var(--font-cuerpo);color:${colors.texto || '#111'};background:${colors.fondo || '#fff'};padding:2.5rem clamp(1rem,5vw,4rem)}
h1{font:700 34px var(--font-titulo);margin:0 0 .2rem} h2{font:700 20px var(--font-titulo);margin:2.2rem 0 .8rem;border-bottom:1px solid #e5e5e5;padding-bottom:.3rem}
.sub{color:${colors['texto-muted'] || '#666'};margin:0 0 1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.9rem}
.sw{border:1px solid #eaeaea;border-radius:10px;overflow:hidden} .chip{padding:1.6rem .8rem;font:600 13px var(--font-cuerpo)}
.meta{padding:.6rem .8rem;font-size:12.5px;display:flex;flex-direction:column;gap:.15rem} .meta span{color:#777}
table{border-collapse:collapse;width:100%;font-size:14px} td,th{border-bottom:1px solid #eee;padding:.5rem .6rem;text-align:left}
.warn{background:#fff4e6;border:1px solid #f0c98a;border-radius:8px;padding:.8rem 1rem;margin:.5rem 0;font-size:14px}
.samples>*{margin:.3rem 0}
</style></head><body>
<h1>Brandbook</h1>
<p class="sub">Sistema de diseño de <b>${esc(data.site || 'un sitio de ejemplo')}</b> · generado automáticamente · tipografía ${esc(fTitulo)}</p>

<h2>Paleta</h2>
<div class="grid">${rows.map(swatch).join('')}</div>
${fails.length ? `<div class="warn"><b>Contraste:</b> ${fails.length} color(es) no alcanzan AA como fondo de texto: ${fails.map(f => `${f.name} (${f.best}:1)`).join(', ')}. Úsalos para acentos/gráficos, no para texto pequeño.</div>` : ''}

<h2>Tipografía</h2>
<div class="samples">
  <div style="font:700 40px var(--font-titulo)">Título — ${esc(fTitulo)}</div>
  <div style="font:600 24px var(--font-titulo)">Subtítulo</div>
  <p style="max-width:60ch">Cuerpo — ${esc(fCuerpo)}. El zorro veloz salta sobre el perro perezoso. 0123456789.</p>
</div>

<h2>Botones</h2>
<div class="samples" style="display:flex;gap:.7rem;flex-wrap:wrap">
  ${colors.primario ? btnDemo(colors.primario) : ''}
  ${colors.acento ? btnDemo(colors.acento) : ''}
</div>

<h2>Tokens</h2>
<table><thead><tr><th>Token</th><th>Valor</th><th>Contraste (mejor texto)</th></tr></thead><tbody>
${rows.map(r => `<tr><td>--color-${esc(r.name)}</td><td><code>${r.hex}</code></td><td>${r.best}:1 ${r.aa ? '✓' : '✗'}</td></tr>`).join('')}
${Object.entries(radii).map(([k, v]) => `<tr><td>--radio-${esc(k)}</td><td><code>${esc(v)}</code></td><td>—</td></tr>`).join('')}
</tbody></table>
<p class="sub" style="margin-top:2rem">Los tokens reutilizables están en <code>tokens.css</code>. Pásaselos a Claude para diseñar tus pantallas con este sistema.</p>
</body></html>`;
writeFileSync(join(outDir, 'brandbook.html'), html);

// --- salida (para que el agente reporte sin adivinar) ---
const p1 = join(outDir, 'tokens.css'), p2 = join(outDir, 'brandbook.html');
console.log('SISTEMA DE DISEÑO GENERADO');
console.log('  ' + p1);
console.log('  ' + p2 + '   (ábrelo con:  open ' + p2 + ')');
console.log(`Colores: ${rows.length} · fallan AA como fondo de texto: ${fails.length}${fails.length ? ' (' + fails.map(f => f.name).join(', ') + ')' : ''}`);
