# 🏠 Jīn Lóng — Centro de Comando (Obsidian)

> **Memória permanente do projeto FastProduct/Jinlong**
> Última atualização: **2026-08-27** · Baseline: `origin/main` = produção = **`e1327e62`** · decisão **GO**
> Canônico: `docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md` · Próxima sprint: `docs/piloto-d0/PROXIMA_SPRINT.md`

---

## Painel Principal

| # | Documento | Conteúdo |
|---|---|---|
| 00 | [[00_DASHBOARD_PROJETO]] | Visão geral, status, bloqueadores, links |
| 01 | [[01_HISTORICO_PROJETO]] | Linha do tempo, marcos, commits |
| 02 | [[02_ESTADO_ATUAL]] | Funcionando / incompleto / congelado / riscos |
| 03 | [[03_ARQUITETURA]] | Módulos, RPCs, regras de domínio |
| 04 | [[04_PDV]] | Fluxo de venda completo |
| 05 | [[05_CADASTRO_PRODUTO]] | Catálogo, importação, SSoT |
| 06 | [[06_ROADMAP]] | Concluído / em andamento / próximo / futuro |
| 07 | [[07_DECISOES_ARQUITETURAIS]] | ADRs e decisões com consequências |
| 08 | [[08_PROBLEMAS_E_SOLUCOES]] | Bugs, causas, soluções, commits |
| 09 | [[09_OPERACAO_PRIMEIRO_CLIENTE]] | Checklist go-live, treinamento, riscos |
| 99 | [[99_LOG_ATUALIZACOES]] | Diário de mudanças |

---

## Status Rápido

**Fase:** Piloto web em produção — **GO** (`e1327e62`)
**Veredito:** 🟢 Release consolidada alinhada à produção. Residual: smoke na loja, restore, Playwright completo flake (não D0).

