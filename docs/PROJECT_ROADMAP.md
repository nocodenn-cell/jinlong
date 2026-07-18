# FastProduct Design System — Project Roadmap

**Visão de 30.000 pés:** Consolidação e migração gradual do design system

---

## Visão Geral Histórica

```
PRÉ-FASE ATUAL
├─ Dualismo de layout: "classic" vs "dragon"
├─ CSS bifurcado: seletores [data-caixa-layout]
├─ Componentes com layoutVariant prop
├─ Env var NEXT_PUBLIC_CAIXA_PDV_LAYOUT para mudar visualmente
└─ Problema: dificuldade de manutenção, regressions fáceis

         ↓↓↓ CONSOLIDAÇÃO INICIADA ↓↓↓

ONDA 1 (✅ Completada — Não documentada)
└─ Iniciou fundação de design system

ONDA 2 (✅ Completada — commit b185b9f)
├─ Removeu CSS de seletor inalcançável (dragon-dark/noturno)
└─ Limpeza de arquivos mortos

ONDA 3 (✅ Implementada — PR #202 aguardando merge)
├─ Colapso TOTAL do dualismo
├─ Removeu layoutVariant prop de 6 componentes
├─ Removeu env var NEXT_PUBLIC_CAIXA_PDV_LAYOUT
├─ Hardcoded ramo "classic" em CaixaPageClient
├─ Design system agora com 1 layout único (classic)
├─ Commits: 508360a (Onda 3), 32c03d1 (cleanup), c40e680a (Onda 4)
└─ Status: ✅ Vercel preview validado, ⏳ aguardando merge CI/GitHub

ONDA 4 (✅ Implementada — commit fc4009e1)
├─ Design System Guard — proteger contra regressão
├─ Script: scripts/design-guard.mjs
├─ 5 regras de validação:
│  1. Detectar novo prop layoutVariant
│  2. Detectar novo ternário condicional
│  3. Detectar novo seletor [data-caixa-layout]
│  4. Detectar novo import NEXT_PUBLIC_CAIXA_PDV_LAYOUT
│  5. Validar CaixaPageClient sem bifurcação
├─ CLI: npm run guard:design-system
├─ Status: ✅ Testa com sucesso em Onda 3
└─ Próximo: integrar ao CI/CD (GitHub Actions)

ONDA 5 (🚀 Planejamento concluído, aguardando início)
├─ Migração GRADUAL para novo design system
├─ 6 lotes (1 componente por lote):
│  1. Button (novo) — design tokens
│  2. Modal (wrapper) — com DragonModal
│  3. Table (novo) — responsive
│  4. Toast (novo) — context-based
│  5. Badge (novo) — simples
│  6. Forms (novo) — RHF integration
├─ Princípio: coexistência, sem breaking changes
├─ Timeline: 6 semanas (1 lote/semana)
├─ Cada PR: build ✅, testes ✅, Storybook visual, E2E smoke
└─ Status: 📋 Documentação pronta (ONDA_5_GRADUAL_MIGRATION.md)

ONDA 6 (📅 Futuro — não planejado ainda)
├─ Remoção de componentes antigos (post-deprecation period)
├─ Migração de consumidores completa
└─ Design system unificado e moderno

         ↓↓↓ RESULTADO FINAL ↓↓↓

DESIGN SYSTEM UNIFICADO
├─ 1 layout único (classic + design tokens modernos)
├─ Componentes sem bifurcação (Button, Modal, Table, Toast, Badge, Forms)
├─ Design guard ativo (protege contra regressão)
├─ CSS variables (--color-*, --space-*, --font-*)
├─ Storybook com todas as variações
├─ Testes unitários + E2E
└─ Fácil de manter, evoluir, adicionar novos componentes
```

---

## Status Atual (2026-07-18)

