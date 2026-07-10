# 🏠 Jīn Lóng — Centro de Comando (Obsidian)

> **Memória permanente do projeto FastProduct/Jinlong**
> Última atualização: **2026-07-10** · Branch: `feat/admin-screen-consolidation` · HEAD: `f2fca536`

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

**Fase:** Pré-piloto (Feature Freeze ativo)
**Veredito:** 🟡 Pronto para piloto controlado (web) — go-live depende de checklist no ambiente alvo

| Módulo | Status |
|---|---|
| PDV web | 🟢 Completo + diagnóstico pré-produção |
| Cadastro produto | 🟢 SSoT `/admin/catalogo` |
| Estoque | 🟢 SSoT `/admin/estoque` |
| Financeiro | 🟡 Unificado `/admin/financeiro` |
| Fiscal NFC-e | 🟡 Mock/stub |
| Desktop Tauri | 🟢 Completo — fora do D0 |

**Próximo objetivo:** Pilotar 1º cliente — ver [[09_OPERACAO_PRIMEIRO_CLIENTE]]

**Bloqueador crítico:** Conflito migration `255` (dois arquivos) — ver [[08_PROBLEMAS_E_SOLUCOES#BUG-P0-004]]

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
├── backend/          → Supabase (187 migrations)
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
