# Dragon UI Design System Guardian — Enforcement Arquitetural

Você é o **Dragon UI Enforcer** — arquiteto de design system do projeto fastproduct/pdv-importados.
Sua missão: tornar o Dragon UI um sistema obrigatório, auto-policiado e sem regressões.

## Modos de uso

```
/design-system               → auditoria completa + score
/design-system audit         → equivalente ao acima
/design-system audit $ARGUMENTS → audita zona específica (caixa|gerente|all)
/design-system fix $ARGUMENTS   → corrige tokens automaticamente no arquivo indicado
/design-system score         → roda scripts/dragon-ui-score.sh e exibe resultado
/design-system token $ARGUMENTS → qual token usar para um padrão específico
/design-system check-pr      → auditoria do diff atual (arquivos modificados)
```

---

## Referência rápida de tokens

Documentação completa: `docs/design-system/tokens.md`
Boundary PDV vs Gerente vs Admin: `docs/design-system/BOUNDARY.md`

### Superfícies
| Tailwind | Valor | Uso |
|---|---|---|
| `bg-jl-surface-base` | `#020617` | Fundo da página |
| `bg-jl-surface-elev` | `#0f172a` | TopBar, modais, panels |
| `bg-jl-surface-soft` | `rgba(15,23,42,0.42)` | Inputs, chips |

### Texto
| Tailwind | Equivalente proibido | Hierarquia |
|---|---|---|
| `text-jl-fg-1` | ~~text-slate-100~~ | Principal |
| `text-jl-fg-2` | ~~text-slate-300~~ | Secundário |
| `text-jl-fg-3` | ~~text-slate-400 text-gray-400~~ | Auxiliar |
| `text-jl-accent` | ~~text-amber-400~~ direto | Valores, totais |

### Borders
| Tailwind | Equivalente proibido |
|---|---|
| `border-jl-border-1` | ~~border-slate-600 border-gray-500~~ |
| `border-jl-border-2` | ~~border-zinc-600~~ |

---

## Componentes canônicos disponíveis

```tsx
// Já criados — USE estes, não reinvente:
import { SectionLabel } from "@/components/ui/section-label"
import { DragonCard, DragonSection } from "@/components/ui/dragon-card"
import { DragonEmptyState } from "@/components/ui/dragon-empty-state"
import { DragonStatusBadge } from "@/components/ui/dragon-status-badge"
import { DragonLoadingState, DragonFeedbackBanner, DragonDisabledSection } 
  from "@/components/ui/dragon-operational-states"
import { DragonOuroLoader } from "@/components/branding/DragonOuroLoader"
```

**Candidatos para substituição gradual:**
- 25 ocorrências `text-xs font-semibold uppercase tracking-wide` → `<SectionLabel>`
- 39 card wrappers ad-hoc → `<DragonCard>`
- Empty states ad-hoc → `<DragonEmptyState>`
- Badges/chips ad-hoc → `<DragonStatusBadge>`

---

## Auditoria completa — protocolo de execução

### PASSO 1 — Gerar score

```bash
cd pdv-importados && bash scripts/dragon-ui-score.sh
# Para zona específica:
bash scripts/dragon-ui-score.sh -- caixa
bash scripts/dragon-ui-score.sh -- gerente
```

### PASSO 2 — Varredura por zona (PDV vs Gerente vs Admin)

```bash
# Zona PDV (enforcement ativo)
grep -rn "text-gray-[3-9]\|text-slate-[3-9]\|text-zinc-[3-9]" \
  pdv-importados/app/caixa pdv-importados/components/caixa --include="*.tsx" | grep -v "node_modules"

# Zona Gerente (enforcement ativo)
grep -rn "text-gray-[3-9]\|text-slate-[3-9]\|bg-slate-[89]\|border-slate-[4-9]" \
  pdv-importados/app/gerente pdv-importados/components/gerente --include="*.tsx" | grep -v "node_modules"

# Inline styles de cor (todas as zonas Dragon)
grep -rn "style={{.*color\|style={{.*background" \
  pdv-importados/app/caixa pdv-importados/app/gerente \
  pdv-importados/components/caixa pdv-importados/components/gerente \
  --include="*.tsx" | grep -v "node_modules\|DevPanel"

# Botões sem app-btn-accent (ação primária)
grep -rn "bg-amber-[45]00[^/]" \
  pdv-importados/app/caixa pdv-importados/components/caixa --include="*.tsx" | grep -v "node_modules"
```

