# 02 — Estado Atual

> Snapshot **2026-08-27**. Baseline: `e1327e62` = produção = **GO**.
> Detalhe: `docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md`.
> O inventário de 2026-07-10 abaixo foi **reconciliado**: itens concluídos no SHA atual
> não devem ser relidos como “incompleto”.

> Snapshot original verificado contra Git em **2026-07-10**
> (`feat/admin-screen-consolidation` · `f2fca536`) — **histórico**.
> [[00_DASHBOARD_PROJETO]] · [[03_ARQUITETURA]]

---

## O Que Está Funcionando Hoje

### Core PDV (web)
- [x] Abertura/fechamento de caixa (cego, atômico)
- [x] Scan bip com máquina de estados (`useCaixaScanPipeline`)
- [x] Carrinho com varejo/atacado automático (`PricingService`, `CartEngine`)
- [x] Split de pagamento (dinheiro, PIX, débito, crédito)
- [x] Finalização transacional idempotente (RPC v4)
- [x] Baixa de estoque atômica anti-oversell
- [x] Cancelamento de venda com estorno
- [x] Desconto gerente com token + rate limit
- [x] Sangria/suprimento com aprovação
- [x] Diagnóstico pré-produção (`/admin/diagnostico-caixa`, migration `256`)

### Cadastro e SSoT
- [x] Produtos em `/admin/catalogo` (CRUD, tiers atacado, fiscal, imagens)
- [x] Clientes em `/admin/clientes`
- [x] Fornecedores em `/admin/fornecedores`
- [x] Estoque em `/admin/estoque` (kardex, recebimento, transferência, import NF-e)
- [x] Guard de margem negativa no banco

### Financeiro
- [x] Contas a receber em `/admin/financeiro?tab=receber`
- [x] Contas a pagar em `/admin/financeiro?tab=pagar` (componentes em `contas-pagar/`)
- [x] Aba fiscal em `/admin/financeiro?tab=fiscal`
- [x] Redirect legado `/gerente/financeiro/contas-pagar` → admin

### Admin e Governança
- [x] Painel Admin v2 consolidado (`88f2e64a`)
- [x] Cancelamento vendas via `VendaDetailSheet` / `VendasTable`
- [x] RLS em todas as tabelas principais
- [x] CI: lint + Vitest + build + guards arquiteturais

### Desktop (Tauri) — completo mas fora do D0
- [x] Catálogo SQLite offline
- [x] Outbox sync HMAC + nonce + retry/DLQ
- [x] Paridade `variantesChaveLeitura` via `shared-core`

---

## O Que Está Incompleto (reconciliado 2026-08-27)

| Item | Evidência | Prioridade | Estado 27/08 |
|---|---|---|---|
| Smoke na máquina da cliente | EXT-D0-004 | P0 pós-GO | Pendente — próxima sprint |
| Restore de backup | BL-D0-009 | P0 pós-GO | Nunca ensaiado |
| P0 Checklist T1–T12 como NO-GO | doc julho | — | **OBSOLETO** como bloqueador de `e1327e62` |
| Migration `256` | arquivo local julho | — | **SUPERSEDED** — não tratar como ausente sem `migration list` atual |
| Venda em espera hardening | `TODO_auditoria_255.md` | P3 | Congelado (D0-04) |
| Devolução/troca RPC | #313 em `e1327e62` | — | **RESOLVIDO** (kardex SSOT-04) |
| NFC-e Focus / Bling | D0-09 | P3 | Fora; não é a próxima sprint |
| Drift Git ↔ prod | BACKLOG 10–16 | P1 DR | Aberto; não hotfix D0 |
| Observabilidade alerta ponta a ponta | D0-OBS-001 | P1 | Parcial (Sentry existe) |

---

## O Que Está Congelado (Feature Freeze)

Conforme `docs/FEATURE_FREEZE_PILOTO.md` (vigência até Fase 4 estável):

| Item | Motivo |
|---|---|
| Venda em espera (expansão) | Fora do escopo D0 — hardening pendente |
| NFC-e Focus real | Sem checklist Focus completo |
| Auto-update Tauri | P3 — infraestrutura de distribuição |
| Redesign visual / unificação tokens | Não bloqueia piloto |
| Multi-loja / filiais | Fora do escopo D0 |
| Conciliação bancária | Fora do escopo D0 |
| Inventário cego formal | Fora do escopo D0 |
| CRM / promo engine | Fora do escopo D0 |
| Squash histórico de migrations | Só reconcile ambiente piloto |

---

## Riscos Atuais

### 🔴 Críticos (bloqueiam go-live)

**Nenhum em 2026-08-27.** O conflito `255_*` e o checklist T1–T12 incompletos **não** bloqueiam `e1327e62`.

Histórico 2026-07-10 (não reabrir como NO-GO):

| Risco | Detalhe |
|---|---|
| **Conflito migration 255** | Dois arquivos `255_*` — decisão de ledger histórica; ADR-011 |
| P0 Checklist incompleto | Julho |
| Smoke de venda não executado | Continua como P0 **pós-GO** (loja), não como ausência de código |

### 🟡 Importantes (degradam ou geram inconsistência)

| Risco | Detalhe |
|---|---|
| Drift GRANT em ambientes existentes | Migration `255_grant_baseline…` captura baseline; ambientes antigos precisam reconciliar |
| Buraco no kardex (devolução) | Ajustes manuais fora de RPC única |
| Arredondamento heterogêneo | `roundAbnt` vs `Math.round`/`toFixed` em pontos da UI |
| E2E não bloqueante no CI | Falhas E2E não impedem deploy (decisão SSRA) |
| Desktop usa RPC legada | `registrar_venda_com_itens` sem guard v4 completo |

### 🟢 Mitigados recentemente

| Risco | Resolução |
|---|---|
| Typecheck `diagnosticoCaixa.impl.ts` | ✅ `f2fca536` |
| Conflito `VendasTable.tsx` | ✅ `toVendaListRow()` |
| RPCs v2/v3 acessíveis | ✅ Bloqueadas |

---

## Discrepâncias Encontradas na Auditoria (docs vs código)

| Documento antigo dizia | Estado real no repo (2026-07-10) |
|---|---|
| Contas a pagar "em andamento" | ✅ Implementado em `/admin/financeiro?tab=pagar` |
| Venda em espera "não implementada" ([[Bugs]]) | 🟡 Parcial — migration `255`, `caixaVendaEspera.impl.ts`, E2E existem |
| Migration `255` = só GRANT baseline | ⚠️ **Dois arquivos 255** — GRANT + vendas em espera |
| `button-tokenized.tsx` existe | ❌ Removido em commits de limpeza (`0e95368c`) |
| Branch atual ahead de origin com `5ce33a6d` | HEAD atual é `f2fca536` (commit posterior) |

---

## Métricas do Repositório

| Métrica | Valor | Fonte |
|---|---|---|
| Migrations SQL | 187 arquivos | `backend/supabase/migrations/` |
| Numeração migrations | 001–256 (lacunas propositais) | CI `guard:migrations` |
| Edge Functions | 3 | `sync-outbox`, `validar-gerente`, `fiscal-worker` |
| Arquivos de teste | ~113 | Vitest + Playwright |
| Docs em `docs/` | ~55+ arquivos `.md` | Glob |

---

> Arquitetura: [[03_ARQUITETURA]] · Operação piloto: [[09_OPERACAO_PRIMEIRO_CLIENTE]]
