#!/usr/bin/env node
// Hook UserPromptSubmit: sella el instante del ENVÍO del usuario cuando el prompt
// contiene "/sistema-diseno". Escribe .claude/.cache/sd-run.json con {id, inicioMs, prompt}.
// Así la duración se mide desde que Claudio manda el comando (no desde la primera acción
// del agente). El script (--fin) lee este sello, reporta la duración total y RECIÉN
// entonces lo borra. Si el hook no está instalado, el "paso 0" del command es el respaldo.
//
// No bloquea ni altera el prompt: solo escribe el sello y sale con 0.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }

let prompt = '';
try {
  const j = JSON.parse(raw);
  prompt = typeof j.prompt === 'string' ? j.prompt
    : (typeof j.user_prompt === 'string' ? j.user_prompt : raw);
} catch { prompt = raw; }

// Solo actúa si el envío usa el comando.
if (!/\/sistema-diseno/.test(prompt)) process.exit(0);

try {
  mkdirSync('.claude/.cache', { recursive: true });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  writeFileSync('.claude/.cache/sd-run.json', JSON.stringify({
    id,
    inicioMs: Date.now(),
    prompt: prompt.slice(0, 500),
    via: 'hook',
  }));
} catch { /* nunca romper el envío por el sello */ }

process.exit(0);
