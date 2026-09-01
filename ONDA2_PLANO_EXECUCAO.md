# ONDA 2 — PLANO DE EXECUÇÃO (7 IDs)

**Status:** Iniciando fase de implementação  
**Quantidade mínima:** ✅ Encerrada (sem gaps)  
**IDs a resolver:** 32, 33, 36, 40, 44, 50, 51 (7 total)

---

## MAPA DE INVESTIGAÇÃO E AÇÃO

| ID | Capacidade | Estado | Ação | Prioridade |
|----|-----------|--------|------|-----------|
| 36 | Aplicação automática faixa (runtime) | ✅ Implementado | E2E test | 1 |
| 32 | Preço atacado runtime | ✅ Funcional | Limpeza doc | 2 |
| 33 | Qtd mínima atacado | ✅ Funcional | Deprecar UI legacy | 3 |
| 40 | Exibição faixa aplicada | ⚠️ Parcial | Mostrar qty_min badge | 4 |
| 44 | Validação conflitos | ⚠️ Parcial | Validar tier < varejo | 5 |
| 50 | Auditoria sobrescrita | ⚠️ Parcial | Schema + RPC motivo | 6 |
| 51 | Histórico preços | ⚠️ Parcial | Audit tier CRUD | 7 |

---

## PLANO DE EXECUÇÃO

### PR #1: ID 36 — E2E Validação (1 hora)
- Teste Playwright: scan qty 1→10, valida VAREJO→ATACADO
- Merge: desbloqueia resto da Onda

### PR #2: IDs 32, 33 — Limpeza Doc/UI (30 min)
- Remover campos legado confusos
- Deprecar `quantidade_gatilho_atacado`

### PR #3: ID 40 — Badge qty_min (1 hora)
- Mostrar `quantity_minima` da tier no tooltip
- Refatorar `PriceTooltip.tsx`

### PR #4: ID 44 — Validação CRUD (1.5 horas)
- Impedir tier < preco_varejo
- Adicionar CHECK ou trigger

### PR #5: ID 50 — Auditoria motivo (2 horas)
- Schema: coluna `motivo_override`
- RPC: capturar motivo
- UI: input motivo ao override

### PR #6: ID 51 — Histórico tier CRUD (1.5 horas)
- Audit log tiers criadas/alteradas
- Query histórico_precos_produto

**Total estimado:** 7-8 horas de trabalho direto

---

## INÍCIO: Investigação Rápida dos 6 Gaps
