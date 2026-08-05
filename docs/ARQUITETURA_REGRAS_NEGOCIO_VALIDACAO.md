# Validação de Coerência — `docs/ARQUITETURA_REGRAS_NEGOCIO.md`

> 📎 **DOCUMENTO HISTÓRICO — não é autoridade e não é fila de execução.**
> Validou a **v1.0** da arquitetura. As 3 contradições (C1, C2, C3) e os 8 itens do §9 foram
> **integralmente aplicados** nas versões v2.0 e v2.1. Ler §8 e §9 como estado *anterior*:
> o veredito *"NÃO — está ~85% completo"* e a lista *"o que corrigir antes de liberar o Claude
> Code"* **já foram executados**.
> **Valor que permanece:** as matrizes de §1, §3 e §7 (RN → autoridade → migration → tabela →
> trigger → tela → teste), citadas como fonte de verificação por `MATRIZ_RASTREABILIDADE.md`.
> **Autoridade vigente:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md` v2.1.

> **Natureza:** somente leitura. Nenhum código, migration, teste ou documento existente foi alterado.
> **Data:** 2026-08-04 · **Base:** 239 migrations em `backend/supabase/migrations`, `shared-core/src/*`,
> `pdv-importados`, `pdv-local`, `scripts/*guard*.mjs`.
> **Objetivo:** impedir que o Claude Code implemente correções sobre arquitetura incompleta ou contraditória.
> **Não gera tickets.** Lacunas aqui são lacunas *da arquitetura documentada*, não achados novos de código.

## Veredito de uma linha

O documento **é utilizável como autoridade**, mas **não está completo**: encontrei **3 contradições reais**,
**4 autoridades omitidas** (existem no código, não estão no Cap. 2) e **1 camada inteira de governança
ausente** (os 9 `guard:*` do `package.json`, que já são autoridade executável). Detalhe abaixo.

---

## 1. Autoridades por RN

Legenda de Status: **OK** = uma autoridade, sem duplicação · **DUPLICADA** = mais de uma implementação da
decisão · **INCOMPLETA** = autoridade existe mas não cobre o que a RN afirma · **AUSENTE** = sem autoridade
efetiva · **DOC-INCORRETO** = a autoridade no documento não corresponde ao código.

| RN | Autoridade no doc | Implementações encontradas | Status |
|---|---|---|---|
| RN-001 preço válido p/ publicado | Banco CHECK + `calcular_preco_produto` | `001_schema_inicial.sql:70` `check (preco_varejo >= 0)`; RPC em migrations 234/245/250 | **INCOMPLETA** — o CHECK é `>= 0`, não "preço válido para publicação"; nada liga preço a `status_publicacao` |
| RN-002 NCM p/ fiscal | RPC fiscal + `chk_produto_ncm_formato` | `210_fiscal_campos_produto.sql` (ncm/cfop/cest) | **OK** (formato; obrigatoriedade fica na RPC fiscal) |
| RN-003 pagamento ≤ saldo | CHECK + `registrar_pagamento_contas_pagar` | `108_*.sql`: CHECKs `valor_total>0`, `valor_pago>=0`, status enum; RPC lê `valor_total, valor_pago` | **INCOMPLETA** — não há CHECK `valor_pago <= valor_total` (é exatamente o TB-07) |
| RN-004 venda exige caixa aberto | `trg_fn_vendas_caixa_aberto` | triggers `trg_vendas_caixa_aberto_bi` / `_bu` | **OK** |
| RN-005 estoque não negativo | triggers + `decrementar_estoque_seguro` | `decrementar_estoque_seguro` (016,017,029,030,032,038,127), `decrementar_estoque_idempotente` (007,015,070 → delega), `trg_estoque_anomalia` | **OK** (070 consolidou a delegação; anomalia é detecção, não bloqueio) |
| RN-006 desconto do gerente | `managerDiscount/policy.ts` + `trg_fn_itens_venda_limite_desconto` | `shared-core/src/managerDiscount/policy.ts`; reexport `pdv-importados/stores/managerDiscount.ts`; consumo em `CaixaGerenteModal.tsx`, `CaixaPageClient.tsx`, `pdv-local`; triggers `trg_itens_venda_limite_desconto_bi/_bu` (122) | **OK** — reexport é ponte de import, não segunda regra |
| RN-007 atacado < varejo | Banco CHECK | **nenhum CHECK encontrado** para essa relação | **AUSENTE** (coerente com TB-02) |
| RN-008 margem mínima | triggers `trg_fn_*_margem` | `124` (precos_atacado, regras_preco), `125` (produtos) + 9 triggers `_bi/_bu/_biu` | **OK** |
| RN-009 uma loja por entidade | `loja_id` + RLS | `clientes` ✅ (`clientes_loja_documento_unique`, mig 266); `contas_receber` ✅ (mig 112); **`fornecedores` ❌** (`075`: só `id, cnpj, nome`, `uq_fornecedores_cnpj` global) | **AUSENTE p/ fornecedores** (TB-05) |
| RN-010 CPF/CNPJ/e-mail no banco | Banco CHECK | só `clientes_tipo_check`; validação real em `shared-core/src/customers/policies/validateClienteInput.ts`; escrita por `customerWriter.ts` (`.from('clientes')` direto) | **AUSENTE no banco** (TB-04) |
| RN-011 produto + saldo atômico | `criar_produto_com_estoque_inicial` | mig 270 + `20260718135138` | **OK** |
| RN-012 idempotência | RPCs | `venda_evento_idempotency_key`, `chk_mov_caixa_idempotency_key_not_blank`, `decrementar_estoque_idempotente`, `24701_contas_receber_idempotencia_unique_venda` | **OK** (por RPC; não há padrão único documentado) |
| RN-013 estoque só via Writer/RPC | `InventoryMovementWriter` | `shared-core/src/inventory/contracts.ts:224`; RPCs `registrar_movimentacao`, `ajustar_estoque_manual`, `transferir_estoque_seguro` | **OK** |
| RN-014 fiscal enfileirado | `fiscal_enfileirar_documento_venda` | migs 062,066,069,090,099,114 + `backend/supabase/functions/fiscal-worker` + máquina de estado (092) | **OK** |
| RN-015 KPI por RPC | RPCs agregadas | `kpis_venda_eventos_gerente`, `dashboard_gerente_resumo`, 9× `relatorio_*` | **OK** |
| RN-016 permissão no banco | RLS + Policy | 199 `CREATE POLICY` no histórico | **OK como princípio**; divergências pontuais são SEC-01/02 |
| RN-017 fuso da loja | RPC + `relatorio_tz_validado` | `013_relatorios_timezone_configuravel.sql` (+ `relatorio_settings_normalize_timezone`, trigger) | **INCOMPLETA** — existe para relatórios; não cobre "histórico do operador" (TB-06) |
| RN-018 cadastro incompleto | Cap.1 P3 | `productEngine.ts` (`statusInicialProduto`) | **OK** |
| RN-019 produto só no catálogo | `entity-ssot.mdc` | `20260730093000_revoga_operador_cadastro_produto_pdv.sql` + `check:entity-ssot` | **OK** (regra com guard e migration — a mais bem sustentada do catálogo) |
| RN-020 só a `_v4` | Cap. 2 | v2/v3 substituídas por stub `LEGACY_DISABLED_USE_V4` (migs `20260619174508`, `20260619234314`, `20260620020436`); `268` consolidou overload único; `277`/`286` revogaram grants | **OK — e mais forte que o documento afirma** |
| RN-021 evento de auditoria | triggers / `registrar_venda_evento` | `20260707000000_venda_eventos_ledger.sql`, `ensure_venda_evento_registrado`, `tg_documentos_fiscais_eventos_*` | **OK** |
| RN-022 segredos em env | `.cursor/rules/security.mdc` | fora de escopo de código verificável aqui | **OK (política)** |

### Duplicações reais encontradas: 1 — e é intencional

`calcular_preco_produto` (RPC) **e** `shared-core/src/pricing/calcularPrecoCanonico.ts` calculam preço.
Não é violação: o arquivo se declara *"porta TypeScript bit-a-bit de `calcular_preco_produto` (migration 250)"*,
existe porque o `pdv-local` é offline-first, e a paridade é **testada** (`offlineRpcEquivalence.golden.test.ts`,
`operationalParity.prod-fixture.test.ts`) e **guardada** (`scripts/pricing-rpc-guard.mjs`, que proíbe
`PricingService` em runtime online).

**Contradição com o documento:** o Cap. 1 Princípio 1 diz *"nunca implementar a mesma regra em múltiplos
lugares"* e o Cap. 2 lista uma única autoridade de preço. O código tem uma **exceção arquitetural aprovada e
blindada**, que o documento não menciona. Um agente lendo só o documento pode "corrigir" o espelho offline e
quebrar o PDV local. **Esta é a lacuna mais perigosa do documento.**

---

## 2. Fluxos — todos têm responsável?

| Fluxo | Autoridade encontrada | Status |
|---|---|---|
| Cadastro (produto) | `productEngine.ts` (`evaluateProduct`, `statusInicialProduto`) + `criar_produto_com_estoque_inicial` + `validateProductInput` | **Coberto** — mas `productEngine` **não está no Cap. 2** |
| Cadastro (cliente) | `validateClienteInput.ts` + `customerWriter.ts` (INSERT direto, sem RPC) | **Coberto no doc, frágil no código** |
| Cadastro (fornecedor) | nenhuma policy em `shared-core`; tabela mínima (mig 075) | **Sem responsável** |
| Compra (OC) | tabela `ordens_compra` (mig 109, status enum 5 valores) + `receber_ordem_compra` (110) | **Coberto**; enum não está no Cap. 3 |
| Recebimento | `remessas` + `registrar_conferencia_remessa` / `confirmar_remessa_entrada` (`20260801120000`) + `recebimentoStatus.ts` (transições em TS) | **Coberto — e o doc está desatualizado** (ver §6, ADR-004) |
| Estoque | `InventoryMovementWriter` + RPCs | **Coberto** |
| Venda | `finalizar_venda_transacional_canonica_v4` (+ espera, devolução, cancelamento) | **Coberto** |
| Caixa | `fechar_caixa_atomico` (207) / `fechar_caixa_pdv_atomico` (227) / `recalcular_saldo_caixa` / `obter_status_caixa_operador` (230) | **Coberto**; o doc não distingue web × PDV-local |
| Financeiro | `registrar_pagamento_contas_pagar`, `registrar_liquidacao_receber`, triggers `trg_finance_context_*`, `sincronizar_finance_context_venda` | **Coberto**; contexto financeiro não citado no doc |
| Fiscal | família `fiscal_*` + `functions/fiscal-worker` + máquina de estado (092) + cron desagendado (285) | **Coberto** |
| Auditoria | `venda_eventos` ledger + `verificar_consistencia_venda` + `relatorio_consistencia_vendas` | **Coberto** |

**Nenhum fluxo ficou sem responsável, exceto o cadastro de Fornecedor** — que é a mesma raiz de TB-05.

---

## 3. Banco — o que existe por RN (lacunas de arquitetura, sem ticket)

| RN | CHECK | FK | UNIQUE | Trigger | RPC | RLS | Lacuna registrada |
|---|---|---|---|---|---|---|---|
| RN-001 | parcial | ✔ | — | — | ✔ | ✔ | CHECK não liga preço a publicação |
| RN-002 | ✔ | — | — | — | ✔ | ✔ | obrigatoriedade só na RPC |
| RN-003 | parcial | ✔ | ✔ (idem. venda) | — | ✔ | ✔ | falta `valor_pago <= valor_total` |
| RN-004 | — | ✔ | — | ✔ | ✔ | ✔ | — |
| RN-005 | ✔ | ✔ | — | ✔ | ✔ | ✔ | — |
| RN-006 | — | ✔ | — | ✔ | ✔ | ✔ | — |
| RN-007 | ✗ | — | — | ✗ | parcial | — | sem espelho no banco |
| RN-008 | `margem_range_valid` | — | — | ✔ ×9 | — | — | — |
| RN-009 | — | ✔ (clientes/CR) | ✔ (clientes) | — | — | ✔ | `fornecedores` sem `loja_id`/FK/UNIQUE composto/RLS por loja |
| RN-010 | só `tipo` | ✔ | ✔ (doc+loja) | — | ✗ (INSERT direto) | ✔ | sem CHECK de formato; sem RPC |
| RN-011..015, 021 | — | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| RN-017 | — | — | — | ✔ (tz settings) | ✔ | — | cobertura só de relatórios |

Constraints matemáticas fortes já existem e o documento **não as cita**: `vendas_identidade_totais`
(`total_liquido = total_bruto - total_desconto`), `itens_venda_desconto_ate_preco_original`,
`itens_venda_*_nao_negativo` (mig 279) e `280_check_formato_chave_fiscal`. Isso é regra de negócio sem RN.

---

## 4. Catálogo RN — duplicadas, conflitantes, órfãs

- **RN duplicadas:** nenhuma. Os 22 IDs são semanticamente distintos.
- **RN conflitantes:** **1**. RN-001 ("preço válido") × RN-007 ("atacado < varejo") × CHECK real
  `preco_varejo >= 0`. O doc marca as duas como divergentes, mas não diz qual é o valor-alvo de
  "válido" (`> 0`? `>= 0`?) — que é justamente a decisão que TB-03 exige. **Um agente não consegue
  implementar RN-001 sem inventar o limite.**
- **RN órfãs (sem implementação alguma):** RN-007.
- **Regras implementadas sem RN** (7 encontradas):
  1. Status inicial por origem: humano → `PUBLICADO/ativo`, import → `DRAFT/inativo` (`PRODUCT_RULES`, mig 232/233).
  2. Identidade de totais da venda (`vendas_identidade_totais`, mig 279).
  3. Sangria só em dinheiro (`chk_mov_caixa_sangria_apenas_dinheiro`) e estorno não-reflexivo (`chk_mov_caixa_nao_estornar_si_mesmo`).
  4. Limite de sangria sem gerente (`obter_limite_sangria_sem_gerente`, mig 047).
  5. Máquina de estados fiscal (`tg_documentos_fiscais_estado_bi/_bu`, mig 092) + backoff quadrático (093).
  6. Versionamento de precificação (`pricing_version_id`, migs 249/254) e congelamento de comissão (`20260711020053`).
  7. Precedência promoção × atacado × varejo (`calcular_promocao_aplicavel`, mig 274).
- **RN sem implementação:** RN-007 (ver acima). RN-022 é política, não código.

---

## 5. Máquinas de estado — suficiência

| Entidade | Estados no código | Doc Cap. 3 | Suficiente? |
|---|---|---|---|
| Produto | `DRAFT / PUBLICADO / INATIVO` (mig 232 + `PRODUCT_RULES`) | 5 estados (`RASCUNHO→CADASTRADO→PUBLICADO→VENDÁVEL→INATIVO`) | **NÃO — divergente.** O banco tem 3, o doc inventa 5. `VENDÁVEL` não é estado, é predicado derivado (`ativo && PUBLICADO`) |
| Venda | `CONCLUIDA / CANCELADA` (mig 001) + vendas em espera | ausente | Não |
| Caixa | `ABERTO / FECHADO` (+ `ERRO` operacional, mig 230) | ausente | Não |
| Ordem de Compra | `RASCUNHO/CONFIRMADA/EM_TRANSITO/RECEBIDA/CANCELADA` | ausente | Não |
| Recebimento (remessas) | `RASCUNHO/EM_CONFERENCIA/CONFERIDO/DIVERGENTE/CONCLUIDA/CANCELADA` + transições em `recebimentoStatus.ts` | ausente | Não |
| Contas a Pagar | `PENDENTE/PARCIAL/PAGO/ATRASADO/CANCELADO` | ausente | Não |
| Contas a Receber | `ABERTO/PARCIAL/QUITADO/CANCELADO` | ausente | Não |
| Movimentação de caixa | `pendente/aprovado/cancelado` | ausente | Não |
| Documento fiscal | máquina explícita (mig 092) | ausente | Não |
| Cliente | sem máquina de estados no código | ausente | Não aplicável hoje |
| Fornecedor | sem máquina de estados | ausente | Não aplicável hoje |

**Todas as 8 máquinas ausentes já existem no banco como CHECK.** Não precisam ser inventadas — precisam ser
transcritas. O único caso que exige decisão é Produto, onde doc e banco divergem.

---

## 6. ADRs — bloqueiam implementação?

| ADR | Pergunta | Bloqueia? | Justificativa técnica |
|---|---|---|---|
| **ADR-001** Fornecedor global ou por loja? | **SIM** | `fornecedores` tem só `id, cnpj, nome` e `uq_fornecedores_cnpj` global. Adicionar `loja_id` exige backfill de dados existentes e quebra `uq_fornecedores_cnpj`; `ordens_compra.fornecedor_id` e `importar_nfe_transacao` dependem da tabela. Sem a decisão, o Claude escolheria o modelo de dados sozinho. |
| **ADR-002** Go-Live com fiscal? | **NÃO bloqueia código; SIM bloqueia escopo** | A infra fiscal está construída (RPCs, worker, máquina de estado 092, cron **desagendado** em 285). Nada precisa ser implementado para decidir — a decisão é ligar ou não. Nenhum ticket de código depende dela. |
| **ADR-003** Limite de crédito | **SIM** | `clientes.limite_credito` existe com CHECK, mas `246_remover_venda_fiado` e `284_devolucoes_remove_fiado` removeram o fiado. Campo órfão: implementar ou remover são migrations opostas e irreversíveis entre si. |
| **ADR-004** Conferência: OC ou remessas? | **NÃO — já foi decidido de fato** | `20260801120000_recebimento_conferencia_explicita` **já migrou para `remessas`**, criou `registrar_conferencia_remessa`, estados `CONFERIDO/DIVERGENTE` e a exceção `RECEBIMENTO_CONFERENCIA_PENDENTE`, com espelho em `recebimentoStatus.ts`. O ADR está pendente **no papel**, resolvido no código. Ação: ratificar, não decidir. |
| **ADR-005** Reabertura de caixa | **SIM** | `caixas.status` só admite `ABERTO/FECHADO`; `fechar_caixa_atomico` é idempotente e `206` torna vendas imutáveis após fechamento. Permitir reabertura exige novo estado + revisão da imutabilidade. Não é implementável por inferência. |

**Resultado para o Claude:** dos 5 ADRs, **3 bloqueiam de fato** (001, 003, 005), **1 é decisão de escopo sem
código** (002) e **1 é ratificação documental** (004).

---

## 7. Matriz de dependências (RN → RPC → Migration → Tabela → Trigger → Tela → Testes)

| RN | RPC | Migration | Tabela | Trigger | Tela | Testes |
|---|---|---|---|---|---|---|
| RN-001/007 | `calcular_preco_produto` | 234, 245, 250 | `produtos`, `precos_atacado`, `regras_preco` | `trg_historico_precos_produto` | `/admin/catalogo`, `/caixa` | `calcularPrecoCanonico.spec.ts`, `productPriceReader.test.ts`, `offlineRpcEquivalence.golden.test.ts` |
| RN-002 | família `fiscal_*` | 210, 280 | `produtos`, `documentos_fiscais` | `tg_documentos_fiscais_estado_*` | `/admin/financeiro` (fiscal) | — |
| RN-003 | `registrar_pagamento_contas_pagar` | 108, 104 | `contas_pagar`, `pagamentos` | `trg_finance_context_pagamento` | `/admin/financeiro` | `financial.spec.ts` |
| RN-004 | `finalizar_venda_*_v4` | 243, 268 | `vendas`, `caixas` | `trg_vendas_caixa_aberto_bi/_bu` | `/caixa` | `finalizarVendaCaixa.integration.test.ts` |
| RN-005 | `decrementar_estoque_seguro` | 016,017,029,030,032,038,070,127 | `estoque`, `estoque_baixas`, `kardex` | `trg_estoque_anomalia` | `/admin/estoque/*` | `inventory.spec.ts` |
| RN-006 | v4 + validar-gerente (edge) | 122, 272 | `itens_venda` | `trg_itens_venda_limite_desconto_bi/_bu` | `/caixa` (`CaixaGerenteModal`) | `managerDiscount/policy.test.ts` |
| RN-008 | — | 124, 125 | `produtos`, `precos_atacado`, `regras_preco` | `trg_*_margem_bi/_bu/_biu` (9) | `/admin/catalogo` | — |
| RN-009 | — | 112, 266 (ok) · 075 (falha) | `clientes`, `contas_receber` · `fornecedores` | — | `/admin/clientes`, `/admin/fornecedores` | — |
| RN-010 | — (INSERT direto) | 253, 266 | `clientes` | — | `/admin/clientes` | `validateClienteInput.spec.ts` |
| RN-011 | `criar_produto_com_estoque_inicial` | 270, `20260718135138` | `produtos`, `estoque` | — | `/admin/catalogo` | — |
| RN-012 | `venda_evento_idempotency_key` | `20260707000000`, 24701 | `venda_eventos`, `contas_receber` | — | — | `saleEvent.spec.ts` |
| RN-013 | `registrar_movimentacao`, `transferir_estoque_seguro`, `ajustar_estoque_manual` | 045, 063, 082, 269 | `movimentacoes_caixa`, `estoque`, `remessas` | `trg_estoque_anomalia` | `/admin/estoque/*` | `validateAdjustInventory.spec.ts` |
| RN-014 | `fiscal_enfileirar_documento_venda` | 062,066,069,090,099,114,285 | `documentos_fiscais`, `..._eventos` | `tg_documentos_fiscais_*` (5) | `/admin/financeiro` | — |
| RN-015 | `kpis_venda_eventos_gerente`, `relatorio_*` | 011–013, 064, 238–242, 264 | `vendas`, `venda_eventos` | — | `/admin` dashboards | — |
| RN-017 | `relatorio_tz_validado` | 012, 013 | `relatorio_settings` | `relatorio_settings_tz_trigger` | relatórios | — |
| RN-019 | `criar_produto_com_estoque_inicial` | `20260730093000` | `produtos` | — | `/admin/catalogo` | `check:entity-ssot` |
| RN-020 | `..._v4` (v2/v3 = stub) | `20260619174508`, `20260619234314`, `20260620020436`, 268, 277, 286 | `vendas` | — | `/caixa` | `guard:rpc` |
| RN-021 | `registrar_venda_evento`, `verificar_consistencia_venda` | `20260707000000`, `20260707020000` | `venda_eventos` | triggers fiscais | `/admin/auditoria` | `relatorio_consistencia_vendas` |

**Células vazias em "Testes" são a maior fragilidade operacional:** RN-002, RN-008, RN-009, RN-011, RN-014 e
RN-015 não têm teste automatizado localizável. Correções nelas não terão evidência verificável (Regra de
Evidência ⇒ ficariam em "Em Implementação" mesmo após o merge).

### Camada de governança executável ausente do documento

O `package.json` já expõe **9 guards** que são autoridade real e rodam em CI:
`guard:core`, `guard:pdv`, `guard:routes`, `guard:rpc`, `guard:pricing`, `guard:deps`, `guard:migrations`,
`guard:domain`, `check:entity-ssot` (agregados em `guard:all`), mais `check:vendabilidade`.
O documento cita apenas `check:entity-ssot`. Um agente que só leia o Cap. 9 desconhece 9 gates que
**vão reprovar seu PR**.

---

## 8. Critério de execução — as cinco perguntas

### 8.1 O documento está completo para servir de autoridade?

**NÃO — está ~85% completo.** Serve como autoridade para *fluxos e responsabilidades*, não como
referência única para implementar. Faltam, em ordem de risco:

1. A **exceção offline de pricing** (`calcularPrecoCanonico`), que o doc contradiz frontalmente.
2. O **`productEngine`** como autoridade de vendabilidade/status inicial — hoje invisível no Cap. 2.
3. Os **9 guards de CI** como camada de governança executável.
4. **8 máquinas de estado** que existem no banco e não no Cap. 3.
5. **7 regras implementadas sem RN** (§4).

### 8.2 Existe alguma contradição?

**SIM — três.**

| # | Contradição | Consequência se não resolvida |
|---|---|---|
| C1 | Princípio 1 (fonte única) × espelho offline de pricing testado e guardado | Agente pode remover o espelho e quebrar o PDV local |
| C2 | Cap. 3 define 5 estados de Produto; banco e `PRODUCT_RULES` têm 3 (`DRAFT/PUBLICADO/INATIVO`) | Agente pode criar migration para estados que não existem |
| C3 | ADR-004 listado como pendente, mas já implementado em `20260801120000` | Agente pode reimplementar conferência ou travar esperando decisão |

### 8.3 Existe alguma regra sem autoridade?

**SIM — duas.** RN-007 (atacado < varejo) não tem nenhuma implementação no banco. RN-009 não tem autoridade
para **fornecedores** (tabela sem `loja_id`, sem RLS por loja). RN-001, RN-003, RN-010 e RN-017 têm autoridade
**parcial** — existem, mas não cobrem o que a RN afirma.

### 8.4 Existe alguma autoridade sem regra?

**SIM — sete** (listadas em §4): status inicial por origem, identidade de totais, invariantes de sangria/estorno,
limite de sangria sem gerente, máquina de estados fiscal, versionamento de precificação/congelamento de comissão,
precedência de promoção. São regras de negócio reais, ativas em produção, sem `RN-XXX`. Uma auditoria futura não
conseguiria citá-las; um agente pode alterá-las sem perceber que são normativas.

### 8.5 O Claude Code consegue implementar todos os tickets sem criar novas regras?

**NÃO. Parcialmente.**

| Situação | Tickets | Pode implementar? |
|---|---|---|
| Regra plenamente definida | TB-07 (RN-003), TB-04 (RN-010), TB-06 (RN-017), SEC-01/SEC-02 | **SIM** — autoridade, tabela e forma da correção estão determinadas |
| Bloqueado por ADR | TB-05 (ADR-001), BR-01 (ADR-003), BR-04 (ADR-005) | **NÃO** — exige decisão da direção |
| Bloqueado por parâmetro ausente | TB-02, TB-03 (RN-001/RN-007) | **NÃO** — o doc não diz se preço válido é `> 0` ou `>= 0`, nem o operador de comparação atacado×varejo. O agente teria de **inventar a regra** |
| Ratificação documental | FLX-04 (ADR-004) | **N/A** — já implementado |

**Conclusão:** dos 29 tickets, aproximadamente **metade é implementável hoje**. O restante trava por
3 ADRs genuínos + 1 parâmetro numérico não decidido (RN-001/RN-007), que é decisão de produto barata mas
inexistente.

---

## 9. O que corrigir no documento antes de liberar o Claude Code

Sem alterar código. Ordem de valor:

1. **Cap. 1 / Cap. 2 — registrar a exceção offline de pricing**, citando `pricing-rpc-guard.mjs` e os testes de
   paridade. Sem isso, o Princípio 1 é uma armadilha. *(risco: quebra do PDV local)*
2. **Cap. 3 — alinhar Produto ao banco**: 3 estados + `vendável` como predicado derivado. *(risco: migration errada)*
3. **Cap. 8 — mover ADR-004 para "Ratificar"**, com referência à migration. *(risco: trabalho duplicado)*
4. **Cap. 2 — adicionar `productEngine` como autoridade** de vendabilidade e status inicial.
5. **Cap. 7 — decidir o parâmetro de RN-001/RN-007** (`> 0` vs `>= 0`; `<` vs `<=`). Desbloqueia TB-02/TB-03.
6. **Cap. 9 — listar `npm run guard:all`** como gate obrigatório.
7. **Cap. 7 — registrar as 7 regras órfãs** como RN-023..RN-029.
8. **Cap. 3 — transcrever as 8 máquinas de estado** já existentes no banco (trabalho mecânico, zero decisão).

Itens 1–3 são **bloqueantes de segurança de execução**: sem eles, um agente competente e obediente ao
documento causaria regressão.

---

## Nota de governança (Chief of Staff)

O documento passou no teste principal: **não inventou autoridade**. Tudo que ele nomeia existe no código —
com uma exceção de nomenclatura já corrigida na v1.0. O que faltou foi o inverso: o código tem **mais**
governança do que o documento reconhece (9 guards, 7 regras órfãs, uma exceção arquitetural testada).
Um documento que subestima o próprio sistema é mais perigoso do que um incompleto: ele autoriza o agente a
desfazer proteção existente em nome do princípio.

**Regra de Evidência:** este documento é **evidência de validação**, não de correção. Nenhum ticket muda de
status por causa dele. Os 29 permanecem em **"Em Implementação"**.

**Recomendação:** aplicar os itens 1–3 do §9 no documento-mãe (≈30 min, zero código) **antes** de liberar
qualquer execução, e levar à direção um pacote único com 3 ADRs + 1 parâmetro numérico. Isso destrava
aproximadamente metade da fila em uma sessão de decisão.



