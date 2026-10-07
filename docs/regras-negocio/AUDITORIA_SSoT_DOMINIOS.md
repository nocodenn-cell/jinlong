# Auditoria SSoT — Domínios Jinlong

| Campo | Valor |
|--------|--------|
| **Missão** | Validar governança contra implementação real |
| **Data** | 2026-10-07 (atualizado: sprint GO CONDICIONAL) |
| **Inventário** | [INVENTARIO_IMPLEMENTACAO_DOMINIOS.md](./INVENTARIO_IMPLEMENTACAO_DOMINIOS.md) |
| **Mapa** | [MAPA_DOMINIOS_REGRAS_NEGOCIO.md](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) |
| **Governança** | [GOVERNANCA_REGRAS_NEGOCIO.md](./GOVERNANCA_REGRAS_NEGOCIO.md) |
| **Decisão** | **GO CONDICIONAL** — núcleo PDV pode evoluir com gates; módulos grandes (Importações / Contábil / Intelligence / Demanda / Mobile com regra) ainda **bloqueados** até SSOT-001…003 + Reality Check Products→Cash→Financial |

---

## Pergunta final

> Se adicionarmos Importações, Intelligence, Contabilidade, Demanda e Mobile sobre a arquitetura atual, estamos reutilizando uma verdade existente ou amplificando contradições existentes?

**Resposta:** o núcleo PDV (venda → estoque → preço → pagamentos) **reutiliza verdades canônicas**. Caixa/financeiro e entradas de compra **ainda amplificariam contradições** se Contábil/Intelligence/Importações consumirem `saldo_pdv`, `saldo_atual` ou o padrão “estoque sobe sem obrigação financeira”.

---

## Tabela executiva

| Domínio | SSoT | Boundary | Auditoria | Número explicável | Risco |
|---------|------|----------|-----------|-------------------|-------|
| Produtos | OK | ATENÇÃO (NF-e escreve custo/SKU) | OK (histórico preço/tiers) | PARCIAL (margem UI ≠ guard) | Médio |
| Estoque | OK | OK (app sem UPDATE direto) | PARCIAL (kardex sim; linha-zero fora RPC) | EXPLICÁVEL via kardex+RPC | Baixo |
| Vendas | OK | OK | OK (cancel auditoria) | EXPLICÁVEL (totais RPC) | Baixo |
| Caixa | **VIOLAÇÃO** (A vs E(c)) | ATENÇÃO | PARCIAL | PARCIAL / NÃO no painel | **Alto** |
| Financeiro | ATENÇÃO | ATENÇÃO | PARCIAL | PARCIAL (origem opcional) | **Alto** |
| Fiscal | OK (fila) | OK (RPC + REVOKE INSERT; gap cancel→P0 fechado no sprint) | OK (eventos) | EXPLICÁVEL status DB | Baixo residual |
| Clientes | OK | OK (`criarCliente` financeiro removido) | PARCIAL | N/A | Baixo |
| Fornecedores | OK | ATENÇÃO (combobox → `createSupplier` canônico) | PARCIAL | N/A | Baixo |
| Compras | ATENÇÃO | ATENÇÃO (3 vias ≠ F) | PARCIAL | PARCIAL | **Alto** p/ Importações |

---

# Decisão: GO CONDICIONAL

Violações **fiscais/boundary stub + cliente financeiro + cancel fiscal** foram tratadas no sprint 2026-10-07. Restam bloqueadores de **caixa/painel** e **contrato econômico de entrada** antes de Contábil / Intelligence / Importações.

**GO** para: endurecimento do núcleo PDV, fiscal (worker/RPC), entity-ssot gates, Reality Check Products→Cash→Financial.

**NO-GO** ainda para: Contabilidade, Intelligence, Importações internacionais, Demanda/Mobile com regra própria — enquanto SSOT-001…003 abertos.

### Bloqueia módulos grandes (repriorizado)

