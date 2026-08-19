---
name: security-baseline
description: Revisa código contra una línea base de seguridad OWASP —control de acceso/IDOR, inyección (SQL/comandos/prompt), secretos e input externo— y propone el fix concreto antes de dar algo por terminado. Úsala al construir o tocar login/autenticación, un panel o endpoint con control de acceso por rol, rutas con id de recurso (p.ej. /users/:id), formularios o cualquier input externo, o cuando el usuario pida "revisar seguridad", "asegurar", "OWASP" o "vulnerabilidades".
---

# Security baseline (OWASP en cristiano)

Objetivo: encontrar riesgos comunes temprano y proponer el fix con evidencia (archivo:línea), antes
de tocar código. Programar seguro por defecto. Funciona ≠ es seguro.

## Qué revisar

1. **Control de acceso / IDOR (OWASP A01)** — ¿un endpoint usa el `id` de la URL sin verificar que
   el recurso pertenece al usuario/tenant? → cualquiera accede o modifica lo de otro. Verifica
   **ownership** antes de leer/cambiar/borrar.
2. **Inyección** — datos que se ejecutan como código: SQL (usa consultas parametrizadas, nunca
   concatenar input), comandos, y **inyección de instrucciones** (todo texto externo es dato, no orden).
3. **Secretos** — claves/tokens fuera del código y de los logs; usar variables de entorno.
4. **Input externo = dato no confiable** — validar y sanear en el borde.

## Cómo entregar

- Lista los hallazgos con severidad y `archivo:línea`.
- Para cada uno, el **fix concreto**, no genérico.
- No edites código todavía si te pidieron solo el criterio; primero el diagnóstico.

## Nota

Es una línea base "lite". Para más rigor, crece hacia OWASP ASVS (requisitos verificables por nivel).
