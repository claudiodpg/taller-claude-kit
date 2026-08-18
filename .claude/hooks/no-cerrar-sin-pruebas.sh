#!/usr/bin/env bash
# Hook Stop: no dejar cerrar si las pruebas no pasan (candado contra el "falso verde").
# Cablea aquí el comando de verificación de TU proyecto. Por defecto: npm run verify.
# Ajusta VERIFY_CMD a tu stack (pytest / go test ./... / dotnet test, etc.).

set -uo pipefail
VERIFY_CMD="${AEOS_VERIFY_CMD:-npm run verify --silent}"

# Si el proyecto aún no tiene con qué verificar, no bloquear (etapas tempranas del taller).
if [ ! -f package.json ]; then
  exit 0
fi

if eval "$VERIFY_CMD" >/tmp/aeos-verify.out 2>&1; then
  exit 0
else
  # Salida bloqueante: se reporta el motivo y no se cierra.
  echo '{"decision":"block","reason":"No hay verde sin evidencia: las pruebas no pasan. Corre /verificar, revisa /tmp/aeos-verify.out y corrige antes de cerrar."}'
  exit 0
fi
