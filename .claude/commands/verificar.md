---
description: Corre las compuertas de calidad del proyecto (build, tipos, lint, tests) y reporta la evidencia real. Nada se declara hecho sin esto.
---

Ejecuta, en este orden, las compuertas de calidad de ESTE proyecto y **muéstrame la evidencia real**,
no un "se ve bien":

1. Build / compilación
2. Chequeo de tipos
3. Linter
4. Pruebas (di cuáles pasan y cuáles fallan, con el detalle)

Por defecto, corre `npm run verify` (que encadena typecheck + lint + test). Si este proyecto usa
otro stack, usa su equivalente (p.ej. `pytest`, `go test ./...`, `dotnet test`) — ajústalo en este
archivo.

Reglas:
- No cambies asserts ni tests para que "pasen". Un test que falla es información, repórtalo tal cual.
- Si algo falla, resume qué falló y dónde; no lo escondas.
- Termina con un veredicto claro: **APROBADO con evidencia** (todo pasó, con la salida) o **hay fallos**
  (lista). "No hay aprobado sin evidencia."
