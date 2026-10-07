# Remediação SSOT-001..004 — matriz de validação

Data: 2026-10-07  
Branch: `cursor/remediacao-ssot-bloqueadores-001-004-7da4`  
Base: `cursor/go-condicional-bloqueadores-fiscais-7da4` (reusa SSOT-004 já parcialmente aplicado; inclui docs de auditoria da cadeia de PRs).

## Decisão do gate

**GO** — os quatro invariantes estão demonstrados por contrato + migration + testes estruturais/unitários.  
Módulos Importações / Contábil / Intelligence permanecem **fora de escopo de implementação** neste PR; podem iniciar **após** merge desta remediação.

## Matriz

| Achado | Antes | Depois | Evidência | Teste |
|--------|-------|--------|-----------|-------|
| **SSOT-001** | VIOLAÇÃO — `financeiro_painel.saldo_pdv = sum(saldo_atual)` | **OK** — `saldo_pdv = sum(internal.valor_sistema_dinheiro)` nos caixas ABERTO | `20261007163000_ssot_001_002_painel_ec_cache.sql`; `SSOT_CAIXA_SALDO_CONTRATO.md` | `tests/remediacao-ssot-001-004.matrix.test.ts` + `tests/ssot-caixa-ec-reconstrucao.test.ts` |
| **SSOT-002** | VIOLAÇÃO — writers incrementais + painel lendo cache | **OK** (decisão) — `saldo_atual` documentado como cache; trigger venda + cancel usam E(c)/sync; painel não decide por A | contrato §4–8; migration 163000 (trigger + cancel); COMMENT ON COLUMN | mesmos testes; residual: sangria/AR ainda delta no **mesmo** cache (não segunda verdade) |
| **SSOT-003** | VIOLAÇÃO — estoque NF-e sem AP quando sem duplicatas | **OK** — política explícita; guard `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`; OC/remessa sem obrigação rotuladas | `SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md`; `20261007163100_ssot_003_nfe_obrigacao_duplicata.sql` | matrix test SSOT-003 |
| **SSOT-004** | VIOLAÇÃO — `enfileirarDocFiscalStub` INSERT direto + GRANT INSERT | **OK** — stub removido; enqueue via `fiscal_enfileirar_*`; REVOKE INSERT authenticated | actions.ts (sem stub); `20261007161220` + `20261007163200`; `check-entity-ssot-boundary.mjs` | matrix test SSOT-004 + `npm run check:entity-ssot` |

## Comandos

```bash
cd pdv-importados
npm run check:entity-ssot
npx vitest run tests/remediacao-ssot-001-004.matrix.test.ts tests/ssot-caixa-ec-reconstrucao.test.ts
```

## Primeiro módulo após GO (recomendação — não implementar aqui)

**Importações (entrada NF-e / OC)** — é o único que ainda opera perto da obrigação financeira; Contábil e Intelligence devem **consumir** AP/`E(c)` já corretos, não inventar saldos. Ordem sugerida: Importações → Contábil → Intelligence.

## PR base choice

Base preferida para review: `cursor/auditoria-ssot-dominios-regras-7da4` **se** o GitHub permitir fast-forward da cadeia; caso contrário base = `cursor/go-condicional-bloqueadores-fiscais-7da4` (contém audit + SSOT-004 prévio) ou `cursor/governanca-dominios-regras-negocio-7da4` conforme empilhamento do Cloud Agent. Este PR documenta a escolha no corpo do PR.
