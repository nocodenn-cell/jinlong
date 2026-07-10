# 08 — Problemas e Soluções

> Histórico de bugs, causas raiz, soluções e commits relacionados.
> [[02_ESTADO_ATUAL]] · [[06_ROADMAP]] · [[Bugs]]

---

## Formato de Registro

```
Problema → Causa raiz → Solução → Commit/Migration → Impacto
```

---

## P0 — Críticos

### BUG-P0-001: Drift de GRANT no Supabase

| Campo | Valor |
|---|---|
| **Problema** | GRANTs aplicados manualmente no dashboard, não via migrations |
| **Causa raiz** | Modelo de segurança assumia GRANT base existente; nunca versionado |
| **Impacto** | Ambiente novo → funcionalidades bloqueadas para `authenticated` |
| **Solução** | `255_grant_baseline_tabelas_authenticated.sql` captura baseline |
| **Status** | 🟡 Parcial — requer execução em ambientes com drift |
| **Verificação** | `verify_p0_producao.sql`, `migration list` |

---

### BUG-P0-002: RPCs Legadas v2/v3 Acessíveis

| Campo | Valor |
|---|---|
| **Problema** | `finalizar_venda_*` v2/v3 chamáveis após criação da v4 |
| **Causa raiz** | Overloads PostgreSQL não removidos na evolução |
| **Impacto** | Venda sem guard de preço, sem ledger, potencial duplicação |
| **Solução** | Bloqueio por migrations `20260619…`, `20260620…` |
| **Status** | ✅ Resolvido |
| **Commit/Migration** | `20260619…block_v2`, `20260620…block_v3` |

---

### BUG-P0-003: Idempotência Web vs Desktop

| Campo | Valor |
|---|---|
| **Problema** | Anti-replay (nonce) só no sync desktop; web sem proteção equivalente visível |
| **Causa raiz** | Desktop usa Edge Function; web usa Server Action direto |
| **Impacto** | Duplo clique/retry de rede pode duplicar venda web |
| **Solução** | `idempotency_key` na RPC v4 (`migrations/061`) |
| **Status** | 🟡 Parcial — confirmar que `actions.ts` passa a chave |
| **Arquivo** | `pdv-importados/app/caixa/actions.ts` |

---

### BUG-P0-004: Conflito Migration 255 (NOVO — auditoria 2026-07-10)

| Campo | Valor |
|---|---|
| **Problema** | Dois arquivos com prefixo `255_` no mesmo diretório de migrations |
| **Arquivos** | `255_grant_baseline_tabelas_authenticated.sql` + `255_vendas_em_espera_e_consulta_rapida.sql` |
| **Causa raiz** | Numeração colidida entre branches/features |
| **Impacto** | `supabase db push` pode aplicar apenas um; ambiente inconsistente |
| **Solução** | **Pendente decisão humana** — renumerar um dos arquivos |
| **Status** | 🔴 Aberto |

---

## P1 — Importantes

### BUG-P1-001: Buraco no Kardex (Devolução/Troca)

| Campo | Valor |
|---|---|
| **Problema** | Devoluções pós-venda sem RPC única |
| **Causa raiz** | `048_devolucoes.sql` incompleto |
| **Impacto** | Kardex com buracos → relatórios incorretos |
| **Solução** | Pendente — RPC canônica de devolução |
| **Status** | 🟡 Parcial |

---

### BUG-P1-002: ADR-PDV-001 Desatualizado

| Campo | Valor |
|---|---|
| **Problema** | ADR com status "Proposto" mas implementação existe |
| **Causa raiz** | Implementação avançou sem sign-off formal |
| **Impacto** | Governança informal do pipeline bip |
| **Solução** | Pendente — sign-off e atualização para "Aceito" |
| **Arquivo** | `docs/adr/ADR-PDV-centro-de-gravidade.md` |

---

### BUG-P1-003: MATRIZ_OFFLINE_PDV.md Ausente

| Campo | Valor |
|---|---|
| **Problema** | Comportamento offline web × desktop não documentado |
| **Causa raiz** | Referenciado no roadmap mas nunca criado |
| **Impacto** | Ambiguidade em queda de rede |
| **Solução** | Pendente — criar documento |
| **Status** | 🔴 Aberto |

---

### BUG-P1-004: Arredondamento Heterogêneo

| Campo | Valor |
|---|---|
| **Problema** | `roundAbnt` no motor mas `Math.round`/`toFixed` em outros pontos |
| **Causa raiz** | Evolução incremental sem auditoria completa |
| **Impacto** | Diferença de centavos UI × banco |
| **Solução** | Pendente — auditoria e consolidação |
| **Arquivo** | `shared-core/money/roundAbnt.ts` |

---

### BUG-P1-005: Docs Desatualizados — Contas a Pagar

| Campo | Valor |
|---|---|
| **Problema** | Docs Jinlong diziam "em andamento" |
| **Causa raiz** | Financeiro unificado em admin após escrita dos docs |
| **Impacto** | Confusão sobre status do bloqueador P0 |
| **Solução** | ✅ Corrigido na reestruturação Obsidian 2026-07-10 |
| **Evidência** | `/admin/financeiro?tab=pagar` funcional |

---

### BUG-P1-006: Docs Desatualizados — Venda em Espera

| Campo | Valor |
|---|---|
| **Problema** | [[Bugs]] dizia "não implementada" |
| **Causa raiz** | Migration `255` e código adicionados após escrita |
| **Impacto** | Status incorreto no backlog |
| **Solução** | ✅ Corrigido — status atualizado para "parcial" |
| **Evidência** | `caixaVendaEspera.impl.ts`, E2E, `TODO_auditoria_255.md` |

---

## P2 — Menores

### BUG-P2-001: Cores Hardcoded
- **Problema:** `text-green-600`, `bg-red-100` sem tokens `--fp-*`
- **Status:** 🔴 Congelado (Feature Freeze)

### BUG-P2-002: MetricCard Duplicado
- **Problema:** Duas versões em `gerente/` e `admin-v2/`
- **Status:** 🔴 Congelado

### BUG-P2-003: Marketing "Offline" para Web
- **Problema:** Docs antigas sugerem offline na web
- **Realidade:** Offline é exclusivo do `pdv-local` (Tauri)
- **Status:** 🟡 Identificado

---

## ✅ Resolvidos (Referência Histórica)

| Bug | Causa | Solução | Evidência |
|---|---|---|---|
| Oversell estoque | Race condition | `decrementar_estoque_seguro` FOR UPDATE + version | `016`, `029`, `038` |
| Venda duplicada desktop | Replay attack | HMAC + nonce | `024` |
| Divergência barcode | Implementações separadas | `shared-core/variantesChaveLeitura` | branch atual |
| Campos fiscais ausentes | Drift produção | Migration `210` | auditoria drift |
| Desconto sem rate limit | Brute force | Rate limit por escopo | `022` |
| Typecheck diagnóstico | Union type sem guard | `status === 'ambiguo'` | `f2fca536` |
| Merge VendasTable | Tipos incompatíveis | `toVendaListRow()` | `f2fca536` |
| `button-tokenized` órfão | Componente experimental | Removido | `0e95368c` |

---

> Dívida técnica: [[Dívida Técnica]] · Auditoria: [[Auditoria]] · Legado: [[Bugs]]
