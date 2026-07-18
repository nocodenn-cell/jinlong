# Impacto — “Venda DINHEIRO passa a gerar movimentação financeira de caixa”

**Data:** 2026-07-18  
**Status:** auditoria / plano — **não implementar**  
**Base:** [`mapa_autoridade_caixa_20260718.md`](./mapa_autoridade_caixa_20260718.md) + defs live jinlong  
**Motivação:** BUG-4.2-01 (cancel exige `saldo_atual`, venda não alimenta) e alinhamento A↔B

---

## 0. Interpretação obrigatória (decidir antes de migrar)

Hoje **não existe** um único significado de “movimentação financeira de caixa”:

| Interpretação | O que muda na venda DINHEIRO | Resolve 4.2? | Risco dominante |
|---|---|---|---|
| **I — Contador físico** | `UPDATE caixas.saldo_atual += valor_dinheiro` (sem linha em `movimentacoes_caixa`) | Sim | Menor superfície; A deixa de ser “só sangria” |
| **II — Ledger de mov. de caixa** | `INSERT movimentacoes_caixa` (+ opcionalmente atualiza `saldo_atual`) | Sim se também atualizar A | **Double-count no esperado (B)** se fórmula não mudar |
| **III — Ambos + novo tipo** | Tipo novo (`venda` / `entrada_venda`) em `movimentacoes_caixa` + `saldo_atual` + ajuste de `calcular_valor_sistema_*` | Sim | Schema + todos os leitores de tipo |

**Recomendação de desenho (para o plano abaixo):**  
tratar a mudança como **I + vínculo auditável**, ou **III com exclusão explícita no esperado** — **nunca** II com tipo `suprimento` (polui sangria/UI/dashboard).

Este documento assume o alvo operacional:

> Venda DINHEIRO deve **entrar no caixa físico (`saldo_atual`)** de forma **rastreável**, sem **duplicar** o esperado do fechamento.

---

## 1. Estado atual (resumo)

| Evento | `vendas_pagamentos` | `saldo_atual` | `movimentacoes_caixa` | Esperado fechamento |
|---|---|---|---|---|
| Venda DINHEIRO | INSERT | — | — | + via pagamentos |
| Sangria/suprimento | — | ± | INSERT | ± via movs |
| Cancel DINHEIRO | preserva | − (guard) | — | −venda (−devolucao) |
| Devolver DINHEIRO | — | − (guard) | — | − via `devolucoes` |

CHECK live / mig. 045: `movimentacoes_caixa.tipo IN ('suprimento','sangria','estorno')` — **não há tipo venda**.

---

## 2. Mapa de impacto por área

### 2.1 RPCs afetadas

| RPC | Papel hoje | Impacto se venda gerar mov. financeira |
|---|---|---|
| **`finalizar_venda_transacional_canonica_v4`** | Só INSERT `vendas_pagamentos` | **Writer principal** da nova regra (obrigatório) |
| **`calcular_valor_sistema_dinheiro_caixa`** | VI + VP DINHEIRO + movs − devoluções | **Crítico:** se venda também virar linha em `movimentacoes_caixa` e entrar no CTE `mov_tx`, **double-count** |
| **`cancelar_venda_transacional`** | `saldo_atual −`; INSERT `devolucoes`; não toca movs | Precisa espelhar: estornar/inverter a mov. da venda **ou** continuar só em `saldo_atual` (decidir um path) |
| **`devolver_ou_trocar_venda`** | `saldo_atual −` se caixa ABERTO + DINHEIRO | Mesmo dilema do cancel (parcial) |
| **`registrar_movimentacao`** | Única INSERT oficial em movs | Reusar vs INSERT interno na v4 (SECURITY DEFINER) |
| **`aprovar_movimentacao` / `estornar_movimentacao` / `cancelar_movimentacao`** | Ciclo sangria | Se venda gerar `pendente` → **fechamento bloqueia**; venda deve nascer `aprovado` |
| **`recalcular_saldo_caixa`** | VI + Σ movs (**sem vendas**) | Se vendas forem movs, recalc passa a incluir vendas → A muda de significado; se só atualizar `saldo_atual` sem mov, recalc **apaga** o efeito da venda |
| **`fechar_caixa_atomico` / `fechar_caixa_pdv_atomico`** | Chamam esperado; bloqueiam mov `pendente` | Indireto: fórmula B + volume de movs |
| **`dashboard_gerente_resumo`** (e variantes) | Lista `movimentacoes_caixa` em atividades | Poluição de feed se cada venda virar “CAIXA” |