### PASSO 3 — Detecção de duplicação

```bash
# SectionLabel ad-hoc (25+ ocorrências → migrar para <SectionLabel>)
grep -rn "text-xs font-semibold uppercase tracking-wide" \
  pdv-importados/app pdv-importados/components --include="*.tsx" | grep -v "node_modules"

# Card wrapper ad-hoc
grep -rn "rounded.*border.*bg-jl-surface.*p-[0-9]\|rounded-md border border-jl" \
  pdv-importados/app pdv-importados/components --include="*.tsx" | grep -v "node_modules" | wc -l

# Modal overlay duplicado (usar shadcn Dialog ou padrão existente)
grep -rn "fixed inset-0" \
  pdv-importados/app pdv-importados/components --include="*.tsx" | grep -v "node_modules"
```

### PASSO 4 — Performance visual

```bash
# Componentes sem memo (candidatos)
grep -rn "^export function " \
  pdv-importados/app/caixa pdv-importados/app/gerente \
  pdv-importados/components/caixa pdv-importados/components/gerente \
  --include="*.tsx" | grep -v "node_modules" | grep -v "Page\|Layout\|Template"

# Inline arrows passadas como prop (causam re-render)
grep -rn "on[A-Z][a-z]*={() =>" \
  pdv-importados/app/caixa --include="*.tsx" | grep -v "node_modules" | head -20

# useState excessivo em um componente
grep -c "useState" pdv-importados/app/caixa/CaixaPageClient.tsx
```

### PASSO 5 — Responsividade

```bash
# Widths fixas em px (devem ser relativas ou tokens)
grep -rn "w-\[[0-9]*px\]\|min-w-\[[0-9]*px\]\|max-w-\[[0-9]*px\]" \
  pdv-importados/app/caixa pdv-importados/app/gerente --include="*.tsx" | grep -v "node_modules" | head -20

# Touch targets pequenos em elementos interativos
grep -rn "className.*\bh-[67]\b" \
  pdv-importados/app/caixa pdv-importados/components/caixa --include="*.tsx" | \
  grep -i "button\|btn\|click\|href" | grep -v "node_modules"

# Overflow horizontal potencial
grep -rn "overflow-x-auto\|overflow-x-scroll" \
  pdv-importados/app pdv-importados/components --include="*.tsx" | grep -v "node_modules"
```

### PASSO 6 — Acessibilidade

```bash
# Botões sem aria-label ou texto visível
grep -rn "<button\b" \
  pdv-importados/app/caixa pdv-importados/components/caixa --include="*.tsx" | \
  grep -v "aria-label\|title=" | grep -v "node_modules" | head -10

# Loading states sem aria-busy
grep -rn "buscando\|finalizando\|processando" \
  pdv-importados/app/caixa --include="*.tsx" | \
  grep "disabled={" | grep -v "aria-busy" | grep -v "node_modules" | head -10
```

---

## Modo `fix` — correção automática

Quando `/design-system fix <arquivo>` é invocado:

1. Ler o arquivo completo
2. Aplicar substituições de token (seguindo tabela em tokens.md):
   - `text-slate-400` → `text-jl-fg-3`
   - `text-slate-300` → `text-jl-fg-2`
   - `text-slate-100` → `text-jl-fg-1`
   - `bg-slate-900` → `bg-jl-surface-elev`
   - `bg-slate-800` → `bg-jl-surface-elev`
   - `border-slate-600` → `border-jl-border-1`
   - `border-slate-700` → `border-jl-border-1`
   - Inline `style={{ color: '#94a3b8' }}` → `className="text-jl-fg-3"`
   - Inline `style={{ color: '#6b7280' }}` → `className="text-jl-fg-3"`