| ID | Prioridade | Correção mínima | Status |
|----|------------|-----------------|--------|
| **SSOT-012** (órfão fiscal) | **P0** (fechado no sprint) | `fiscal_marcar_cancelado` + `fiscal_cancelar_documento` + classify Focus `cancelado`; **não** acoplar a `cancelar_venda` | **FECHADO** (código + mig local; remoto Jinlong pendente) |
| **SSOT-004** | **P1** (fechado) | Remover `enfileirarDocFiscalStub` + REVOKE INSERT authenticated | **FECHADO** |
| **SSOT-006** | **P1** (fechado) | Remover `criarCliente` + gate entity-ssot | **FECHADO** |
| **SSOT-001** | **P1** (aberto) | `financeiro_painel.saldo_pdv` → \(E(c)\) — nunca `sum(saldo_atual)` | Aberto |
| **SSOT-002** | **P1** (aberto) | Unificar writers de `saldo_atual` / `sincronizar_saldo_cache` | Aberto |
| **SSOT-003** | **P1** (aberto) | Contrato econômico de entrada: AP com origem ou política “sem obrigação” explícita | Aberto |

### Pode ser corrigido posteriormente / residual

| ID | Item | Status |
|----|------|--------|
| SSOT-005 | `FornecedorCombobox` → `createSupplier` / `salvarFornecedorAction` (modal OK se writer canônico) | **MITIGADO** |
| SSOT-007 | Offline sem CR parcial — documentar canal ou alinhar Local | Aberto |
| SSOT-008 | Dívida D-P3 colunas `preco_atacado` / gatilho vs tiers D0 | Aberto |
| SSOT-009 | `garantirLinhaEstoque` INSERT qty 0 → RPC | Aberto |
| SSOT-010 | Mapa UX-03: FK `importacoes_nfe.ordem_compra_id` existe (mig 20260918); remessa ainda textual | **DOC atualizado neste sprint** |
| SSOT-011 | CR/AP manuais sem origem rastreável obrigatória | Aberto |

### Próximo Reality Check (pendente)

**Products → Cash → Financial** com invariantes: (1) preço efetivo único; (2) \(E(c)\) ≡ painel; (3) entrada com obrigação → AP com origem; (4) cancel venda ≠ auto-cancel fiscal (comando explícito).

---

# Etapa 3 — Matriz ownership (conceitos críticos)

| Conceito | Dono declarado | Escritores reais | Leitores | Fonte canônica | Divergência |
|----------|----------------|------------------|----------|----------------|-------------|
| Identidade SKU | products | catalog writers + NF-e RPC | PDV, estoque | `produtos` | ATENÇÃO NF-e |
| Código barras | products | catalog + unique DB + NF-e backfill | scanner | unique `(loja,barcode)` | ATENÇÃO preflight TS |
| Status ativo/publicação | products | catalog lifecycle | PDV | `produtos` | OK |
| Preço varejo cadastro | products | catalog RPC/update | UI | coluna | OK |
| Preço atacado efetivo | products+PG | `precos_atacado` + RPC | PDV | `calcular_preco_produto` | ATENÇÃO colunas legado UX |
| Qtd mín. atacado efetiva | products+PG | tiers / D0 | PDV | tier `quantidade_minima` | ATENÇÃO gatilho SKU |
| Custo cadastro | products | catalog + **NF-e confirm** | margem | `preco_custo` | ATENÇÃO cross-write |
| Margem | products (guard) | trigger DB; UI display | form | trigger 125 | ATENÇÃO UI espelho |
| Saldo estoque | inventory | RPCs listadas no inventário | PDV, UI | `estoque` via RPC | OK |
| Entrada estoque | inventory | remessa / OC / NF-e RPCs | — | RPCs | ATENÇÃO 3 vias |
| Saída venda | inventory | `decrementar_estoque_seguro` | — | idem | OK |
| Ajuste | inventory | `ajustar_estoque_manual_seguro` | — | idem | OK |
| Devolução estoque | inventory | cancel/devolver RPCs | — | idem | OK |
| Transferência | inventory | `transferir_estoque_seguro` | — | idem | OK |
| Reserva | — | **inexistente** | — | ≈ saldo | OK (explícito) |
| Total venda | sales | v4 recalcula | UI espelho | RPC | OK |
| Desconto | sales | RPC + snapshot | — | RPC | OK |
| Pagamentos venda | sales | v4 / registrar_venda | E(c), cash trig | `vendas_pagamentos` | OK |
| Status venda | sales | finalize/cancel | fiscal | `vendas.status` | OK |
| CR parcial | financial (sales-led) | v4; **não** offline | painel | `contas_receber` | ATENÇÃO offline |
| \(E(c)\) esperado | cash | função interna (leitura) | fechamento, UI turno | `valor_sistema_dinheiro` | OK |
| `saldo_atual` | cash cache | trigger + movs + cancel + AR + sync | **painel financeiro** | deveria ser cache | **VIOLAÇÃO** |
| Sangria/suprimento | cash | `registrar_movimentacao*` | E(c) | `movimentacoes_caixa` | OK |
| AR / liquidação | financial | writers + comando + v4 | painel | tabelas AR | ATENÇÃO multi-path |
| AP / pagamento | financial | NF-e + comando + RPC pagar | painel | `contas_pagar` | ATENÇÃO entrada sem AP |
| Saldo conta financeira | financial | `movimentos_financeiros` | painel | sum movimentos | OK |
| Doc fiscal status | fiscal | worker RPCs (`fiscal_marcar_*` / cancel) | UI | `documentos_fiscais_pendentes` | OK (stub removido) |
| Pedido compra | purchases | actions OC | NF-e/remessa | `ordens_compra` | ATENÇÃO |
| Cliente | customers | CustomerWriter | PDV | `clientes` | OK (financeiro sem create) |
| Fornecedor | suppliers | `createSupplier` (+ combobox via alias) + NF-e | produtos | `fornecedores` | ATENÇÃO (mitigado) |

