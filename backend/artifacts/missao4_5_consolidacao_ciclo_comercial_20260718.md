# Missão 4.5 — Consolidação do ciclo comercial

**Data:** 2026-07-18  
**Branch:** `consolidate/missao3-20260718`  
**Base main (divergência):** `ebbeac5c`  
**Tip remoto conhecido:** `ca53a279` (docs Missão 4.1) — **há artefatos 4.2.1–4.4-DIAG ainda não commitados**  
**PR:** **não aberto** (este documento prepara o pacote)  
**Escopo:** inventário + checklist — **sem features novas**

---

## 1. Vereditos do ciclo

| Missão | Capacidade | Veredito | Evidência canônica |
|---|---|---|---|
| 3.1 | Cadastro → venda → estoque | **GO** | `missao3_ops_3_1_*` / tip `795ed478` |
| 4.1 | Financeiro nasce da venda | **GO** | `missao4_1_ops_2026-07-18T1649.md` |
| 4.2 | Cancel (pré-ADR) | NO-GO histórico | `missao4_2_ops_2026-07-18T1655.md` |
| **4.2.1** | Cancel ADR-CAIXA-002 | **GO** | `missao4_2_1_ops_2026-07-18T1751.md` |
| 4.3 | Fechamento | **GO** | `missao4_3_ops_2026-07-18T1753.md` |
| 4.4 | Integridade cross-entity | **GO** | `missao4_4_ops_2026-07-18T1808.md` |
| 4.4-DIAG | `verificar_consistencia_venda` | **GO** | `missao4_4_diag_fix_2026-07-18T1817.md` |
| **Missão 4** | Ciclo comercial | **GO operacional** | este pacote |

---

## 2. Migrations adicionadas na Missão 4 (caixa / cancel / diagnóstico)

| Arquivo (repo) | Aplicada jinlong | Conteúdo |
|---|---|---|
| `20260718184800_adr_caixa_002_modelo_alpha_e_cancel.sql` | sim (`20260718175031` / `adr_caixa_002_modelo_alpha_e_cancel`) | Modelo α em \(E(c)\); cancel best-effort em `saldo_atual` |
| `20260718181600_fix_verificar_consistencia_venda_total_liquido.sql` | sim (`20260718181709` / `fix_verificar_consistencia_venda_total_liquido`) | Qualificação OUT params — BUG-4.4-DIAG-01 |

**Status git:** ambos `??` (untracked) no working tree — **obrigatório incluir no commit de consolidação antes do PR**.

### Migrations da branch (contexto Missão 3 / pré-4 — já no tip remoto)

| Arquivo | Papel |
|---|---|
| `270_criar_produto_com_estoque_inicial.sql` | TX produto + estoque inicial |
| `271_gtin_lookup_cache_e_cadastro_telemetry.sql` | GTIN cache |
| `20260718133633_revoke_anon_pdv_rpcs_and_fix_diag.sql` | Hardening anon PDV |
| `20260718135138_criar_produto_permite_operador_pdv.sql` | Operador PDV create |
| `20260718135500_ajuste_estoque_inicial_operador_pdv.sql` | Ajuste estoque operador |

Não são “features Missão 4”, mas viajam no mesmo PR de consolidação da branch.

---

## 3. RPCs alteradas (Missão 4)

| RPC | Mudança | Missão |
|---|---|---|
| `calcular_valor_sistema_dinheiro_caixa` | CTE `dev_din` só vendas `CONCLUIDA` (**Modelo α**) | 4.2.1 |
| `cancelar_venda_transacional` | Remove RAISE `CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE`; decremento `saldo_atual` best-effort | 4.2.1 |
| `verificar_consistencia_venda` | Aliases + `#variable_conflict use_column` | 4.4-DIAG |

### RPCs exercitadas sem alteração de contrato

| RPC | Uso |
|---|---|
| `finalizar_venda_transacional_canonica_v4` | Venda (inalterada na Missão 4) |
| `fechar_caixa_atomico` | Fechamento (já usava \(E(c)\)) |
| `criar_produto_com_estoque_inicial` | Setup ops |

---

## 4. Contratos confirmados (estado alvo pós-Missão 4)