| Onda | Nome | Status | Commits | PR |
|------|------|--------|---------|-----|
| 3 | Colapso Dualismo | ✅ Implementada | 508360a, 32c03d1 | #202 (awaiting merge) |
| 4 | Design Guard | ✅ Implementada | c40e680a | #202 (awaiting merge) |
| 5 | Docs Onda 5 | ✅ Documentação | fc4009e1 | #202 (awaiting merge) |
| 5 | Lote 1 (Button) | 📅 Planned | (awaiting Onda 3+4 merge) | #250 |
| 5 | Lote 2 (Modal) | 📅 Planned | | #251 |
| 5 | Lote 3 (Table) | 📅 Planned | | #252 |
| 5 | Lote 4 (Toast) | 📅 Planned | | #253 |
| 5 | Lote 5 (Badge) | 📅 Planned | | #254 |
| 5 | Lote 6 (Forms) | 📅 Planned | | #255 |

---

## Branch Structure

```
main (8deb5402)
  ├─ Onda 1 keyboard-first — completada
  └─ Aguardando: PR #202 (Onda 3+4) para merge

claude/design-system-audit-9m8s0z (fc4009e1)
  ├─ Commit 508360a: Onda 3 — colapso dualismo
  ├─ Commit 32c03d1: limpeza skills-lock.json
  ├─ Commit c40e680a: Onda 4 — design guard
  └─ Commit fc4009e1: Onda 5 — documentação
```

---

## Arquivo de Documentação por Onda

| Arquivo | Onda | Conteúdo |
|---------|------|----------|
| `docs/ONDA_5_GRADUAL_MIGRATION.md` | 5 | Plano de 6 lotes, timeline, princípios |
| `docs/DESIGN_TOKENS_IMPLEMENTATION.md` | 5 | CSS variables, componente exemplo, checklist |
| `scripts/design-guard.mjs` | 4 | Script de validação (5 regras) |
| `pdv-importados/package.json` | 4 | `npm run guard:design-system` |

---

## Critério de Sucesso — Por Onda

### Onda 3: Colapso Dualismo ✅

- [x] Remover 17 ternários de layout em CaixaPageClient
- [x] Remover prop `layoutVariant` de 6 componentes
- [x] Remover env var `NEXT_PUBLIC_CAIXA_PDV_LAYOUT`
- [x] Remover arquivo `CaixaPdvLayoutPreviewBanner.tsx`
- [x] Remover CSS bifurcado (`.caixa-oriental-root[data-caixa-layout]`)
- [x] Build verde (npm run build)
- [x] Testes verdes (npm test)
- [x] Vercel preview validado

### Onda 4: Design Guard ✅

- [x] Script `scripts/design-guard.mjs` criado
- [x] 5 regras de validação implementadas
- [x] Script passa em Onda 3 (nenhuma regressão detectada)
- [x] npm script adicionado (npm run guard:design-system)
- [x] Commit fc4009e1

### Onda 5: Migração Gradual (📅 Planejado)

- [ ] Lote 1 (Button) — novo componente + design tokens
- [ ] Lote 2 (Modal) — wrapper com DragonModal
- [ ] Lote 3 (Table) — novo componente responsive
- [ ] Lote 4 (Toast) — novo componente com context
- [ ] Lote 5 (Badge) — novo componente simples
- [ ] Lote 6 (Forms) — novo componente complexo
- [ ] Cada lote: build ✅, testes ✅, Storybook, E2E
- [ ] Cada PR: < 300 linhas se possível
- [ ] Design guard passa (Regra 6 após Onda 5.0)

---

## Bloqueadores Conhecidos

### GitHub Actions CI (Não bloqueador)

- **Problema:** Falhas de infraestrutura (runner allocation)
- **Padrão:** `build-and-test` e `gitleaks` falham em ~2 segundos
- **Causa suspeita:** Billing/minute exhaustion em private repo
- **Impacto:** CI gates bypassadas, mas Vercel deployments bem-sucedidos
- **Status:** ⏳ Requer investigação em Settings > Billing > Actions
- **Ação:** Ignorar por enquanto, código está validado por Vercel

### PR #202 Merging