**Não afetados diretamente (só leitura de VP):** turnos que somam `vendas_pagamentos` no app (`caixaTurnoResumo.impl.ts`).

### 2.2 Tabelas alteradas

| Tabela | Mudança provável |
|---|---|
| `caixas` | UPDATE `saldo_atual` na venda (I/III); abertura ainda nasce 0 — avaliar seed `saldo_atual = valor_inicial` |
| `movimentacoes_caixa` | Só se II/III: CHECK `tipo`, possível FK/idempotency `venda_id`/`referencia`, volume ↑ |
| `vendas_pagamentos` | **Permanece SSoT do pagamento da venda** (não remover) |
| `devolucoes` | Continua no cancel/devolver; coordenar com fórmula B |
| `vendas` / `venda_eventos` / auditoria | Sem mudança obrigatória; opcional link mov↔venda |
| Nova? | Coluna `venda_id` / `origem` em movs **ou** tabela ponte — evita ambiguidade com sangria |

### 2.3 Fechamento de caixa

| Componente | Comportamento atual | Risco da mudança |
|---|---|---|
| `fechar_caixa_atomico` | `calcular_valor_sistema_dinheiro_caixa` vs contado | Se B double-count → diferença sistemática = valor das vendas DINHEIRO |
| Bloqueio `pendente` | Impede fechar | Venda como mov. `pendente` = PDV quebrado |
| UI `caixaFechamentoServer.ts` | Lê RPC esperado | Herda fórmula B |
| `saldo_atual` no fechamento | **Não** é a métrica de conferência | Alinhar A ajuda cancel/devolver; fechamento continua em B |

**Regra de ouro na migração:**  
`esperado_após = esperado_antes` para a mesma venda (delta da fórmula B permanece +valor **uma vez**).

### 2.4 Relatórios / painéis

| Consumidor | Como usa | Impacto |
|---|---|---|
| `calcular_valor_sistema_dinheiro_caixa` | VP + movs | Double-count se ambas as vias |
| `caixaTurnoResumo` / `CaixaRailTurnoSummary` | Soma `vendas_pagamentos` → `totalRecebido` | OK se VP permanece |
| Dashboard atividades (`ativ_caixa`) | Qualquer mov aprovada/pendente | Feed inundado por vendas se II/III sem filtro |
| Fila gerente / realtime movs | `movimentacoes_caixa` | Ruído operacional (operador vê “sangria” genérica) |
| Relatórios de consistência venda | VP vs total | Independente, desde que VP continue |
| E2E fase 6 reconciliação | Assume VP = caixa recebido | Continua válido se não mudar SSoT de pagamento |

### 2.5 Cancelamento

| Passo atual | Após mudança (opções) |
|---|---|
| `saldo_atual −` DINHEIRO | Continua necessário se venda passou a `+` em A — **simétrico** |
| INSERT `devolucoes` | Mantém; B já subtrai devoluções **e** exclui venda CANCELADA → risco de **Δ−2×** no esperado (hipótese Missão 4.2) |
| Sem linha em movs | Se venda criou mov: cancel deve **estornar mov** (tipo `estorno` ligado à origem) **ou** INSERT mov negativa — senão A e ledger D divergem |
| Guard `SALDO_CAIXA_INSUFICIENTE` | Deve passar no happy path pós-venda (GO 4.2) |

