# Remediação SSOT-001..004 — gate final

Data: 2026-10-07  
Branch: `cursor/remediacao-ssot-bloqueadores-001-004-7da4`  
PR: https://github.com/nocodenn-cell/fastproduct/pull/476 (base: #475 go-condicional)  
Nota: #475 = saneamento fiscal Focus/stub; **esta** remediação 001–004 vive em #476.

## Decisão arquitetural

# GO

SSOT-001…004 estão resolvidos com **uma semântica** por domínio:

| Tema | Semântica única |
|------|-----------------|
| Saldo de caixa | \(E(C)\) autoridade; `saldo_atual` = cache derivado |
| Aquisição | Obrigação só na NF-e com duplicatas; OC/remessa = físico sem título, rastreável |
| Enqueue fiscal | Só RPC `fiscal_enfileirar_*`; INSERT `authenticated` revogado |

Importações / Contábil / Intelligence **não** são implementados neste PR — recomendação pós-merge: **Importações → Contábil → Intelligence**.

---

## Matriz final

| ID | Antes | Depois | Invariante | Evidência | Teste positivo | Teste negativo |
|----|-------|--------|------------|-----------|----------------|----------------|
| **SSOT-001** | VIOLAÇÃO `sum(saldo_atual)` | **OK** | `saldo_pdv` / exibido = \(E(C)\) | `20261007163000_…painel_ec_cache.sql`; `SSOT_CAIXA_SALDO_CONTRATO.md` | painel usa `valor_sistema_dinheiro`; `ssot-caixa-ec-reconstrucao.test.ts` | migration DO falha se `sum(saldo_atual)` reaparecer |
| **SSOT-002** | VIOLAÇÃO writers + decisão por A | **OK** | decisões usam \(E(C)\); cache só materializa | `163000` (venda/cancel) + `20261007170000_ssot_002_mov_ar_ec_cache.sql` (mov/AR) | guard+sync em registrar/aprovar/liquidar/estornar | DO prova falha se UPDATE incremental de `saldo_atual` voltar |
| **SSOT-003** | VIOLAÇÃO estoque NF-e sem AP | **OK** | econ>0 sem duplicata ⇒ rejeita; OC/remessa sem AP fictícia porém rotuladas | `20261007163100_…`; `SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md` | guard + AP com `nfe_importacao_id` | `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA` |
| **SSOT-004** | VIOLAÇÃO stub + GRANT INSERT | **OK** | enqueue só RPC; INSERT authenticated impossível | stub ausente; `161220`+`163200` REVOKE; gate entity-ssot | `fiscal_enfileirar_documento_venda` no caixa | grant INSERT autenticado falha na prova SQL; gate falha se stub/INSERT app |

---

## Por achado — regra / implementação / reconstrução

### SSOT-001
- **Regra:** KPI “dinheiro PDV” = soma \(E(c)\) caixas abertos.
- **Implementação:** `financeiro_painel` → `sum(internal.valor_sistema_dinheiro(c.id))`.
- **Reconstrução:** fórmula em `SSOT_CAIXA_SALDO_CONTRATO.md` §2 (abertura + vendas DINHEIRO + AR + movs − devoluções).

### SSOT-002
- **Regra:** uma autoridade; cache sem poder de decisão.
- **Implementação:** trigger venda, cancel, registrar/aprovar mov, liquidar/estornar AR → guard \(E\) + `sincronizar_saldo_cache`.
- **Reconstrução:** após qualquer fato, `saldo_atual` deve igualar \(E(C)\) (materialização).

### SSOT-003
- **Regra:** obrigação financeira nasce no reconhecimento documental (duplicatas), não no físico isolado.
- **Implementação:** guard na confirm NF-e; OC/remessa documentadas como sem título; kardex distingue tipos.
- **Reconstrução:** AP sempre com `nfe_importacao_id`; físico sem obrigação = `ENTRADA_OC` / remessa.

### SSOT-004
- **Regra:** um contrato de enqueue.
- **Implementação:** RPC canônica; REVOKE INSERT; stub removido; gate.
- **Reconstrução:** documento só via `fiscal_enfileirar_*` / worker.

---

## Comandos de validação

```bash
cd pdv-importados
npm run check:entity-ssot
npx vitest run tests/remediacao-ssot-001-004.matrix.test.ts tests/ssot-caixa-ec-reconstrucao.test.ts
# Deno (fiscal, herdado #475):
cd ../backend/supabase/functions/fiscal-worker && deno test fiscal-provider-adapter.test.ts fiscal_worker_orchestration.test.ts
```

Migrations **não** aplicadas no Jinlong remoto nesta sprint (prova estrutural + DO blocks na aplicação local/homolog).
