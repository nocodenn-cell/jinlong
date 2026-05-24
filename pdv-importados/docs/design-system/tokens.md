# Dragon UI — Token Reference

> **Versão:** 1.0 · **Escopo:** `app/caixa/`, `app/gerente/`, `components/caixa/`, `components/gerente/`
> **Boundary:** Admin (`app/admin/`) usa tema light separado — ver [BOUNDARY.md](./BOUNDARY.md)

---

## Surfaces (fundos)

| Token Tailwind | CSS Var | Valor | Uso |
|---|---|---|---|
| `bg-jl-surface-base` | `--jl-surface-base` | `#020617` (night-950) | Fundo principal da página |
| `bg-jl-surface-elev` | `--jl-surface-elev` | `#0f172a` (night-900) | TopBar, modais, panels elevados |
| `bg-jl-surface-soft` | `--jl-surface-soft` | `rgba(15,23,42,0.42)` | Inputs, chips, frosted glass |

## Borders (divisores)

| Token | CSS Var | Valor | Uso |
|---|---|---|---|
| `border-jl-border-1` | `--jl-border-1` | `rgba(148,163,184,0.38)` | Divisor primário (cards, inputs, rows) |
| `border-jl-border-2` | `--jl-border-2` | `rgba(71,85,105,0.50)` | Divisor secundário (sub-seções) |

## Foreground (texto)

| Token | CSS Var | Valor real | Hierarquia | WCAG sobre surface-base |
|---|---|---|---|---|
| `text-jl-fg-1` | `--jl-fg-1` | `rgb(241 245 249)` (slate-100) | Título / texto principal | ~17:1 ✅ AAA |
| `text-jl-fg-2` | `--jl-fg-2` | `rgb(203 213 225)` (slate-300) | Texto secundário | ~11:1 ✅ AAA |
| `text-jl-fg-3` | `--jl-fg-3` | `rgb(148 163 184)` (slate-400) | Label, placeholder, auxiliar | ~6.9:1 ✅ AA |

## Accent (ação e destaque)

| Token | Valor | Uso |
|---|---|---|
| `text-jl-accent` | `#fbbf24` (amber-400) | Totais, valores, ícones ativos |
| `bg-jl-accent` | `#fbbf24` | Backgrounds de destaque (raro) |
| `.app-btn-accent` | classe CSS global | **Todo botão de ação primária** |
| `.app-btn-neutral` | classe CSS global | Botão secundário neutro |
| `.app-btn-danger` | classe CSS global | Botão destrutivo |

---

## Tabela de equivalência proibida → correta

> Estas substituições são **obrigatórias** em `app/caixa/`, `app/gerente/`, `components/caixa/`, `components/gerente/`.
> ESLint emite `warn` para violações nesses paths.

### Text colors

| ❌ PROIBIDO | ✅ CORRETO | Motivo |
|---|---|---|
| `text-gray-400` | `text-jl-fg-3` | Token canônico |
| `text-gray-300` | `text-jl-fg-2` | Token canônico |
| `text-gray-100` | `text-jl-fg-1` | Token canônico |
| `text-slate-400` | `text-jl-fg-3` | Token canônico |
| `text-slate-300` | `text-jl-fg-2` | Token canônico |
| `text-slate-100` | `text-jl-fg-1` | Token canônico |
| `text-zinc-400` | `text-jl-fg-3` | Token canônico |
| `text-zinc-300` | `text-jl-fg-2` | Token canônico |
| `text-white` em texto de interface | `text-jl-fg-1` | `text-white` só em botões com bg sólido colorido |
| `style={{ color: '#94a3b8' }}` | `text-jl-fg-3` | Sem inline styles de cor |
| `style={{ color: '#6b7280' }}` | `text-jl-fg-3` | Sem inline styles de cor |

### Background colors

| ❌ PROIBIDO | ✅ CORRETO | Motivo |
|---|---|---|
| `bg-slate-900` | `bg-jl-surface-elev` | Token canônico |
| `bg-slate-800` | `bg-jl-surface-elev` | Token canônico |
| `bg-gray-900` | `bg-jl-surface-base` | Token canônico |
| `bg-zinc-900` | `bg-jl-surface-base` | Token canônico |
| `bg-neutral-900` | `bg-jl-surface-base` | Token canônico |
| `style={{ background: '#fff' }}` em tela escura | `bg-jl-surface-elev` | Sem inline styles |

### Border colors

| ❌ PROIBIDO | ✅ CORRETO | Motivo |
|---|---|---|
| `border-slate-600` | `border-jl-border-1` | Token canônico |
| `border-slate-700` | `border-jl-border-1` | Token canônico |
| `border-gray-500` | `border-jl-border-1` | Token canônico |
| `border-zinc-600` | `border-jl-border-2` | Token canônico |

### Botões