### 2.6 Devolução / troca

| Passo atual | Impacto |
|---|---|
| `devolver_ou_trocar_venda` só mexe `saldo_atual` se caixa **ABERTO** e forma DINHEIRO | Se venda alimentou A, devolução parcial precisa A coerente |
| Não cria/estorna `movimentacoes_caixa` | Se II/III: devolução parcial **não** tem mov-origem 1:1 com valor parcial → precisa regra (estorno parcial vs só `saldo_atual`+`devolucoes`) |
| App: `devolverOuTrocarVenda.impl.ts` | Sem mudança de contrato se RPC preservar assinatura |

---

## 3. Opções de desenho (trade-offs)

### Opção A — Só `saldo_atual` na v4 (mínima)

**Fazer:** em `finalizar_venda_v4`, após pagamentos,  
`UPDATE caixas SET saldo_atual = saldo_atual + Σ(DINHEIRO)` com lock do caixa.

| Prós | Contras |
|---|---|
| Desbloqueia cancel/devolver | `recalcular_saldo_caixa` **zera** o efeito da venda |
| Sem double-count em B | Sem linha auditável em `movimentacoes_caixa` |
| Sem CHECK/schema | Comentário da coluna (“físico”) fica alinhado; histórico de mov. continua só sangria |

**Escopo RPC:** `finalizar_venda_v4` (+ opcional abertura: `saldo_atual := valor_inicial`).  
**Cancel/devolver:** mantêm `−` em A (já existem).

### Opção B — Reusar `suprimento` (rejeitada)

| Por quê não |
|---|
| Semântica falsa (venda ≠ suprimento) |
| UI/timeline/dashboard tratam como sangria/suprimento |
| Esperado B: VP + mov → **double-count imediato** |

### Opção C — Novo tipo `entrada_venda` (+ ajuste fórmula)

**Fazer:**

1. Ampliar CHECK `tipo` (+ talvez `forma_pagamento` already `dinheiro`).
2. INSERT mov `aprovado` com `idempotency_key = venda:{venda_id}:dinheiro` (ou similar).
3. Atualizar `saldo_atual` (via mesmo path de `registrar_movimentacao` ou UPDATE interno).
4. Em `calcular_valor_sistema_dinheiro_caixa`: **excluir** `entrada_venda` do CTE `mov_tx` **ou** deixar de somar VP DINHEIRO (escolher **uma** fonte para B).
5. Cancel: `estornar` a mov de origem (ou INSERT `estorno`) + regras atuais de `devolucoes`/status.
6. `recalcular_saldo_caixa`: incluir `entrada_venda` no Σ (alinha A).
7. Dashboard/UI: filtrar ou rotular tipo novo.

| Prós | Contras |
|---|---|
| Rastreabilidade D | Migração maior; mais RPCs |
| Recalc coerente | Volume de linhas = nº vendas dinheiro |
| GO 4.2 natural | Exige decisão SSoT do esperado (VP vs mov) |

### Opção D — Híbrida recomendada para Missão 4

1. **Curto prazo (desbloqueio 4.2):** Opção A + testes ops.  
2. **Médio prazo:** Opção C se produto exigir extrato unificado em `movimentacoes_caixa`.  
3. **Sempre:** corrigir fórmula B no cancel (evitar double-count venda CANCELADA + `devolucoes`) em missão separada se confirmado.

---

## 4. Plano de migração (sem código ainda)

### Fase 0 — Decisão de produto (gate)

- [ ] Escolher autoridade do **esperado (B)** após a mudança: continuar `vendas_pagamentos` **ou** passar a movs.  
- [ ] Escolher se “movimentação” = linha em `movimentacoes_caixa` ou só efeito em `saldo_atual`.  
- [ ] Aceitar ou não volume de 1 linha/venda no extrato do caixa.

