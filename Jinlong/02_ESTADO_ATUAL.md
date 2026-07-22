# 02 — Estado Atual

> Snapshot verificado contra repositório Git em **2026-07-10**.
> Branch: `feat/admin-screen-consolidation` · HEAD: `f2fca536`
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

## O Que Está Incompleto

| Item | Evidência | Prioridade |
|---|---|---|
| P0 Checklist T1–T12 executado em staging/prod | `docs/P0_CHECKLIST_OPERACIONAL.md` — não verificado | P0 |
| Smoke de venda no ambiente alvo | Pendente operacionalmente | P0 |
| Migration `256` aplicada no Supabase alvo | Arquivo existe localmente | P0 |
| Venda em espera — hardening RLS/auditoria | `TODO_auditoria_255.md` — 10+ itens abertos | P3 (congelado) |
| Devolução/troca pós-venda (RPC única) | `048_devolucoes.sql` incompleto | P1 |
| NFC-e Focus real | TODO em `fiscal-provider-adapter.ts` | P2 (congelado) |
| Bling adapter fiscal | TODO explícito no código | P2 (congelado) |
| Acessibilidade ARIA Fase 3.2 | `aria-live`, foco pós-modal | P1 (congelado) |
| Kardex avançado com export | View `060` existe; painel completo pendente | P2 |
| ADR-PDV-001 sign-off | Status "Proposto" no ADR | P1 |
| `MATRIZ_OFFLINE_PDV.md` | Arquivo não existe no repo | P1 |
| Observabilidade (Sentry/APM) | Não encontrado no código | P2 |

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

| Risco | Detalhe |
|---|---|
| **Conflito migration 255** | Dois arquivos com prefixo `255_` no repo: `255_grant_baseline_tabelas_authenticated.sql` e `255_vendas_em_espera_e_consulta_rapida.sql`. Ambiente novo pode aplicar apenas um. **Requer decisão humana.** |
| P0 Checklist incompleto | Migrations, secrets, edge functions podem estar desatualizados no ambiente alvo |
| Smoke de venda não executado | Fluxo operacional não validado com dados reais do cliente |

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