| ❌ PROIBIDO | ✅ CORRETO |
|---|---|
| `bg-amber-400` direto em botão de ação | `.app-btn-accent` |
| `bg-amber-500` direto | `.app-btn-accent` |
| `bg-red-600` em botão destrutivo | `.app-btn-danger` |
| Botão secundário sem `border-jl-border-1` | `variant="secondary"` + `border-jl-border-1` |

---

## Tipografia canônica

| Papel | Classes Dragon UI |
|---|---|
| **Page title** | `text-xl sm:text-2xl font-bold text-jl-fg-1` |
| **Section title** | `text-base font-semibold text-jl-fg-1` |
| **Section label** | `text-xs font-semibold uppercase tracking-wide text-jl-fg-3` → usar `<SectionLabel>` |
| **Body text** | `text-sm text-jl-fg-2` |
| **Helper / caption** | `text-xs text-jl-fg-3` |
| **Total / valor** | `text-2xl sm:text-3xl font-extrabold tabular-nums text-jl-accent` |
| **Badge** | `text-xs font-medium` → usar `<DragonStatusBadge>` |
| **Operational mono** | `font-mono tabular-nums text-jl-fg-2` |
| **Placeholder** | `placeholder:text-foreground/70` |

---

## Spacing canônico

| Contexto | Classes |
|---|---|
| Page padding | `px-4 sm:px-6 py-3` |
| Card padding | `px-4 py-3` |
| Input padding | `pl-10 pr-3` (h-14) · `pl-8 pr-3 py-1.5` (compact) |
| Button gap interno | `gap-2` |
| Form gap | `gap-2 sm:gap-3` |
| Section gap | `gap-4` |
| Inline badge gap | `gap-1.5` |

---

## Hierarquia de botões

| Papel | Classe / Variante |
|---|---|
| Ação primária (confirmar, adicionar, finalizar) | `.app-btn-accent` |
| Ação secundária (cancelar, fechar) | `Button variant="secondary"` + `border-jl-border-1` |
| Ação destrutiva (excluir, sangria) | `.app-btn-danger` |
| Autorização gerente | `border-amber-500/40 bg-amber-500/10 text-amber-400` |
| Caixa abrir/fechar (sistema) | `.app-btn-neutral` |

**Alturas obrigatórias:**
- Botão principal PDV: `h-14`
- Botão compacto / footer: `h-11`
- Botão inline / ação: `h-9` (padrão shadcn)
- Botão mini (carrinho): `h-8 w-8`

**Nunca misturar alturas diferentes no mesmo row.**

---

## Responsividade obrigatória

| Padrão | Regra |
|---|---|
| Flex com botões lado-a-lado | `flex flex-col sm:flex-row` |
| Grid de colunas | `grid-cols-1 md:grid-cols-[...]` |
| Padding de página | `px-4 sm:px-6` |
| Gap de grid | `gap-3` mínimo |
| Botão principal mínimo | `min-w-[7rem]` ou `min-w-[11rem]` |
| Touch target mínimo | `h-8` (32px) — nunca `h-6` em elementos interativos |

---

## Estados operacionais

| Estado | Componente canônico | Uso |
|---|---|---|
| Loading de página | `<DragonLoadingState>` | Suspense, fetch inicial |
| Loading de botão | `<DragonOuroLoader iconClassName="h-4 w-4">` + `disabled={true} aria-busy={true}` | Todo submit |
| Skeleton de lista | `<CaixaCartListSkeleton>` | Carrinho carregando |
| Empty state | `<DragonEmptyState>` | Listas vazias |
| Feedback banner | `<DragonFeedbackBanner variant="warning|success|error|info">` | Mensagens inline |
| Badge de status | `<DragonStatusBadge variant="...">` | Status de entidade |
| Seção desabilitada | `<DragonDisabledSection disabled={...}>` | Blocos bloqueados |

---

## Acessibilidade obrigatória

```tsx
// Todo botão com estado de loading:
<Button disabled={loading} aria-busy={loading}>
  {loading ? <DragonOuroLoader iconClassName="h-4 w-4" /> : "Label"}
</Button>

// Todo ícone decorativo:
<Icon aria-hidden />

// Todo ícone com significado:
<Icon title="Descrição" />

// Elementos interativos custom (não shadcn):
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jl-accent focus-visible:ring-offset-2"
```

---

## Páginas legacy explicitamente isentas

Os seguintes arquivos usam design system próprio e estão isentos das regras ESLint de token:

- `app/admin/**` — painel admin com tema light separado
- `app/error.tsx`, `app/global-error.tsx` — páginas de erro do framework
- `**/page-old.tsx` — legacy marcado para remoção
- `**/scan-pipeline/CaixaScanPipelineDevPanel.tsx` — painel de dev somente
- `**/ProdutosListaImpressao.tsx` — layout de impressão (CSS dedicado)

Para isentar um arquivo adicional, adicione-o em `excludedFiles` no `.eslintrc.json` **e** documente o motivo aqui.