### Fase 1 — Contrato e testes de caracterização

- [ ] Congelar asserts Missão 4.1: esperado Δ=+100, VP existe, movs sangria inalteradas **ou** documentar novo comportamento.  
- [ ] Script shadow: para N vendas DINHEIRO recentes, simular `saldo_atual` hipotético vs cancel.  
- [ ] Medir double-count: `esperado` com/sem CTE mov se tipo novo existir.

### Fase 2a — Path mínimo (Opção A: só `saldo_atual`)

| Passo | Artefato |
|---|---|
| 2a.1 | Migration: patch `finalizar_venda_transacional_canonica_v4` — `FOR UPDATE` no caixa; `saldo_atual += Σ DINHEIRO` dos pagamentos inseridos |
| 2a.2 | Opcional: abertura `saldo_atual = valor_inicial` (senão fundo não está em A) |
| 2a.3 | **Não** alterar `calcular_valor_sistema_*` |
| 2a.4 | Ajustar ou **deprecar** `recalcular_saldo_caixa` (hoje apagaria vendas) — ou documentar “não usar em produção” |
| 2a.5 | Retestar 4.1 + 4.2 ops; sem mudança de UI |

### Fase 2b — Path ledger (Opção C: tipo novo)

| Passo | Artefato |
|---|---|
| 2b.1 | Migration schema: `tipo` += `entrada_venda` (nome TBD); opcional `venda_id uuid` |
| 2b.2 | Types TS `TipoMovimentacaoCaixa`; UI timeline (rótulo / filtro) |
| 2b.3 | v4 INSERT mov `aprovado` + update saldo (idempotente) |
| 2b.4 | **Obrigatório:** alterar `calcular_valor_sistema_dinheiro_caixa` para não somar `entrada_venda` **ou** não somar VP — **uma fonte** |
| 2b.5 | `recalcular_saldo_caixa` incluir `entrada_venda` |
| 2b.6 | Cancel: estorno da mov origem **ou** manter só `saldo_atual−` se mov for só audit trail espelhado |
| 2b.7 | Devolução parcial: regra explícita (só A+devolucoes vs estorno proporcional) |
| 2b.8 | Dashboard `ativ_caixa`: filtrar ou limitar tipos |

### Fase 3 — Backfill (só se A ou C for obrigatório em caixas abertos)

| Cenário | Ação |
|---|---|
| Caixas ABERTO com vendas DINHEIRO e `saldo_atual` baixo | Script one-shot: `saldo_atual += Σ VP DINHEIRO CONCLUIDA − Σ devolucoes DINHEIRO − sangrias + suprimentos` **ou** rodar fórmula alinhada a A |
| Caixas FECHADO | Não mexer (histórico) |
| Nunca backfill via “suprimento fake” | Evita poluir D |

### Fase 4 — Validação ops (re-GO)

| ID | Assert |
|---|---|
| 4.1 | Venda R$100 → VP + esperado +100; **e** `saldo_atual` +100 (novo) |
| 4.2 | Cancel → status + estoque + A volta + auditoria; sem seed manual |
| 4.2b | Esperado pós-cancel coerente (−100, não −200) |
| 4.3 | Fechar: contado ≈ esperado (sem viés de double-count) |
| Regressão | Sangria/suprimento + realtime + dashboard |

### Fase 5 — Rollout

1. Migration em staging/jinlong.  
2. Ops scripts Missão 4.  
3. Monitorar `CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE` / `DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE`.  
4. Só então PR consolidação.

---

## Riscos (matriz)

