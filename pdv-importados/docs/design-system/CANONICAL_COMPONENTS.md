# Dragon UI — Canonical Component Registry

> **Import sempre de:** `@/components/dragon` (barrel index)
> **Nunca importar** diretamente dos subdiretórios, exceto em Storybook stories.

---

## Componentes canônicos disponíveis

### Layout

| Componente | Import | Substitui | Migration Class |
|---|---|---|---|
| `<DragonCard>` | `@/components/dragon` | 39 card wrappers ad-hoc com `border/bg` inconsistentes | A |
| `<DragonSection>` | `@/components/dragon` | `<SectionLabel>` + wrapper ad-hoc manual | A |
| `<SectionLabel>` | `@/components/dragon` | 25 ocorrências `text-xs font-semibold uppercase tracking-wide` | A |

### Feedback

| Componente | Import | Substitui | Migration Class |
|---|---|---|---|
| `<DragonEmptyState>` | `@/components/dragon` | 49 empty states ad-hoc (texto solto, ícones inline) | A |
| `<DragonStatusBadge>` | `@/components/dragon` | 26 badges ad-hoc com `rounded-full border px-` | A |
| `<DragonFeedbackBanner>` | `@/components/dragon` | Banners de erro/sucesso ad-hoc | A |

### Operational

| Componente | Import | Substitui | Migration Class |
|---|---|---|---|
| `<DragonLoadingState>` | `@/components/dragon` | Loading states ad-hoc sem estrutura | A |
| `<DragonDisabledSection>` | `@/components/dragon` | `opacity-50 pointer-events-none` espalhado | A |

### Branding

| Componente | Import | Substitui | Migration Class |
|---|---|---|---|
| `<DragonOuroLoader>` | `@/components/branding/DragonOuroLoader` | Spinners ad-hoc | A |

---

## Migration Classes

| Classe | Significado | Ação |
|---|---|---|
| **A** | Componente canônico estável — use já | Substituição imediata em novos commits |
| **B** | Componente existente mas candidato à refatoração | Migrar no próximo sprint |
| **C** | Padrão recorrente sem componente ainda — criar | Criar antes de usar em novo contexto |
| **D** | Legacy marcado para remoção | Não usar em código novo |

---

## Candidatos Classe C (criar antes do próximo sprint)

| Padrão | Ocorrências | Candidato a componente |
|---|---|---|
| `<button onClick=... disabled={loading} aria-busy={loading}>` | ~15 | `<DragonActionButton>` |
| `fixed inset-0 bg-black/60 backdrop-blur-sm` (modal overlay) | ~8 | `<DragonModalOverlay>` (ou usar shadcn Dialog) |
| `grid grid-cols-2 gap-3` em footer de modal | ~6 | `<DragonModalFooter>` |

---

## Diretrizes de uso

```tsx
// ✅ correto — sempre via barrel
import { DragonCard, DragonEmptyState, DragonStatusBadge } from "@/components/dragon"

// ❌ errado — importar direto do subdiretório
import { DragonCard } from "@/components/dragon/layout/dragon-card"

// ❌ errado — reimplementar padrão canônico
<div className="rounded-md border border-jl-border-1 bg-jl-surface-base px-4 py-3">
  ...
</div>
```

---

## Estrutura de arquivos

```
components/dragon/
├── index.ts                          ← barrel público (import daqui)
├── layout/
│   ├── dragon-card.tsx               ← DragonCard, DragonSection
│   └── section-label.tsx             ← SectionLabel
├── feedback/
│   ├── dragon-empty-state.tsx        ← DragonEmptyState
│   └── dragon-status-badge.tsx       ← DragonStatusBadge, DragonBadgeVariant
├── operational/
│   └── dragon-operational-states.tsx ← DragonLoadingState, DragonFeedbackBanner, DragonDisabledSection
├── commerce/                         ← reservado para componentes específicos de PDV
└── branding/                         ← reservado (DragonOuroLoader já em components/branding/)
```

---

## Processo para adicionar novo componente canônico

1. Criar em `components/dragon/<categoria>/<nome>.tsx`
2. Exportar no `components/dragon/index.ts`
3. Adicionar entrada neste documento com Migration Class
4. Atualizar `scripts/dragon-baseline.json` se reduzir violações
5. Escrever story em `stories/dragon/<nome>.stories.tsx`
6. Nenhum PR que reimplemente um padrão aqui existente será aprovado