---

# Etapa 4 — Contratos entre domínios

### Venda → Estoque → Caixa/Financeiro → Fiscal

| Transição | Quem inicia | Contrato | Quem escreve | Idempotência | Auditoria | Rollback |
|-----------|-------------|----------|--------------|--------------|-----------|----------|
| Venda→Estoque | PDV | `finalizar_venda_*_v4` → `decrementar_estoque_seguro` | inventory | `estoque_baixas` | kardex `SAIDA_VENDA` | cancel repõe |
| Venda→Cash A | trigger em `vendas_pagamentos` | **não** é orquestrador documentado no mapa | cash `saldo_atual` | n/a | fraca | cancel debita A |
| Venda→E(c) | leitura | composição vendas+movs+AR+dev | — | — | reconstruível | — |
| Venda→CR | v4 se parcial | INSERT `contas_receber` | financial | unique venda | parcial | cancel trata AR |
| Venda→Fiscal | flag/enqueue | `fiscal_enfileirar_*` | fiscal | por venda | eventos | cancel venda **não** cancela fiscal (comando `fiscal_cancelar_documento` separado) |

**Escrita direta cross-domínio:** trigger sales→cash A (SSOT-002). Stub fiscal INSERT **removido** (SSOT-004 fechado).

### Compra → Recebimento → Estoque → Financeiro

| Via | Estoque | Custo produto | AP | Origem AP |
|-----|---------|---------------|----|-----------|
| OC `receber_ordem_compra` | sim | não | **não** | — |
| Remessa | sim | não | **não** | — |
| NF-e confirm | sim | opcional | **só se duplicatas** | `nfe_importacao_id` |

**Conclusão:** é possível (e comum) ter **consequência de estoque sem registro financeiro canônico** — viola a regra financeira transversal da governança quando a operação é economicamente obrigatória (SSOT-003).

### Devolução / Cancelamento

| Operação | Downstream | Observação |
|----------|------------|------------|
| Cancel | estoque +, cash A −, AR, auditoria | Não sincroniza cache via `sincronizar_saldo_cache` |
| Devolver C3 | estoque +, sync cache, desembolso | Modelo alinhado a E(c) |
| Fiscal | inalterado pelo cancel venda | Cancel fiscal = comando explícito (`fiscal_cancelar_documento` / Focus cancelado → `fiscal_marcar_cancelado`) |

---

# Etapa 5 — Número explicável

