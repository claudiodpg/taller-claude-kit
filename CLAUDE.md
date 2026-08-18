# CLAUDE.md — <nombre del proyecto>

Reglas del proyecto. Se lee al inicio de cada sesión. El repo es la fuente canónica.

## Contrato humano ↔ Claude

- **El humano** define intención, restricciones, qué significa "bien", criterios de aceptación;
  aprueba decisiones importantes; evalúa evidencia; conserva la responsabilidad del resultado.
- **Claude** explora, propone, implementa, prueba, documenta y reporta evidencia.
- La IA acelera la ejecución. La responsabilidad sobre el resultado no cambia.
- **La evidencia determina si algo terminó**, no la afirmación del que construye.

## Antes de trabajar, lee

- `docs/spec/00-alcance.md`, `01-funcional.md`, `02-no-funcional.md`, `03-restricciones.md`
- `docs/arquitectura.md` (si ya existe)
- `ESTADO.md` (dónde quedó el trabajo y el próximo paso)

## Fuente canónica

El repo manda. La memoria automática de la conversación NO es canónica; si hay conflicto, gana lo
escrito en el repo. Lo importante vive fuera de la conversación.

## Convenciones

- <lenguaje / estilo / estructura de carpetas del proyecto>
- **Verificar antes de cerrar:** corre `/verificar`; nada se declara hecho sin evidencia.
- **Seguridad:** aplica `security-baseline` en todo endpoint con `id`, autenticación o input externo.
- **Diseño:** respeta los tokens y contratos de diseño; la implementación no debe derivar del diseño.

## Qué NO delegar sin aprobación humana

Autonomía proporcional a reversibilidad y riesgo. Requieren tu decisión: acciones destructivas,
producción, secretos/credenciales/permisos, cambios de arquitectura sensibles, aceptación funcional,
operaciones irreversibles, costos relevantes.

## Memoria

Índice en `memory/MEMORY.md` (una línea por hecho). Las decisiones importantes se registran ahí.
Aseo periódico con `/optimizar-memoria`. Estado y handoff en `ESTADO.md`.
