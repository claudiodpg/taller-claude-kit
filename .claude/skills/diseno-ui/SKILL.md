---
name: diseno-ui
description: Dirige el diseño de interfaces con criterio para que no parezca salida genérica de IA (referencias, design tokens, anti-slop, accesibilidad). Úsala al diseñar, construir o mejorar una pantalla, vista, componente, formulario, dashboard o layout, o cuando el usuario pida "diseñar la UI", "mejorar la interfaz", "que no se vea genérico", "design tokens" o "accesibilidad/contraste".
---

# Diseño UI dirigido

Objetivo: que el resultado tenga criterio de diseño, no el default de la IA. La skill aporta técnica;
la paleta y las decisiones son del humano.

## Método (repetible a mano)

1. **Dos referencias distintas**, no una que lo haga todo:
   - **Visual**: color y tipografía de un producto que gusta (cómo se ve).
   - **Funcional**: el patrón que resuelve el caso (cómo se comporta; p.ej. list-report + object-page
     para lista + detalle).
2. **Extrae tokens**: colores, tipografía y espaciados a variables reutilizables (CSS variables).
3. **Aplica anti-slop** (evita las 4 señales): burbujas anidadas, eyebrows por todos lados, circo
   tipográfico (usa 2–3 tamaños; jerarquía por peso/espaciado), exceso de color/marcos (base neutra
   + un acento).
4. **Densidad**: aprovecha el espacio, borde a borde, más dato útil, menos decoración.
5. **Accesibilidad medible**: contraste WCAG AA (4.5:1 texto normal, 3:1 texto grande) verificado por
   número, no a ojo.

## Preservar el diseño (anti-deriva)

- Deja los tokens y contratos de diseño **escritos y persistentes** (en el repo), no en el chat.
- Al construir, contrasta la implementación contra el diseño/maqueta; señala dónde derivó.

## Criterio > herramienta

El mismo requerimiento sin criterio da UI genérica; con referencias, tokens, restricciones y
accesibilidad da otra cosa. El criterio cambia el resultado.
