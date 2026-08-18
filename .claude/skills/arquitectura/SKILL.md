---
name: arquitectura
description: Propone la arquitectura y el modelo de datos de un proyecto o módulo (capas, fronteras, dónde vive la lógica) para que el desarrollador la evalúe, y registra la decisión. Úsala al iniciar la construcción, al definir estructura de carpetas/capas o el esquema de datos, o cuando el usuario pida "arquitectura", "modelar datos" o "cómo estructurar".
---

# Arquitectura

Objetivo: proponer una estructura sensata **con su porqué** para que el humano la evalúe y corrija.
La arquitectura es una decisión de criterio, no un default de la IA.

## Cómo trabajar

1. **Lee `docs/spec/` primero.** Los NFR (seguridad, rendimiento) guían la estructura, no al revés.
2. Propón:
   - **Capas y fronteras**: UI / API / dominio (reglas de negocio) / datos. Qué vive dónde y qué no
     se mezcla (p.ej. la regla de negocio va en el dominio, no en el controlador).
   - **Modelo de datos**: entidades, campos, estados y transiciones válidas.
   - **Decisiones** con alternativas y trade-offs; prefiere las reversibles (no te encierres).
3. **Explica el porqué de cada decisión** antes de escribir código.
4. Registra el resultado en `docs/arquitectura.md` y las decisiones clave en `memory/MEMORY.md`.

## Postura

- Propones y sustentas; el desarrollador decide. Acepta que te cuestionen y ajusta.
- Mantén el alcance mínimo suficiente: no diseñes para requisitos que nadie pidió.
