# `@/ui` — Design System (Fundação / Fase 0)

Ponto de entrada único da UI. Páginas em `app/` e `features/` importam **apenas** daqui.

```ts
import { Button, Card, Badge, colors, spacing, radius } from "@/ui"
```

## Estrutura

```
src/ui/
  tokens/         # decisões visuais em TS (sem React) — Sprint A
    colors.ts     #   cores semânticas via var(--token) + hex primitivos p/ canvas
    spacing.ts
    radius.ts
    typography.ts
    shadows.ts
  index.ts        # entrada única: tokens + primitives — Sprint C
```

## Regras

1. **Tokens não têm React.** São referências `var(--token)` que o CSS
   (`styles/tokens/*.css`) resolve em runtime. Use `colors.*` em `style={{}}`
   ou em libs que não enxergam Tailwind (gráficos em canvas → `primitiveHex`).
2. **Primitives já existentes foram adotados**, não reescritos (Button, Badge,
   Card, Input, Skeleton de `@/components/ui`). Reexportados aqui para dar um
   boundary estável. Novos primitives entram quando houver ≥2 usos reais.
3. **Cor literal só dentro de `src/ui/**`.** Fora disso, `bg-[#...]`,
   `text-[#...]` e afins são barrados pela catraca `guard:ui`.

## Enforcement (Sprint D)

`npm run guard:ui` é uma **catraca de regressão**: conta cores Tailwind
hardcoded fora de `src/ui` e falha se o total subir acima da baseline
(`scripts/ui-tailwind-guard.baseline.json`). Roda no CI de `pdv-importados`.

- Migrou um arquivo e baixou a contagem? `npm run guard:ui:update` trava a
  nova baseline (mais baixa), impedindo retrocesso.
- Não é "limpeza global": as 79 violações atuais migram incrementalmente,
  sprint a sprint, sem quebrar o build.