### 4.1 Venda
- Path: `finalizar_venda_transacional_canonica_v4`
- Status `CONCLUIDA`; itens + pagamento; bloqueia `p_pagamentos=[]` e valor ≤ 0
- **Não** escreve `movimentacoes_caixa`; **não** incrementa `saldo_atual`

### 4.2 Estoque
- Baixa na venda; retorno no cancel via `estoque` + `estoque_reposicoes_cancelamento`
- Cancel duplicado não rebaixa/reposta de novo (`CANCELAR_VENDA_JA_CANCELADA`)

### 4.3 Pagamento
- SSoT: `vendas_pagamentos` (imutável no cancel)
- FK impede pagamento órfão
- CHECK `valor > 0`

### 4.4 Caixa \(E(c)\) — ADR-CAIXA-002
- API: `calcular_valor_sistema_dinheiro_caixa`
- \(E = VI + V_{din}(CONCLUIDA) + M - D_{din}(CONCLUIDA)\)
- Fechamento: `fechar_caixa_atomico` confere contado vs \(E(c)\)
- Cancel total: \(\Delta E = -P\) (não \(-2P\))

### 4.5 Cancelamento
- GERENTE+; status `CANCELADA`; estoque volta; `devolucoes` + `vendas_canceladas_auditoria` + `SALE_CANCELLED`
- `saldo_atual`: best-effort (não bloqueia; **não** é SSoT de \(E\))

### 4.6 Auditoria
- `SALE_REGISTERED` / `SALE_CANCELLED` em `venda_eventos`
- `vendas_canceladas_auditoria`
- Diagnóstico: `verificar_consistencia_venda` operacional novamente

### Documentos de contrato / mapa

| Doc | Papel |
|---|---|
| `docs/adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md` | ADR-CAIXA-002 |
| `backend/artifacts/mapa_autoridade_caixa_20260718.md` | Autoridade A/B/C/D |
| `backend/artifacts/impacto_venda_dinheiro_mov_caixa_20260718.md` | Impacto (não implementado path C) |

---

## 5. Dívidas abertas (explícitas — fora do GO operacional)

| ID | Dívida | Severidade | Por que não bloqueou Missão 4 |
|---|---|---|---|
| **D-A1** | `saldo_atual` **não** materializado na venda DINHEIRO | P1/P2 produto | \(E(c)\) é SSoT do esperado; cancel não depende mais do guard rígido |
| **D-A2** | Abertura: `valor_inicial` em \(E\), `saldo_atual` default 0 | P2 | Fechamento usa \(E\), não A |
| **D-A3** | `devolver_ou_trocar_venda` ainda pode `DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE` | P1 | Fora do escopo 4.2.1–4.4 (só cancel total) |
| **D-A4** | `recalcular_saldo_caixa` = VI+movs (**ignora vendas**) — perigoso se chamado em produção | P2 | App PDV não chama no path feliz |
| **D-A5** | Path C (tipo `entrada_venda` em `movimentacoes_caixa`) **não** implementado | — | Decisão consciente; ADR recomenda A/C depois |
| **D-A6** | Drift: `venda_finance_context` ausente no jinlong (mig 252 no repo) | P2 | Espelho passivo; não afeta \(E\)/cancel |
| **D-A7** | Artefatos/migrations 4.2.1+ ainda untracked no git | P0 process | Bloqueia PR até commit |

Nenhuma dessas dívidas reabre o ciclo 4.1–4.4 **desde que** \(E(c)\) e cancel Modelo α permaneçam.

---

## 6. Scripts ops (pacote de regressão)

| Script | Missão |
|---|---|
| `ops_missao4_venda_financeiro.mjs` | 4.1 |
| `ops_missao4_2_cancelamento.mjs` | 4.2 / 4.2.1 |
| `ops_missao4_3_fechamento.mjs` | 4.3 |
| `ops_missao4_4_integridade.mjs` | 4.4 |
| `ops_missao4_4_diag_fix.mjs` | 4.4-DIAG |

Uso padrão:

```bash
node --env-file=pdv-importados/.env.local backend/supabase/scripts/ops_missao4_*.mjs
```