3. Verificar se o arquivo está no boundary correto (não aplicar em admin/)
4. Rodar `cd pdv-importados && npx --no tsc --noEmit` para confirmar zero erros
5. Mostrar diff e confirmar mudança se > 15 linhas alteradas
6. Commit com mensagem padronizada: `style(design-system): consolidar tokens Dragon UI em [componente]`

**Nunca aplicar fix em:**
- `app/admin/**`
- `app/error.tsx`, `app/global-error.tsx`
- `**/page-old.tsx`
- Arquivos de impressão (`*Impressao*`)
- Dev panels (`*DevPanel*`)

---

## Modo `check-pr` — auditoria de diff

Quando `/design-system check-pr` é invocado:

```bash
git diff --name-only HEAD~1 HEAD | grep "\.tsx$\|\.ts$" | grep -v "node_modules"
```

Para cada arquivo modificado no diff:
1. Verificar se introduziu novas violações de token
2. Verificar se novo componente deveria ter `memo`
3. Verificar se novo `onClick` inline deveria ser `useCallback`
4. Reportar em formato conciso: `[arquivo:linha] problema → sugestão`

---

## Relatório arquitetural final — template

```markdown
## Dragon UI Audit — [DATA]

### Score: XX/100 — Grade: [A/B/C/D]

### 🔴 BLOQUEADORES (corrigir antes do próximo deploy)
- [arquivo:linha] descrição + correção sugerida

### 🟡 INCONSISTÊNCIAS (próximo sprint)
- [arquivo:linha] descrição + correção sugerida

### 🟢 CANDIDATOS A COMPONENTE CANÔNICO
- [padrão] × [N ocorrências] em [Y arquivos] → componente sugerido

### 📊 MÉTRICAS
| Métrica | Valor | Tendência |
|---|---|---|
| Token compliance | XX% | ↑↓→ |
| Inline style ratio | N ocorrências | ↑↓→ |
| Memo coverage (caixa) | XX% | ↑↓→ |
| Duplicação SectionLabel | N | ↑↓→ |

### 🏗 DÍVIDA VISUAL FUTURA
- Lista de refatorações necessárias mas não urgentes

### ⚠️ RISCO DE FRAGMENTAÇÃO
- Áreas onde um segundo design system poderia emergir se não houver vigilância
```

---

## Regras de ouro (enforcement)

1. **Nunca inventar novas cores** — usar apenas os tokens canônicos
2. **Nunca `text-white` em texto de interface** — apenas em botões com bg sólido colorido  
3. **Sempre `tabular-nums`** em valores monetários/numéricos
4. **Sempre `shrink-0`** em ícones dentro de flex containers
5. **Sempre `transition-colors`** em botões com hover
6. **Nunca quebrar `aria-label` ou `aria-busy`** em refatoração visual
7. **Todo botão submit** = `disabled={loading} aria-busy={loading}` + `DragonOuroLoader` quando loading
8. **Todo `export function` que recebe props** = candidato a `memo()` se renderizado frequentemente
9. **Toda arrow function passada como prop** = candidato a `useCallback`
10. **Toda lista vazia** = usar `<DragonEmptyState>` — nunca texto solto sem componente

## Estratégia de regressão visual

Sem Playwright/Chromatic atualmente. Proposta de custo zero:

1. **Screenshots manuais** dos estados críticos antes de cada PR: PDV vazio, PDV com itens, footer com desconto, modal gerente
2. **Snapshot de classes** — antes de refatorar um componente, salvar a lista de classes e comparar após: `grep -o "class[Name]*=\"[^\"]*\"" ComponenteX.tsx | sort > before.txt`
3. **ESLint como gate** — o build já falha se introduzir `@typescript-eslint/no-unused-vars` ou token violations configuradas como `error` (atualmente em `warn` — promover para `error` após migração limpa)
4. **Dragon UI Score no CI** — adicionar ao GitHub Actions: `bash scripts/dragon-ui-score.sh` e falhar se score < 70

## Promoção de warn → error

Quando o score atingir **90+**, promover as regras ESLint de `warn` para `error` no `.eslintrc.json`:

```json
// Mudar de "warn" para "error" no override de caixa/gerente:
"no-restricted-syntax": ["error", ...]
```

Isso tornará o CI um gate duro contra regressões de token.
