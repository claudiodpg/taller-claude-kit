# Instalar y arrancar el mini-kit

No hay instalador: es copiar carpetas. Todo vive en archivos del repo (versionado, compartido por git).

## 1. Copiar el kit a tu proyecto

Desde la raíz de tu repo, copia el contenido del kit (incluye la carpeta oculta `.claude/`):

```bash
cp -R ruta/al/mini-kit/.claude .
cp -R ruta/al/mini-kit/docs .
cp -R ruta/al/mini-kit/memory .
cp ruta/al/mini-kit/CLAUDE.md ruta/al/mini-kit/ESTADO.md .
```

**Windows (PowerShell):**
```powershell
Copy-Item ruta\al\mini-kit\.claude . -Recurse
Copy-Item ruta\al\mini-kit\docs . -Recurse
Copy-Item ruta\al\mini-kit\memory . -Recurse
Copy-Item ruta\al\mini-kit\CLAUDE.md,ruta\al\mini-kit\ESTADO.md .
```

Estructura resultante en tu proyecto:
```
.claude/skills/…   .claude/commands/…   .claude/agents/…   .claude/settings.json
CLAUDE.md   docs/spec/…   memory/MEMORY.md   ESTADO.md
```

## 2. Activar

- **Skills:** se auto-invocan por su descripción. Reinicia Claude Code para que las detecte.
- **Commands:** se llaman por su nombre: `/verificar`, `/optimizar-memoria`.
- **Subagente `revisor`:** se despacha cuando pides una auditoría independiente.
- **Hook `no-cerrar-sin-pruebas`:** ya está cableado en `.claude/settings.json`. Requiere que tu
  proyecto tenga un script de pruebas (ver más abajo).

> Nota de rutas: en Windows la ruta es la misma con backslash: `.claude\skills\`, `.claude\commands\`.
> El formato exacto de hooks/permissions puede cambiar entre versiones de Claude Code; ver
> `../CLAUDE-TECH-ACCURACY.md` para lo vigente.

## 3. Cablear `/verificar` y el hook a TU stack

`/verificar` y el hook llaman a las compuertas de calidad de tu proyecto. Ajusta el comando en:
- `.claude/commands/verificar.md` (qué corre)
- `.claude/hooks/no-cerrar-sin-pruebas.sh` (qué valida al cerrar)

Por defecto asumen `npm run verify` (typecheck + lint + test). Cámbialo por el de tu lenguaje
(p.ej. `pytest`, `go test ./...`, `dotnet test`).