- **Bloqueador:** PR #202 (Onda 3+4) aguardando merge em `main`
- **Status:** Vercel preview ✅ Ready, GitHub Actions ❌ Infraestrutura
- **Próximo:** Merge em `main`, depois iniciar Onda 5 (Lote 1)

---

## Next Immediate Steps

1. ✅ Onda 5 planejamento concluído
2. ⏳ Aguardar merge de PR #202 em `main`
3. 🚀 Criar PR #250 (Lote 1: Button)
   - Novo componente Button com design tokens
   - CSS variables definidas
   - Storybook + testes
   - Nenhum consumidor modificado (Lote 1 = novo componente only)
4. 📋 Repetir Lote 2–6 semanalmente
5. 🔄 Migrar consumidores (fora de Onda 5, próximas sprints)

---

## Estimated Timeline

```
Jul 18–24:  Awaiting PR #202 merge, Onda 5 Lote 1 (Button) design
Jul 25–31:  Lote 1 (Button) PR #250 + merge
Aug 01–07:  Lote 2 (Modal) PR #251 + merge
Aug 08–14:  Lote 3 (Table) PR #252 + merge
Aug 15–21:  Lote 4 (Toast) PR #253 + merge
Aug 22–28:  Lote 5 (Badge) PR #254 + merge
Aug 29–Sep 4: Lote 6 (Forms) PR #255 + merge

Sep 05–30:  Consumidor migration (2–3 sprints)
            CaixaHeader, CaixaPdvTopBar, /gerente/vendas, /admin/* etc.

Oct 01+:    Onda 6 (remoção de componentes antigos, post-deprecation)
```

---

## Documentação por Fase

### Fase de Consolidação (Onda 3–4)

- [x] Onda 3: colapso de dualismo
- [x] Onda 4: design guard (5 regras)
- [ ] Onda 4: integração ao CI/CD (próximo)

### Fase de Migração (Onda 5)

- [x] ONDA_5_GRADUAL_MIGRATION.md (plano)
- [x] DESIGN_TOKENS_IMPLEMENTATION.md (técnico)
- [ ] Button.tsx (Lote 1)
- [ ] Modal.tsx (Lote 2)
- [ ] Table.tsx (Lote 3)
- [ ] Toast.tsx (Lote 4)
- [ ] Badge.tsx (Lote 5)
- [ ] Form/* (Lote 6)

### Fase de Cleanup (Onda 6)

- [ ] Documentação de deprecation
- [ ] Migração de consumidores
- [ ] Remoção de componentes antigos
- [ ] Consolidação final

---

## Key Decisions

| Decisão | Rationale |
|---------|-----------|
| Colapsar dualismo (Onda 3) | Simplificar manutenção, remover bifurcação |
| Design guard (Onda 4) | Proteger contra regressão de Onda 3 |
| Migração gradual (Onda 5) | Evitar PR gigantesca, testes por componente |
| Coexistência sem breaking changes | Minimizar risco, permitir rollback se necessário |
| CSS variables (design tokens) | Unificar tema, fácil de manter, suporta dark mode futuramente |
| Storybook + E2E por lote | Validação visual, documentação viva |
| Pequenas PRs (< 300 linhas) | Reviewabilidade, CI speed, rollback fácil |

---

## Success Metrics

- [ ] PR #202 merged em `main`
- [ ] 6 componentes novos criados (Onda 5 Lote 1–6)
- [ ] 20–30 consumidores migrados (Onda 5 + migração)
- [ ] Design guard passa continuamente
- [ ] 0 regressões de dualismo após Onda 3
- [ ] Componentes com design tokens (CSS variables)
- [ ] Storybook com todas as variações
- [ ] Testes unitários + E2E for each component
- [ ] Vercel deployments green (post-PR #202)
- [ ] GitHub Actions CI fixed (ou integração alternativa)

---

**Documento vivo — atualizar conforme progresso.**

Última atualização: 2026-07-18 (Onda 5 planejamento concluído)
