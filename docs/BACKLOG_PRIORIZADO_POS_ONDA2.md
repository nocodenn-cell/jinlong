# Backlog Priorizado Pós-Onda 2

**Data:** 2026-08-31  
**Autoridade:** Reconciliação de prontidão + PR #360 em staging  
**Próxima:** Decisão de Onda 2B vs Onda 3 vs aguardar feedback piloto

---

## P0 — Bloqueadores de Operação / Segurança / Dinheiro

### Backup / Restore (IDs 183–187) — **CONSCIENTE ADIADO para Onda 7**
- **Status:** NÃO IMPLEMENTADO (Org Supabase FREE; sem PITR automático)
- **Decisão:** Adiado conscientemente (sem contrato Pro). Onda 7 via `pg_dump`/agendamento/restore drill
- **Risco:** Dados — sem backup automático hoje
- **Runbook:** [`docs/runbooks/BACKUP_RESTORE_CANONICO.md`](runbooks/BACKUP_RESTORE_CANONICO.md)
- **Ação:** Não iniciar agora; aguardar aprovação contratual Pro ou Onda 7

### Fechamento por Forma (IDs 100, 92, 99, 206, 199, 205) — **Onda 3 PRIORIZADA**
- **Status:** IMPLEMENTADO PARCIALMENTE (vendas_pagamentos parcial; fechar_caixa_atomico PENDENTE)
- **Requisito:** Conferência PIX/cartão por forma; diferenças caixa; relatórios por forma
- **Risco:** Financeiro diário (caixa) — operador não vê diferenças, risco de roubo/desvio
- **Esforço:** L (6 IDs, 1–3 sprints)
- **Dependência:** vendas_pagamentos consolidação (parcialmente feita)
- **Recomendação:** Priorizar IMEDIATAMENTE após Onda 2 merge

---

## P1 — Importante antes/logo após piloto

### ID 40 (Onda 2B): Badge wiring — Lookup tier qty_min
- **Status:** Prop criada, consumidor FALTA
- **Trabalho:** 1–2 horas
- **Requer:** Adicionar lookup tier no item carrinho → passar `quantidadeMinima` a `TipoPrecoBadge`
- **Risco:** Nenhum (prop undefined = fallback sem min display)
- **Prioridade:** Após merge #360, antes de UX polish

### IDs 50, 51 (Onda 2B): Auditoria — UI leitura/captura
- **IDs 50:** Motivo override
  - Schema ✅, UI para capturar motivo em override FALTA
  - Trabalho: Input modal + RPC parameter + test
  - Esforço: S (1–2 horas)
- **ID 51:** Histórico tiers CRUD
  - Infra ✅, UI para ler histórico FALTA
  - Trabalho: Query histórico + timeline component + test
  - Esforço: S (2–3 horas)
- **Bloqueador?** Não (opcional; compliance nice-to-have)

### Resíduos I18n (IDs 219, 220) — QUASE COMPLETO
- **Status:** Implementado parcialmente (server actions caixa migrados, admin/gerente resíduos)
- **Resíduos:** Mensagens Zod em `finalizarVendaValidation.ts`, erros RPC/PostgREST podem vazar PT
- **Prioridade:** Antes do piloto em produção (se requisito ZH é mandatório)
- **Esforço:** S (encontrar + migrar hardcodes PT)

---

## P2 — Melhoria (não bloqueia piloto)

### UX Polish — Onda 8
- ID 214: Cliques adequados (superfície pequena)
- ID 46: Limites inf/sup (preço)
- ID 115: Imagem produto
- Esforço: 5–10 IDs, 2–3 sprints
- Prioridade: Após estabilização core

### Configuração / Relatórios Avançados — Onda 8
- IDs 71–81: Hardware (barcode, impressora, gaveta — após software sólido)
- IDs 131, 140, 168–198: Auditoria/relatórios/inventário
- Esforço: 15+ IDs
- Prioridade: Post-piloto; depende feedback operador

---

## Deferred

### P3 — Futuro
- Orçamento, variantes, etiquetas, DANFE, e-commerce, fidelidade, gift cards, marketplaces, integrações bancárias, BI avançado
- Esforço: 20+ IDs, vários sprints
- Prioridade: Roadmap pós-Q3

---

## Recomendação de Próxima Onda

| Opção | Composição | Tempo Est. | Risco | Valor |
|-------|-----------|-----------|-------|-------|
| **2B (Onda 2 Completion)** | IDs 40 (wiring) + 50, 51 (UI) | 1 sprint | Baixo | Compliance + UX |
| **3 (Fechamento)** | IDs 100, 92, 99, 206, 199, 205 | 2–3 sprints | Médio | **Risco financeiro** ← P0 |
| **2B → 3 (Sequencial)** | Onda 2B (1 sprint) + Onda 3 (2 sprints) | 3 sprints | Baixo→Médio | Seguro + Compliance |

**Recomendação:** 
1. ✅ Merge #360 imediatamente (pré-merge review + build OK)
2. ✅ Onda 2B (1 sprint): ID 40 wiring + IDs 50, 51 UI
3. ✅ Onda 3 (2–3 sprints): Fechamento por forma (P0 financeiro)
4. ⏸️ Onda 7 (quando aprovado Pro): Backup automático + restore drill

**Aguardar antes de Onda 3:** Feedback piloto Onda 1–2 estabilizado.

---

## Checklist Pré-Piloto (MVP Operacional)

| Requisito | Status | ID | Onda |
|-----------|--------|----|----|
| PDV básico (scan, qtd, preço VAREJO) | ✅ | Core | 0 |
| Atacado com quantidade mínima | ✅ | 36 | 2 |
| Desconto gerente | ✅ | Core | 0 |
| Pagamento (dinheiro, PIX) | ✅ | Core | 0 |
| Histórico vendas operador | ✅ | 27 | 1 |
| Reimpressão cupom histórico | ✅ | 28 | 1 |
| **Fechamento caixa por forma** | ⚠️ PARCIAL | 100, 92, 99 | **3** ← BLOQUEADOR OPERACIONAL |
| Backup dados | ❌ ADIADO | 183–187 | 7 |
| i18n PT/ZH caixa | ⚠️ PARCIAL | 219, 220 | 1 |

**Bloqueador identificado:** Fechamento por forma (Onda 3) — operador não consegue conferir diferenças PIX/cartão → risco financeiro diário.

**Recomendação:** Priorizar Onda 3 logo após Onda 2B.

---

## Documentação Relacionada

- [`docs/ONDA2_RECONCILIACAO_POS_PR360.md`](ONDA2_RECONCILIACAO_POS_PR360.md) — Detalhes Onda 2
- [`docs/AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md`](AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md) — Matriz completa 250 IDs (autoridade)
- [`docs/architecture/GO_LIVE_READINESS.md`](architecture/GO_LIVE_READINESS.md) — Prontidão deploy
- [`docs/runbooks/BACKUP_RESTORE_CANONICO.md`](runbooks/BACKUP_RESTORE_CANONICO.md) — Runbook backup

---

**Preparado por:** Claude Code  
**Próxima atualização:** Após merge #360 + validação staging