| ID | Risco | Se | Severidade | Mitigação |
|---|---|---|---|---|
| R1 | **Double-count no esperado** | Venda vira linha em `movimentacoes_caixa` sem excluir de `mov_tx` ou de VP | **P0** | Gate: `esperado` pós-venda = +valor **uma vez** |
| R2 | **Recalc apaga vendas** | Opção só `saldo_atual` + alguém chama `recalcular_saldo_caixa` | P1 | Deprecar/reescrever recalc; revogar EXECUTE se preciso |
| R3 | **Fechamento bloqueado** | Mov de venda nasce `pendente` | P0 | Status sempre `aprovado` |
| R4 | **Poluição UI/dashboard** | Cada venda em `ativ_caixa` / timeline sangria | P2 | Tipo novo + filtro; não reusar `suprimento` |
| R5 | **Cancel sem estorno de mov** | Ledger D fica com entrada órfã | P1 | Cancel espelha estorno **ou** mov só audit com flag |
| R6 | **Devolução parcial** | Sem mov 1:1 | P1 | Manter A+`devolucoes` como path parcial; documentar |
| R7 | **Double-count no cancel (B)** | CANCELADA some de VP **e** `devolucoes` subtrai | P0/P1 | Medir na 4.2; corrigir fórmula se Δ=−2× |
| R8 | **Split payment** | Só parte DINHEIRO deve mover A | P0 | Somar apenas `forma = DINHEIRO` |
| R9 | **Idempotência v4** | Retry duplica saldo/mov | P0 | Idempotency por `venda_id` / key estável |
| R10 | **Backfill caixas abertos** | Cancel continua falhando até backfill | P1 | Script Fase 3 do plano de migração |
| R11 | **Abertura `saldo_atual=0`** | Fundo R$300 não está em A | P2 | Seed `saldo_atual = valor_inicial` na abertura |
| R12 | **Reusar `suprimento`** | Semântica/UI/B quebrados | P0 | **Proibido** |

---

## Plano de migração sugerido (sem implementar)

### Decisão (gate)

| Pergunta | Opções |
|---|---|
| Precisa linha em `movimentacoes_caixa`? | **Não** → path mínimo A · **Sim** → tipo novo C |
| SSoT do esperado (fechamento)? | Manter **`vendas_pagamentos`** (recomendado) |

**Recomendação Missão 4:** path **A** agora (desbloqueia 4.2); C só se extrato unificado for requisito de produto.

### Sequência

1. **Decisão** I vs III (acima).  
2. **Caracterização:** snapshot `esperado` e `saldo_atual` em 1 caixa aberto.  
3. **Implementar** path escolhido só em `finalizar_venda_v4` (+ abertura opcional).  
4. **Ajustar** `calcular_valor_*` **somente** se houver INSERT em movs.  
5. **Cancel/devolver:** validar simetria A; não mudar contrato app.  
6. **Backfill** caixas ABERTO.  
7. **Ops 4.1 → 4.2 → 4.3**.  
8. PR.

### Checklist de não-regressão

| Check | Critério |
|---|---|
| Esperado pós-venda | Δ = +DINHEIRO (uma vez) |
| Esperado pós-cancel | Δ ≈ −DINHEIRO (não −2×) |
| Sangria | Continua em movs; UI intacta |
| Fechamento | Sem viés = total vendas |
| Split | Só parcela DINHEIRO move A |
| PIX/cartão | Não move A |

---

## Riscos (se implementar sem este plano)

| # | Risco | Mitigação |
|---|---|---|
| 1 | Double-count B (VP + mov) | Excluir tipo venda do `mov_tx` **ou** não criar mov |
| 2 | `recalcular_saldo_caixa` apaga vendas | Reescrever ou banir uso |
| 3 | Reusar `suprimento` | Proibido |
| 4 | Mov `pendente` trava fechamento | Sempre `aprovado` |
| 5 | Cancel/devolver sem simetria | Teste ops 4.2 + devolução parcial |
| 6 | Dashboard/timeline poluídos | Tipo novo + filtro |

---

## Próximo passo (quando houver ordem)

1. Escolher path **A** (só `saldo_atual`) ou **C** (tipo `entrada_venda`).  
2. Implementar + backfill caixas abertos.  
3. Retestar Missão 4.2 sem seed manual.
