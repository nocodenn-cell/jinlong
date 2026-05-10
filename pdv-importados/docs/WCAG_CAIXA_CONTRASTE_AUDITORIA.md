# Auditoria de Contraste WCAG — Tela de Caixa

Data: 2026-05-07  
Escopo: componentes críticos do fluxo de caixa + modais e timeline (`header`, `search`, `status/banner`, `footer/total`, `botões de ação`, `CaixaMovimentacaoModal`, `CaixaGerenteModal`, `CaixaMovimentacoesTimeline`).  
Critério adotado: **WCAG 2.1 AA (texto normal >= 4.5:1)**.

## Metodologia objetiva

- Base de tema avaliada: `dark` ativo no layout global com `data-app-theme="noturno"`.
- Conversões usadas:
  - tokens HSL (`--card`, `--foreground`, `--muted-foreground`, `--primary`) para RGB;
  - classes com alpha (ex.: `text-foreground/85`, `bg-green-900/35`) por composição alfa sobre `bg-card`.
- Fórmula WCAG:
  - `contraste = (L1 + 0.05) / (L2 + 0.05)` com luminância relativa sRGB.

## Resultado antes/depois (pares críticos)

| Elemento (caixa) | Antes | Razão antes | Depois | Razão depois | Status |
|---|---|---:|---|---:|---|
| Texto auxiliar em superfícies de cartão | `text-muted-foreground` em `bg-card` | 7.80:1 | `text-foreground/85` em `bg-card` | 13.72:1 | Aprovado |
| Badge de status “Caixa aberto” | `text-green-400` em `bg-green-900/30` | 9.85:1 | `text-green-300` em `bg-green-900/35` | 11.88:1 | Aprovado |
| Ação de atenção (“Fechar”) | `text-yellow-400` em `bg-yellow-900/30` | 11.23:1 | `text-yellow-300` em `bg-yellow-900/35` | 12.62:1 | Aprovado |
| Ação de risco (remover parcela) | `text-red-300` em `bg-red-900/30` | 9.48:1 | `text-red-200` em `bg-red-900/35` | 12.11:1 | Aprovado |
| Banner de alerta | `text-amber-300` em fundo transparente da área | 13.87:1 | `text-amber-200` em `bg-amber-950/25` + borda | 15.41:1 | Aprovado |
| Total e valores chave | `text-primary` em `bg-card` | 19.12:1 | `text-primary` em `bg-card` (mantido) | 19.12:1 | Aprovado |

## Segunda rodada — modais e timeline

Componentes auditados:

- `app/caixa/CaixaMovimentacaoModal.tsx`
- `app/caixa/CaixaGerenteModal.tsx`
- `app/caixa/CaixaMovimentacoesTimeline.tsx`

Pares de contraste medidos:

| Elemento (modal/timeline) | Situação avaliada | Razão | Status |
|---|---|---:|---|
| Texto auxiliar `app-muted` | `app-muted` sobre fundo de modal/cartão escuro | 9.55:1 | Aprovado |
| Texto secundário `app-subtle` | `app-subtle` sobre fundo de modal/surface | 6.86:1 | Aprovado |
| Alerta local de validação | `app-badge-warn` (texto x fundo) | 8.20:1 | Aprovado |
| Estado de risco em badge | `app-badge-danger` (texto x fundo) | 11.72:1 | Aprovado |
| Estado positivo em badge | `app-badge-positive` (texto x fundo) | 11.78:1 | Aprovado |
| Texto de ênfase imperial | `app-accent-text` em fundo de modal escuro | 10.93:1 | Aprovado |

Correções aplicadas nesta rodada:

- Nenhuma correção adicional de contraste foi necessária.
- Todos os pares medidos nesta segunda rodada permanecem acima de **4.5:1**.

## Conclusão

- Nenhum par auditado ficou abaixo de **4.5:1** após os ajustes.
- Não há pendência de correção de contraste no escopo completo avaliado de `app/caixa`.
- As mudanças também elevaram a legibilidade operacional via tipografia (14px+ e maior peso em totais/status).

## Observação de governança

- A auditoria acima cobre os elementos de maior risco operacional da tela de caixa.
- Para expansão do escopo (modais auxiliares e timeline), repetir a mesma metodologia por par `texto x fundo` com amostragem por estado (`default`, `hover`, `disabled`, `warning`, `error`).
