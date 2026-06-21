# Design System em Camadas — FastProduct

Consolidação das **3 eras de UI** (shadcn-classic, admin-v2 flat, dragon/oriental
glass) em **uma arquitetura única, orientada a tokens**.

> Decisão arquitetural: **core = shadcn-classic** (estrutura neutra) ·
> **default de produção = `commercial-gold`** (dashboard comercial) ·
> **admin-v2 → Operational Density Mode** (`data-density="compact"`) ·
> **dragon/oriental → skin premium** (`data-theme="dragon"`).

## Camadas

```
Core Layer        styles/ds/core.css      primitives crus (espaço, raio, tipo,
                                           motion, foco, z) + Density + a11y base.
                                           Sem marca, sem produto.
Theme Layer       styles/ds/themes.css    skins que SÓ preenchem tokens --ds-*:
                                           commercial-gold (default) | default | dragon.
                                           Nunca muda estrutura/comportamento.
Density Layer     (em core.css)           compact | default | spacious → ergonomia
                                           (altura de controle, spacing, tipografia).
Component Layer   styles/ds/components.css  .ds-* consumindo SÓ tokens.
                  components/ds/index.tsx   React: Button, Card, Field/Input, Select,
                                           Text, Stack, Grid, Badge, DSRoot.
Branding Layer    (override por escopo)    DSRoot aninhado com data-theme próprio;
                                           não pode quebrar a Component Layer.
```

## Regras de integridade (verificáveis)

- **Nenhum componente duplicado por tema** — 1 `Button`, 1 `Card`, 1 `Field`...
- **Nenhum hex hardcoded em UI** — componentes usam só `var(--ds-*)`.
- **Nenhuma lógica de produto na UI** — `Badge tone="success"` é visual; o mapa
  `status → tone` vive na camada de domínio, não aqui.
- **Todo visual resolvido por token** — trocar tema = trocar valores, não código.
- **Theme é só skin** — `DSRoot data-theme=...` nunca altera markup.

## Uso

```tsx
import { DSRoot, Button, Card, Field, Input } from '@/components/ds'

// produto inteiro nasce em commercial-gold (default em :root) — sem atributo.
// um trecho premium:
<DSRoot theme="dragon" density="compact">
  <Card elevation={2}>
    <Button variant="primary">Confirmar</Button>
  </Card>
</DSRoot>
```

Prova viva (troca tema/densidade ao vivo, markup idêntico): **`/ds-preview`**.

## Mapa de migração (legado → canônico)

| Era legada | Substituir por |
|---|---|
| `.app-btn-accent/neutral/danger`, `.admin-v2-btn-*`, `ui/button.tsx`, `ui/button-tokenized.tsx`, `bg-primary` | `<Button variant=...>` |
| `.dragon-glass-card`, `.admin-v2-section`, `ui/card.tsx` | `<Card elevation=...>` |
| `ui/MetricCard`, `admin-v2/MetricCard`, `ui/StatCard` | `<Card>` + composição (1 só) |
| `.app-input/.app-select`, `.gerente-fin-input`, `.admin-v2-input` | `<Field>` + `<Input>/<Select>` |
| `DragonModal` + `.dragon-glass-backdrop`, Sheets admin-v2 | `.ds-overlay-*` (Overlay único — próximo passo) |
| `ui/badge.tsx`, `ui/badges.tsx`, `GerenteStatusBadge`, `.app-badge-*` | `<Badge tone=...>` + mapa semântico de domínio |
| `--accent` (5 defs / 3 dourados) | `--ds-accent` (1 por tema) |
| `legacy/admin/*` | **deletar** |

## Status

- ✅ Fundação aditiva: Core + Theme + Density + Component Layer + prova `/ds-preview`.
- ✅ Não-destrutivo: sistemas legados continuam funcionando; migração é incremental.
- ⏳ Próximos passos (faseado por risco — ver auditoria): Overlay único; migrar
  tela-piloto (Recebimento) para `components/ds`; consolidar tabelas (headless +
  configs de coluna); unificar shells; remover `legacy/admin` e tokens `--accent`
  redundantes.

## Calibração do tema comercial

Os valores de `commercial-gold` (em `styles/ds/themes.css`) foram derivados do
ouro de marca + superfície escura do dashboard. São **o único ponto** a ajustar
para casar pixel-a-pixel com a referência comercial final — sem tocar componentes.