| Número | Origem | Registros | Cálculo | Regra | Histórico | Reconstruível? | Classe |
|--------|--------|-----------|---------|-------|-----------|----------------|--------|
| Saldo estoque | `estoque.quantidade_atual` | kardex + baixas | soma movimentos / RPC | RPCs canônicas | `movimentos_estoque_log` | Sim (kardex + view) | **EXPLICÁVEL** |
| Custo produto | `produtos.preco_custo` | cadastro e/ou NF-e | último write | trigger margem | `historico_precos` se via cadastro; NF-e parcial | Parcial se NF-e | **PARCIALMENTE EXPLICÁVEL** |
| Margem | UI `varejo−custo` / guard DB | colunas | fórmula UI ≠ % guard | trigger 125 | não como série | Guard sim; série não | **PARCIALMENTE EXPLICÁVEL** |
| Total venda | RPC finalize | itens+pagamentos | recalcula no PG | v4 | venda imutável pós | Sim | **EXPLICÁVEL** |
| Saldo caixa esperado | `valor_sistema_dinheiro` | vendas DINHEIRO, movs, AR din, devoluções, abertura | fórmula C3 | ADR-CAIXA / C3 | componentes vivos | Sim | **EXPLICÁVEL** |
| `saldo_atual` / `saldo_pdv` | updates incrementais + trigger | inconsistentes com E(c) se dessincronizado | cache sujo | C3 diz: não decidir | fraco | **Não confiável** | **NÃO EXPLICÁVEL** como verdade |
| Saldo AR aberto | `valor_aberto` / liquidações | títulos + liquidações | colunas | RPC liquidar | liquidações | Sim se origem preenchida | **PARCIALMENTE EXPLICÁVEL** |
| Saldo AP aberto | `valor_total − valor_pago` | AP + pagamentos | colunas | RPC pagar | pagamentos | Sim se `nfe_importacao_id` | **PARCIALMENTE EXPLICÁVEL** |

---

# Etapa 6 — Auditoria de negócio

| Operação | quem | quando | o quê | antes/depois | origem | motivo | aprovação |
|----------|------|--------|-------|--------------|--------|--------|-----------|
| Ajuste estoque | ator RPC | timestamp log | kardex | delta no log | UI estoque | motivo enum | gerente se exigido |
| Cancel venda | RPC | auditoria | status | snapshot | venda | — | token gerente paths |
| Sangria/suprimento | mov | timestamps | mov | saldo via E(c)/A | caixa | tipo | aprovação gerente |
| Preço cadastro | trigger histórico | sim | colunas | histórico | form | — | — |
| Liquidação AR | RPC | sim | liquidação | valores | caixa/origem | — | — |
| AP NF-e | confirm | sim | insert | — | nfe id | — | — |
| AP/CR manual | app/comando | parcial | insert | — | **opcional** | descricao | — |
| Fiscal enqueue/cancel | RPC service_role | sim | status/eventos | antes→depois | venda/doc | justificativa cancel | — |

Logs técnicos (Sentry/edge) **não** substituem as lacunas de origem em AR/AP manuais nem o cache A.

---

# Etapa 7 — Achados (violações)

### SSOT-001

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | **P1** (vira P0 se Contábil/Intelligence consumirem) |
| **Evidência** | `backend/supabase/migrations/20261005004647_financeiro_loja_contas_ledger.sql:384-385`; UI `FinanceiroWorkspace.tsx` MetricCard “Dinheiro nos PDVs abertos”; comentário C3 `20261001100100_…sql:191` |
| **Regra afetada** | \(E(c)\) é autoridade; `saldo_atual` não é decisão financeira |
| **Fonte atual** | `sum(caixas.saldo_atual)` |
| **Canônica** | soma de `calcular_valor_sistema_dinheiro_caixa` por caixa aberto |
| **Impacto** | KPI financeiro mente; Contábil/Intelligence herdariam mentira |
| **Cenário** | Trigger/cancel dessincronizam A; painel mostra R$ X; fechamento PDV mostra E(c)=Y |
| **Menor correção** | Trocar SELECT do painel para autoridade E(c); manter `saldo_atual` só operacional |
| **Teste** | Após venda DINHEIRO + sangria: `saldo_pdv` ≡ soma E(c); após cancel: permanece coerente |