| Módulo | Status |
|---|---|
| PDV web | 🟢 GO — troco só dinheiro (#324) |
| Cadastro produto | 🟢 SSoT `/admin/catalogo` — opções do modal (#330), baseline dirty (`86743dac`) |
| Estoque | 🟢 Kardex devolução/troca restaurado (#313); DRAFT no recebimento (#324) |
| Devolução/Troca | 🟢 SSOT-04 em `e1327e62` |
| Financeiro | 🟡 Hub `/admin/financeiro` — reauditoria independente residual |
| Fiscal NFC-e | 🟡 Stub — **não** é a próxima sprint |
| Desktop Tauri | 🟢 Fora do D0 |

**Próximo objetivo:** estabilização operacional (smoke cliente + backup/restore) — **não** Fiscal, **não** WhatsApp. Ver `docs/piloto-d0/PROXIMA_SPRINT.md`.

**Bloqueador crítico de código:** nenhum. PR aberta só #290 (Dependabot).

---

## 📅 Trabalho da Semana — 2026-07-13 a 2026-07-17 (histórico)

> Sessão anterior (2026-07-13) resolveu o build Vercel e o merge admin-screen-consolidation. Esta semana entrou uma série de fixes de estabilização pós-merge, todos em `main`.

### A) Série BA — Caixa PDV (Fase 5b / Cycle 6)

Fixes aplicados após smoke tests da Fase 5b (pagamento parcial + contas a receber):

| # | Ticket | Fix | Commit |
|---|---|---|---|
| 1 | BA-001 | UI de pagamento parcial alinhada ao RPC Fase 5b | `260c371d` |
| 2 | BA-010 | Outbox fecha caixa local via `fechar_caixa_pdv_atomico` (evitava estado fantasma) | `e8d9a6bc` |
| 3 | BA-013 | Permissão de cancelar venda alinhada ao RPC — GERENTE+ apenas | `8ddea9dd` |
| 4 | Cycle 6 | Modal de recibo dispensado automaticamente após venda | `8c968ef3` |
| 5 | — | Qty fracionada propagada por todo o price chain e cart SSoT (#172) | `94d2def9` |

### B) Cadeia de Preços Web≡Local (Aut#1 — #182)

`PRICE_RESOLUTION_CHAIN` unificada entre web e desktop: garante que atacado/varejo e tier de preço resolvem de forma idêntica nos dois contextos.

### C) Estoque — Fixes de integridade

| Fix | Commit |
|---|---|
| `actor_id` de sessão passado para `ajustar_estoque_manual` no estoque inicial (#184) | `f6d0f257` |
| Erro amigável quando `SUPABASE_SERVICE_ROLE_KEY` ausente no admin de estoque | `a98576cf` |

### D) Catálogo — Erro silencioso surfacado (#185)

Falha ao criar tier atacado na gravação de produto agora mostra mensagem de erro ao usuário (antes silenciosa — produto gravava sem preço atacado).

### E) Sprint B mergeado — Devolução / Troca

RPC de devolução corrigido após smoke de homologação local. Sprint B integrado ao `main` via `d74734e7`.

### F) Infraestrutura

- Migrations `24701`, `24702`, `248` aplicadas
- `.gitignore` atualizado para ignorar artefatos de smoke/E2E e helpers
- Skill **Engineering Loop** adicionada ao projeto (`6e98ff6c`)

---

## Navegação por Domínio

```
[[00_DASHBOARD_PROJETO]]
  ├── Gestão
  │   ├── [[06_ROADMAP]]
  │   ├── [[09_OPERACAO_PRIMEIRO_CLIENTE]]
  │   └── [[99_LOG_ATUALIZACOES]]
  ├── Técnico
  │   ├── [[03_ARQUITETURA]]
  │   ├── [[04_PDV]]
  │   └── [[05_CADASTRO_PRODUTO]]
  ├── Governança
  │   ├── [[07_DECISOES_ARQUITETURAIS]]
  │   └── [[08_PROBLEMAS_E_SOLUCOES]]
  └── Estado
      ├── [[01_HISTORICO_PROJETO]]
      └── [[02_ESTADO_ATUAL]]
```

---

## Arquivos Legados (histórico preservado)

> Documentos anteriores à reestruturação Obsidian (2026-07-10).
> Conteúdo canônico está nos arquivos numerados acima.

| Legado | Substituto canônico |
|---|---|
| [[Dashboard]] | [[00_DASHBOARD_PROJETO]] |
| [[Changelog]] | [[01_HISTORICO_PROJETO]] + [[99_LOG_ATUALIZACOES]] |
| [[Roadmap]] | [[06_ROADMAP]] |
| [[Arquitetura]] | [[03_ARQUITETURA]] |
| [[PDV]] | [[04_PDV]] |
| [[Cadastro Produto]] | [[05_CADASTRO_PRODUTO]] |
| [[Decisoes]] | [[07_DECISOES_ARQUITETURAIS]] |
| [[Bugs]] | [[08_PROBLEMAS_E_SOLUCOES]] |
| [[Backlog]] | [[06_ROADMAP]] |
| [[Próxima Sprint]] | [[09_OPERACAO_PRIMEIRO_CLIENTE]] |
| [[Auditoria]] | [[03_ARQUITETURA]] + [[08_PROBLEMAS_E_SOLUCOES]] |
| [[Dívida Técnica]] | [[08_PROBLEMAS_E_SOLUCOES]] |
| [[Design System]] | [[03_ARQUITETURA]] (seção frontend) |
| [[Estatísticas]] | [[02_ESTADO_ATUAL]] |

---

## Contexto do Cliente

**Cliente:** Dono de loja de importados (comunidade chinesa no Brasil)
**Mercado alvo:** ~60.000 lojas de importados no Brasil
**Diferencial:** Bilíngue PT/ZH, atacado automático, offline (desktop), fiscal não como barreira no D0

---

## Monorepo

```
fastproduct/
├── pdv-importados/   → Next.js 15 (web)
├── pdv-local/        → Tauri 2 (desktop)
├── backend/          → Supabase (190+ migrations)
├── shared-core/      → Domínio TypeScript puro
└── docs/             → Checklists e runbooks
```

---

## Documentação Externa (`docs/`)

- `docs/FEATURE_FREEZE_PILOTO.md`
- `docs/P0_CHECKLIST_OPERACIONAL.md`
- `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`
- `docs/GOVERNANCA_PMO_JINLONG.md`
- `docs/adr/ADR-PDV-centro-de-gravidade.md`
