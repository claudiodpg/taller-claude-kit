# Mini-kit de desarrollo agéntico — Taller Claude

Un punto de partida real para trabajar con Claude con **método**: especificar, diseñar, construir,
verificar y asegurar, sin perder el control de lo que se construye. Es un **subconjunto** de un kit
mayor: solo trae las piezas que se usan en el taller. Cópialo a tu repo, úsalo y adáptalo.

> Idea de fondo: no se trata de obtener *más* código de Claude, sino de darle **más autonomía sin
> perder control**. Mayor velocidad → mayor necesidad de especificación, verificación y control.

## Qué trae

| Pieza | Tipo | Para qué |
|---|---|---|
| `especificar` | skill | Convierte un requerimiento en spec verificable (alcance, funcional + criterios, NFR) |
| `arquitectura` | skill | Propone capas/modelo de datos; tú evalúas |
| `diseno-ui` | skill | Dirige el diseño con criterio (referencias, tokens, accesibilidad, anti-slop) |
| `security-baseline` | skill | Revisa OWASP básico (permiso/IDOR, inyección, secretos) |
| `/verificar` | command | Corre build → tipos → lint → tests y te da evidencia |
| `/optimizar-memoria` | command | Poda/fusiona `CLAUDE.md` y `memory/` |
| `/sistema-diseno` | command | Le pasas una URL → extraes tokens ricos (escalas, pesos, escala tipográfica, espaciado, sombras) y los **pares de contraste reales** (fg/bg del sitio); un **script determinista** genera `tokens.css` + `brandbook.html` con tipografías **embebidas en base64** (autocontenido, offline) y contraste WCAG **del uso real** ("pares que fallan AA: N", no falso positivo), marca **propuesto vs observado**, **auto-versionado** en `design/<slug>/vN/` (rápido, pocos tokens) |
| `revisor` | subagente | Audita en contexto fresco (Builder ≠ Auditor) |
| `no-cerrar-sin-pruebas` | hook (Stop) | Bloquea cerrar si las pruebas no pasan |

Memoria permanente cableada (se llena por proyecto): `CLAUDE.md`, `docs/spec/00–03`,
`memory/MEMORY.md`, `ESTADO.md` (estado + handoff).

## Cómo se usa (resumen)

1. Copia el contenido de este kit a la raíz de tu proyecto (ver `INSTALL.md`).
2. Llena `docs/spec/` con `especificar`. `CLAUDE.md` ya apunta ahí.
3. Diseña con `arquitectura` y `diseno-ui`. Construye con plan mode.
4. Antes de dar algo por hecho: `/verificar` (el hook no te deja cerrar sin pruebas).
5. Audita con `revisor` y revisa seguridad con `security-baseline`.
6. Consolida: `/optimizar-memoria` + actualiza `ESTADO.md`.

## Principios que el kit hace cumplir

- **Criterio > herramienta.** El mismo modelo, mismo requerimiento, distinto criterio → distinto resultado.
- **No hay aprobado sin evidencia.** "Parece hecho" ≠ "está hecho".
- **Builder ≠ Auditor.** Quien construye no certifica.
- **Funciona ≠ cumple / ≠ es seguro.**

El kit es un **starter**: quítale lo que no uses y hazlo crecer hacia estándares completos
(ISO 25010, ASVS, ATAM…) cuando lo necesites.