### SSOT-002

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | **P1** |
| **Evidência** | Trigger `20260731195933_credita_saldo_caixa_venda_dinheiro.sql:51-54`; cancel incremental `20260909200000_…`; sync só em devolver `20261001100200`/`100400`; C3 `sincronizar_saldo_cache` |
| **Regra afetada** | Um modelo de caixa — cache derivado **ou** contador único, não ambos divergentes |
| **Fonte atual** | Mistura updates incrementais + sync pontual |
| **Canônica** | `internal.valor_sistema_dinheiro` + cache sincronizado |
| **Impacto** | Sangria/guards que ainda leem A podem falhar ou passar indevidamente |
| **Cenário** | Liquidação AR credita A; E(c) também inclui AR — risco de double-count no cache se misturado com trigger |
| **Menor correção** | Em todo writer que altera componentes de E(c), `PERFORM sincronizar_saldo_cache`; ou dropar trigger e depender só do sync |
| **Teste** | Matriz: venda / sangria / cancel / devolver / liquidar AR → A == E(c) em caixa aberto |

### SSOT-003

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | **P1** (bloqueia Importações) |
| **Evidência** | `confirmar_importacao_nfe` estoque `:141-147` vs AP só no loop duplicatas `:188-199` (`20261005225856_…sql`); `receber_ordem_compra` / remessa sem AP (`20260918100000_…`) |
| **Regra afetada** | Consequência econômica → Financeiro com origem |
| **Fonte atual** | Estoque sobe; AP opcional |
| **Canônica** | Política explícita: (a) exigir duplicata/AP na confirmação econômica **ou** (b) marcar entrada como “sem obrigação” auditada |
| **Impacto** | Importações/Contábil subestimam passivo |
| **Cenário** | NF-e confirmada sem `importacoes_nfe_duplicatas` → estoque +R, AP=0 |
| **Menor correção** | Guard na confirm: se valor da nota > 0 e zero duplicatas → rejeitar **ou** criar AP única com origem; documentar remessa/OC como “sem título” |
| **Teste** | Confirm NF-e sem duplicatas falha ou cria 1 AP; com duplicatas N APs |

### SSOT-004 — **FECHADO** (sprint GO CONDICIONAL)

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | P1 → fechado |
| **Correção** | Removido `enfileirarDocFiscalStub`; mig `20261007161220` REVOKE INSERT; gate `check-entity-ssot-boundary.mjs` |
| **Canônica** | só `fiscal_enfileirar_*` / worker RPCs |

### SSOT-005 — **MITIGADO**

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | P2 → mitigado |
| **Correção** | Modal/combobox grava via `createSupplier` → `salvarFornecedorAction`; rule entity-ssot atualizada |
| **Residual** | Preferir `/admin/fornecedores` para navegação; não replicar atalho em outras telas |

### SSOT-006 — **FECHADO**

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | P2 → fechado |
| **Correção** | Removido `criarCliente` + `validarCriarClienteInput` de `gerente/financeiro`; gate entity-ssot |

### SSOT-007

| Campo | Conteúdo |
|-------|----------|
| **Severidade** | **P2** |
| **Evidência** | `registrar_venda_com_itens` sem `contas_receber`; v4 online cria CR |
| **Regra** | Parcial → CR canônico |
| **Menor correção** | Documentar “offline integral only” + guard; ou portar CR |
| **Pode ser depois** | Sim até Mobile/Local parcial |

### SSOT-008 … SSOT-012

Ver seção “Pode ser corrigido posteriormente” (D-P3, linha estoque zero, drift mapa UX-03, origem AR/AP manual, órfão fiscal pós-cancel). Evidências no inventário.

---

## O que está saudável (não regredir)

1. Preço efetivo de venda: um motor PG + espelho offline — sem terceiro atacado.
2. App não UPDATE `estoque.quantidade_atual` direto; REVOKE authenticated UPDATE.
3. Finalize/cancel/devolver de vendas só via RPC; v2/v3 stubbed.
4. Fechamento PDV e UI de turno usam \(E(c)\), não `saldo_atual` como esperado.
5. Venda canônica não INSERT `movimentacoes_caixa`.
6. Focus permanece adapter; status fiscal SSoT no Postgres.
7. PDV não cria produto nem cliente completo.

---

## Próximo passo recomendado (fora desta missão)

1. **Reality Check** Products→Cash→Financial (invariantes E(c)/painel + origem AP).
2. PR mínimo SSOT-001 + SSOT-002 (caixa/painel).
3. PR SSOT-003 (política AP na entrada) antes de Importações.
4. Aplicar mig `20261007161220_fiscal_cancelado_ssot.sql` no remoto Jinlong (fora deste sprint — só validação local).
5. Reavaliar **GO pleno** para módulos grandes só após 1–3.