---

## 7. Checklist de merge (antes de abrir PR)

### 7.1 Git / conteúdo

- [ ] Commitar migrations Missão 4: `20260718184800_*`, `20260718181600_*`
- [ ] Commitar ADR: `docs/adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md`
- [ ] Commitar scripts ops `ops_missao4_*.mjs` (exceto se política ignorar)
- [ ] Commitar evidências canônicas em `backend/artifacts/missao4_*` (ou anexar só no PR body)
- [ ] Atualizar `missao4_venda_estoque_financeiro_20260718.md` no tip
- [ ] **Não** incluir `.agents/`, planos WIP, secrets, `.env.local`
- [ ] Sync tip com `origin/consolidate/missao3-20260718` após push

### 7.2 Banco / ambientes

- [ ] Confirmar migrations aplicadas em **jinlong** (já: alpha + diag)
- [ ] Plano de apply em staging/produção na mesma ordem
- [ ] Smoke pós-apply: `ops_missao4_2` + `ops_missao4_3` + `ops_missao4_4_diag_fix`

### 7.3 Qualidade

- [ ] `npm run check:entity-ssot` (se PR tocar CRUD — cadastro/estoque da branch 3)
- [ ] Typecheck/testes do pacote `pdv-importados` já cobertos nos commits anteriores
- [ ] Revisar diff: zero mudança em `finalizar_venda_v4` na janela Missão 4

### 7.4 Produto / aceite

- [ ] ADR-CAIXA-002 aceito (Modelo α + \(E\) como SSoT)
- [ ] Dívidas D-A1/D-A3 documentadas como follow-up (não blockers)
- [ ] Decisão: PR único da branch vs PR só “Missão 4 DB” — preferir **um PR de consolidação** da branch com descrição seccionada

### 7.5 Abrir PR (quando ordenado — **não agora**)

- [ ] Título sugerido: `consolidate: Missão 3.1 + ciclo comercial Missão 4 (GO ops)`
- [ ] Body: links evidências 3.1 / 4.1 / 4.2.1 / 4.3 / 4.4 / DIAG
- [ ] Test plan: checklist ops scripts + apply migrations

---

## 8. Riscos pós-merge

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Ambiente sem migração Modelo α | Média | Cancel volta a double-count em \(E\) / comportamento antigo de saldo | Apply ordenado; smoke 4.2.1 |
| Operador espera `saldo_atual` = gaveta | Alta (UX) | Confusão UI se alguém mostrar A como “esperado” | UI/fechamento só \(E\); doc ADR |
| Devolução parcial falha por saldo | Média | Bloqueio operacional pós-venda | Follow-up D-A3 (alinhar a best-effort ou materializar A) |
| Alguém roda `recalcular_saldo_caixa` | Baixa | Zera efeito implícito de vendas em A | Revogar/avisar; ou reescrever fórmula depois |
| PR grande (3+4) difícil de revisar | Alta | Atraso merge | Seções claras no PR; não misturar features novas |
| Drift migrações MCP vs filenames | Baixa | Confusão de versioning | Nomes repo são fonte; jinlong já tem equivalents |

---

## 9. Escopo explícito do PR (quando abrir)

### Incluir
- Migrations Missão 4 (alpha + diag) + restante da branch já tipada
- ADR + mapas/relatórios de evidência
- Scripts ops de regressão
- Código Missão 3.1 já commitado (cadastro/estoque/GTIN/caixa fixes)

### Não incluir nesta consolidação
- Materializar `saldo_atual` na venda (D-A1)
- Tipo `entrada_venda` / path C
- Fix `devolver_ou_trocar` saldo guard (D-A3)
- Features novas de produto

---

## 10. Próximo passo recomendado

1. **Commit + push** dos untracked Missão 4.2.1–4.4-DIAG (migrations, ADR, scripts, artifacts).  
2. Congelar tip da branch.  
3. **Só então** abrir PR de consolidação (sob ordem explícita).  
4. Backlog: D-A1 / D-A3 em missão dedicada de liquidez física.

**Estado atual:** pacote de consolidação **preparado**; **PR não aberto**.
