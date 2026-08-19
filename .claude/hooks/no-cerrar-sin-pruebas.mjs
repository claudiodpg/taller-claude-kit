#!/usr/bin/env node
// Hook Stop cross-platform (Windows + macOS + Linux): no dejar cerrar si las pruebas no pasan.
// Candado contra el "falso verde". Corre con Node, que se comporta igual en cmd/PowerShell y en bash.
// Cablea aquí el comando de verificación de TU proyecto. Por defecto: npm run verify.
// Ajusta AEOS_VERIFY_CMD a tu stack (pytest / go test ./... / dotnet test, etc.).
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const VERIFY_CMD = process.env.AEOS_VERIFY_CMD || "npm run verify --silent";
const OUT = join(tmpdir(), "aeos-verify.out");

// Si el proyecto aún no tiene con qué verificar, no bloquear (etapas tempranas del taller).
if (!existsSync("package.json")) {
  process.exit(0);
}

try {
  const out = execSync(VERIFY_CMD, { stdio: ["ignore", "pipe", "pipe"] });
  writeFileSync(OUT, out);
  process.exit(0);
} catch (err) {
  // Guarda la salida real (stdout + stderr) para inspección; nunca inventes el resultado.
  const detail = `${err.stdout || ""}${err.stderr || ""}` || String(err.message || err);
  try {
    writeFileSync(OUT, detail);
  } catch {
    /* si no se puede escribir el log, igual bloqueamos */
  }
  // Salida bloqueante para el evento Stop: se reporta el motivo y no se cierra.
  const reason = `No hay verde sin evidencia: las pruebas no pasan. Corre /verificar, revisa ${OUT} y corrige antes de cerrar.`;
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}
