---
name: especificar
description: Convierte un requerimiento vago en una especificación verificable (alcance, casos con criterios de aceptación, NFR) y la persiste en docs/spec/. Úsala al iniciar un proyecto o una funcionalidad nueva, antes de diseñar o codear, cuando el alcance o los criterios de aceptación no estén claros, o cuando el usuario pida "especificar", "definir alcance", "escribir requisitos" o "criterios de aceptación".
---

# Especificar

Objetivo: pasar de una idea vaga a un spec con el que se pueda construir Y verificar. Sin criterios
de aceptación, nada puede declararse "hecho".

## Cómo trabajar

1. **Primero pregunta, no escribas.** Haz las preguntas mínimas que falten para cerrar: quién usa
   esto, qué problema resuelve, qué SÍ / qué NO entra, estados y reglas clave, restricciones.
2. Cuando haya suficiente, **escribe en `docs/spec/`** (crea los archivos si no existen):
   - `00-alcance.md` — objetivo, qué SÍ / qué NO, involucrados.
   - `01-funcional.md` — casos de uso e historias, **cada una con criterios de aceptación
     verificables** (redacta lo comprobable, no lo vago).
   - `02-no-funcional.md` — NFR guiados por ISO 25010: seguridad, rendimiento, usabilidad,
     accesibilidad, fiabilidad, mantenibilidad (solo los que apliquen).
   - `03-restricciones.md` — supuestos, dependencias, decisiones.
3. Asegúrate de que `CLAUDE.md` apunte a `docs/spec/`.

## Reglas de un buen criterio de aceptación

- Verificable: "solo el dueño puede cambiar el estado; otro usuario recibe 403", no "que funcione bien".
- Observable: se puede convertir en una prueba (etapa de verificación) o en un chequeo de seguridad.
- Acotado: un criterio, una condición.

## No hagas

- No inventes requisitos que el usuario no confirmó.
- No pases a diseñar o codear hasta que el alcance y los criterios estén escritos y aprobados.
