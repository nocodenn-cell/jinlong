# Contratos do Design System (Fase 1)

> Fase 1 do roadmap **Design System + Estabilidade**: congelar contratos para que
> mudanças pequenas não quebrem o sistema inteiro. A UI consome contratos — ela
> não "sabe" o tema.

Fonte única de verdade: [`lib/theme/contract.ts`](../../lib/theme/contract.ts).
Enforcement automatizado: [`scripts/design-system-guard.mjs`](../../../scripts/design-system-guard.mjs)
(roda em `npm run guard:all`, antes do build no CI).

Relação com a Fase 0 (Layout Compiler, PR #119): o modo escuro foi **removido**,
não apenas desativado. O sistema é travado em um único tema claro
("clássico" / "cara de Bling"), com **azul Bling `#2563eb`** como destaque.

---

## 1.1 Contrato de tema

Os nomes de tema válidos vivem **apenas** no contrato. Eixos:

| Eixo | Atributo DOM | Valores válidos | Aplicado hoje |
| --- | --- | --- | --- |
| App (global) | `data-app-theme` | `classico` (claro), `noturno` (legado/fallback) | **`classico`** |
| Gerente | `data-gerente-ui-theme` | `dragon-light` | **`dragon-light`** |

```ts
import { type Theme, type AppTheme, isTheme } from '@/lib/theme/contract'
// AppTheme = 'classico' | 'noturno'
// Theme    = 'classico' | 'noturno' | 'dragon-light'
```

- **Tema único claro:** o app inicia SEMPRE claro, com **azul** como destaque.
  O `dragon-dark` foi **aposentado** na Fase 0 — não existe mais no sistema de
  tipos. `noturno` permanece como nome legado apenas em seletores CSS de
  fallback (resolve para os mesmos tokens claros); não é selecionável.
- A marca **`dragon`** é legítima (DragonPOS): cores `--color-dragon-*` e a
  variante `tone="dragon"` permanecem. O guard **não** bloqueia `dragon`.

## 1.2 Contrato de tokens (UI base)

A UI base consome estes tokens — a superfície estável que cada tema preenche:

```
--surface · --surface-text · --accent · --border
```

Ver `UI_CONTRACT_TOKENS` no contrato. Tokens específicos de tema
(`--color-dragon-*`, `--jl-*`) continuam existindo; a migração de `--jl-*` →
tokens semânticos é **Fase 2** e não está bloqueada aqui.

## 1.3 Contrato de variantes visuais

Variantes de tema/superfície são tipadas a partir do contrato em vez de strings
inline. Exemplo hoje em uso:

```ts
import type { GerenteSurfaceTone } from '@/lib/theme/contract'
// 'paper' | 'dragon'  — usado por GerenteTable / TabelaCadastroPadrao
```

## Guardrail de exaustividade (3.2)

Use `assertNever` no `default` de `switch`/`if` sobre tema ou variante: adicionar
um membro novo ao union sem tratá-lo passa a **falhar no build**.

```ts
import { assertNever } from '@/lib/theme/contract'
switch (tone) {
  case 'paper':  return /* … */
  case 'dragon': return /* … */
  default:       return assertNever(tone)
}
```

---

## Enforcement (Fase 3.1)

`scripts/design-system-guard.mjs`, em dois tiers sobre `components/` e `app/`:

1. **Hard block (falha sempre):** uso de aliases legados `*-oriental-*`
   no código de UI (hoje: zero ocorrências). As definições legadas em
   `styles/*.css` aguardam remoção na Fase 2.
2. **Ratchet (falha só se aumentar):** cores hardcoded em className arbitrário
   (`bg-[#…]`, `border-[#…]`, …). Baseline atual: **79** ocorrências. O número só
   pode diminuir — cores novas são bloqueadas; limpar o baseline é Fase 2.

> Ao remover cores hardcoded, **atualize `HEX_BASELINE`** no guard para o novo total.
