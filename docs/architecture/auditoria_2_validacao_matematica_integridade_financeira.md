# Auditoria 2 — Validação Matemática e Integridade Financeira

| Campo | Valor |
|---|---|
| **Missão** | Provar (com evidência de código) se o sistema preserva integridade financeira e comercial em todos os fluxos |
| **Data** | 2026-07-25 |
| **Pré-requisito** | Auditoria 1 (inventário de cálculos, fontes de verdade, duplicações) — considerada aprovada, não repetida aqui |
| **Método** | Leitura direta de migrations (`backend/supabase/migrations/*.sql`), código TS (`shared-core`, `pdv-importados`, `pdv-local`) e testes existentes. Toda afirmação abaixo cita arquivo:linha. Nenhuma conclusão usa "provavelmente"/"parece"/"deve" sem uma citação ao lado. |

---

## 1. Auditoria de Invariantes Financeiros

### 1.1 `Subtotal − Desconto (+ Acréscimo) = Total`

- **Onde é calculado:** `finalizar_venda_transacional_canonica_v4`, corpo vigente em `backend/supabase/migrations/274_bl2_promocao_rpc_e_precedencia.sql:348-359`.
  ```sql
  v_total_bruto_calc := public.round_abnt(v_total_bruto_calc, 2);
  v_total_liquido_base_calc := public.round_abnt(v_total_liquido_base_calc, 2);
  v_total_desconto_base_calc := public.round_abnt(v_total_bruto_calc - v_total_liquido_base_calc, 2);
  v_total_desconto_final_calc := public.round_abnt(v_total_desconto_base_calc + v_desconto_gerente_valor, 2);
  v_total_liquido_final_calc := public.round_abnt(v_total_bruto_calc - v_total_desconto_final_calc, 2);
  ```
- **Fonte oficial:** Postgres (a RPC recalcula o preço de cada item via `calcular_preco_produto`/`calcular_promocao_aplicavel` e ignora o que o cliente mandou, comparando com tolerância).
- **Validação automática:** existe, mas é **procedural** (`RAISE EXCEPTION`), não é um `CHECK` de schema:
  ```sql
  IF ... ABS(v_total_bruto_calc - p_total_bruto) > 0.02 OR ... THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  ```
  (274:394-399)
- **Possibilidade de quebra:** **"Acréscimo" não existe como conceito no schema.** Não há coluna, variável ou campo de acréscimo em `vendas` nem na RPC — apenas `total_bruto`, `total_desconto`, `total_liquido`. O invariante como formulado (com "+ Acréscimos") **não é implementado**; classifico esse pedaço como **não comprovado** (não existe para provar). Além disso, a divergência client×server é tolerada até R$0,02 — não é igualdade exata.
- **Evidência:** `274_bl2_promocao_rpc_e_precedencia.sql:329-399`.

### 1.2 `Soma dos pagamentos = Valor líquido da venda`

- **Onde:** mesma RPC, `backend/supabase/migrations/055_round_abnt_finalize_v2.sql:156-172` (loop de soma) e `274:369-392,498-508` (segunda checagem pós-insert).
- **Fonte oficial:** Postgres, `vendas_pagamentos.valor` somado dentro da própria RPC.
- **Validação automática:** sim, procedural:
  ```sql
  IF v_pag_total > v_total_liquido_final_calc + 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL';
  END IF;
  IF v_pag_total <= 0.009 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTO_ZERO';
  END IF;
  ```
- **Possibilidade de quebra:** o invariante real implementado é `soma(pagamentos) ≤ total`, não `=`. O saldo (`v_saldo_pendente`) vira `contas_receber` — isso é fiado por design, não bug, mas **não é o invariante literal enunciado** pelo usuário. Tolerância de R$0,01 embutida.
- **Evidência:** `055_round_abnt_finalize_v2.sql:156-172`; `274:369-399,498-508`.

### 1.3 `Abertura + Entradas − Sangrias − Devoluções = Fechamento esperado`

- **Onde:** `calcular_valor_sistema_dinheiro_caixa`, `backend/supabase/migrations/20260718184800_adr_caixa_002_modelo_alpha_e_cancel.sql:7-108`.
  ```sql
  SELECT ROUND(
    COALESCE((SELECT t FROM abertura), 0)
    + (SELECT t FROM vendas_din)
    + (SELECT sup FROM mov_legado) - (SELECT sang FROM mov_legado)
    + (SELECT t FROM mov_tx)
    - (SELECT t FROM dev_din), 2)
  ```
- **Fonte oficial:** Postgres — a própria função se documenta como `E(c)` no comentário (linhas 107-108).
- **Validação automática:** existe uma comparação de divergência no lado shared-core (`shared-core/src/pdv/invariants/detectInvariants.ts:103`: `Math.round((valorFechamento - valorSistema) * 100) / 100`), mas é **diagnóstica** — sinaliza, não bloqueia o fechamento.
- **Possibilidade de quebra:** o próprio código documenta que devoluções só entram na fórmula se a venda ainda está `status='CONCLUIDA'`; para venda cancelada, o estorno em dinheiro debita `caixas.saldo_atual` por um caminho separado, e o comentário do arquivo diz explicitamente que `saldo_atual` **"não é SSoT"**. Ou seja: **dois números de "caixa atual" coexistem por design** (o calculado por `E(c)` e o `saldo_atual` armazenado), e podem divergir após cancelamentos.
- **Evidência:** `20260718184800_adr_caixa_002_modelo_alpha_e_cancel.sql:1-108,165-205`.

### 1.4 `Estoque Inicial − Venda + Devolução = Estoque Final`

- **Onde:** decremento em `decrementar_estoque_seguro` (`backend/supabase/migrations/127_kardex_vendas_imutavel.sql:50-171`); incremento por devolução em `devolver_ou_trocar_venda` (`backend/supabase/migrations/248_devolver_ou_trocar_venda.sql:419-423`); incremento por cancelamento em `20260718184800_...:165-169`.
- **Fonte oficial:** Postgres, `estoque.quantidade_atual`.
- **Validação automática:** guarda procedural contra estoque insuficiente (`IF v_quantidade_atual < p_quantidade THEN RETURN ... 'ESTOQUE_INSUFICIENTE'`), com lock otimista (`version`).
- **Possibilidade de quebra:** **`estoque.quantidade_atual` não tem `CHECK >= 0` no schema** (`001_schema_inicial.sql:116-122`). A única proteção é o `IF` dentro da RPC. Qualquer caminho que grave em `estoque` fora dessa RPC não é impedido pelo banco — e esse caminho já existe: `garantirLinhaEstoque` (INSERT direto, sem kardex), documentado como dívida `D-I3` em `docs/architecture/inventory_100_audit.md:116`.
- **Evidência:** `001_schema_inicial.sql:116-122`; `127_kardex_vendas_imutavel.sql:50-171`; `248_devolver_ou_trocar_venda.sql:358-423`.

---

## 2. Cadeia Financeira Completa (uma venda, ponta a ponta)

```
Produto (preco_varejo numeric(10,2))
  → calcular_preco_produto RPC (250/234) — resolve atacado/promoção
  → Carrinho (client roundMoney2 = Math.round(v*100)/100)
  → Desconto (managerDiscount clamp client-side; limite real vem de pdv_config no servidor)
  → Pagamento (vendas_pagamentos.valor, somado e validado ≤ total, tolerância 0.01)
  → Venda (vendas.total_bruto/total_desconto/total_liquido = variáveis da RPC, gravadas direto)
  → Contas a Receber (valor_total = MESMA variável v_total_liquido_final_calc; não recomputada)
  → Caixa (calcular_valor_sistema_dinheiro_caixa soma vendas_pagamentos.valor DINHEIRO — mesma coluna validada acima)
  → Fiscal (documentos_fiscais_pendentes — SEM COLUNA de valor monetário)
  → Relatórios (maioria soma vendas.total_liquido diretamente — mesma coluna)
  → Dashboard (idem — vendas.total_liquido)
```

**Pontos onde o valor muda, com motivo/evidência:**

1. **Preço original → preço unitário com desconto/atacado/promoção** — mudança esperada (não é bug), evidência: `calcular_preco_produto` (`250_calcular_preco_produto_decision_fields.sql:26-`).
2. **Cliente calcula localmente → servidor recalcula e aceita até R$0,02 de diferença** — tolerância de projeto, não igualdade exata. Evidência: `274:394-399`.
3. **`documentos_fiscais_pendentes` não guarda valor algum** — o valor fiscal, se existir, está dentro de `payload jsonb`, cujo conteúdo **não foi inspecionado por esta auditoria** (não há coluna que o banco possa comparar contra `vendas.total_liquido`). Isso é uma **lacuna comprovada de rastreabilidade**, não um erro de cálculo confirmado. Evidência: `035_fiado_fiscal_stub.sql:17-27`; inserção em `274:580-581` sem valor.
4. **Relatório `receita_estimada` diverge de `vendas.total_liquido` quando há desconto de gerente** — este é o achado mais concreto da cadeia. `backend/supabase/migrations/064_relatorio_resumo_executivo_periodo.sql` calcula:
   ```sql
   COALESCE(SUM(iv.quantidade * iv.preco_unitario), 0)::numeric(14,2) AS receita_estimada
   ```
   a partir de `itens_venda`, **sem** subtrair `v_desconto_gerente_valor` (que é aplicado só no total da venda, não redistribuído para `preco_unitario` de cada item — ver `274:348-359`). Toda vez que uma venda usa desconto de gerente (header-level), esse relatório **superestima a receita** em relação a `vendas.total_liquido`, que é a mesma fonte usada pelo dashboard (`078/079/080/100_dashboard_gerente_resumo*.sql`). **Não há indicação no código de que isso seja intencional** (nenhum comentário aborda o gap) — reporto como divergência, não como bug confirmado por falta de intenção declarada do autor original.

---

## 3. Auditoria de Precisão

### 3.1 Implementações de arredondamento encontradas

| Local | Implementação | Regra |
|---|---|---|
| `pdv-importados/core/money/roundAbnt.ts:1-57` | `Intl.NumberFormat(..., {roundingMode:'halfExpand'})`, fallback manual com epsilon `1e-11` | half-away-from-zero |
| `backend/supabase/migrations/055_round_abnt_finalize_v2.sql:5-11` | `ROUND(p_value::numeric, p_scale)` | half-away-from-zero (decimal exato, Postgres `numeric`) |
| `shared-core/src/pdv/invariants/money.ts:5-6`, `stores/unifiedCartStore.ts:90`, `managerDiscount/policy.ts:18`, `shared/cart/totals.ts:7-9`, `shared/pricing/PricingService.ts:66,68`, `caixaPrecoAutoritativoServer.ts:98`, `caixaPrecoProduto.impl.ts:58`, `catalog/sugestaoCadastro.ts:35,44`, `pricing/resultadoPrecoFromCanonico.ts:14`, `pdv/invariants/detectInvariants.ts:103` | `Math.round(v*100)/100` | **9 implementações independentes**, todas algébricamente "half-away-from-zero", mas nenhuma delas é a mesma função nem reexporta `roundAbnt` |
| `pdv-importados/lib/format/money.ts:41`, `CaixaPdvOperadorTabs.tsx:122`, `lib/thermal-printer/escpos.ts:93` | `.toFixed(2)` | algoritmo do spec ECMA-262 (arredonda o double *exato*, não a string decimal) |
| `pdv-local` (Rust/SQLite) | nenhuma — `grep -rn "round\|ROUND" pdv-local/src-tauri/src/*.rs` não retorna nada | passthrough do double recebido do JS |

**`roundAbnt.test.ts` importa `roundMoney2` de `@/shared/cart/totals` e assume que ele se comporta como `roundAbnt`** — mas são funções distintas (`Math.round` puro vs `Intl halfExpand`). Isso é uma suposição do próprio teste, não uma prova de equivalência entre as 9 implementações.

### 3.2 Casos de borda — resultado real por camada

| Valor | `roundAbnt` (Intl halfExpand) | `Math.round(v*100)/100` | `v.toFixed(2)` | Postgres `ROUND(numeric,2)` | SQLite (pdv-local) |
|---|---|---|---|---|---|
| 0.005 | 0.01 | 0.01 | "0.01" | 0.01 | passthrough do valor recebido |
| **0.015** | **0.02** | **0.02** | **"0.01"** ⚠️ | **0.02** | passthrough |
| 10.335 | 10.34 | 10.34 | "10.34" | 10.34 | passthrough |
| 99.995 | 100.00 | 100 | "100.00" | 100.00 | passthrough |
| 9999.995 | 10000.00 | 10000 | "10000.00" | 10000.00 | passthrough |

**Divergência comprovada:** em 0.015, `.toFixed(2)` produz `"0.01"` enquanto `roundAbnt`/`Math.round`-based produzem `0.02` — mesmo double de entrada (`0.014999999999999999445` em binário), algoritmos diferentes (`toFixed` arredonda o valor binário exato; `Intl`/`Math.round` operam sobre a representação decimal "0.015"). `.toFixed(2)` é usado em contexto monetário em `money.ts:41`, `CaixaPdvOperadorTabs.tsx:122` (campo de valor de pagamento) e `escpos.ts:93` (recibo impresso).

**SQLite não arredonda nada** — qualquer garantia de paridade com Postgres depende 100% do que o JS gravou antes de sincronizar; não há teste que confirme paridade pós-sync.

**Nenhum dos 5 valores pedidos pelo usuário (0.005/0.015/10.335/99.995/9999.995) está fixado em teste algum** — `roundAbnt.test.ts` testa outros valores (1.005, 10.125, -2.555, 0.1255, etc.), não estes.

---

## 4. Auditoria de Cenários Limite

| Cenário | Evidência | Observação |
|---|---|---|
| Desconto máx. por item | `122_limite_desconto_manual_itens.sql:26,74-87` — trigger `RAISE EXCEPTION 'DESCONTO_MANUAL_EXCESSIVO'` a 15% padrão | Enforced no banco |
| Desconto máx. de gerente | `122:176-178` — limite vem de `pdv_config.max_desconto_gerente_percentual` (servidor); mirror client `shared-core/src/managerDiscount/policy.ts:15` (`DEFAULT_MAX = 20`, hardcoded) | Cliente usa **default fixo de 20%** como fallback, servidor usa config do banco — se o config do banco mudar, cliente e servidor podem discordar até a RPC rejeitar. Confirma a dívida D-F2 já documentada em `docs/architecture/financial_100_audit.md`. |
| Desconto zero | `122:204,213-214` | Mesmo caminho aritmético roda com desconto=0; não há branch separado — confirmado seguro |
| Qtd. mínima atacado / troca de faixa exata | `077_precos_atacado_tiers_e_rpc.sql:92` (`quantidade_minima <= p_quantidade`) + teste `shared-core/src/pricing/calcularPrecoCanonico.spec.ts:57-67` | Fronteira é **inclusiva** (quantidade == mínimo já ativa atacado), comprovado por teste |
| Pagamento parcial / múltiplas formas | `vendas_pagamentos` (`051_split_payment_vendas_pagamentos.sql:3-11`, `CHECK valor > 0`); soma validada com tolerância 0.01 (`055:156-172`) | Saldo não pago vira `contas_receber` |
| Cancelamento parcial | `cancelar_venda_transacional` (migration 059:110-168) — só a parcela em DINHEIRO debita `saldo_atual`; demais formas ficam em `devolucoes` sem tocar caixa | Comportamento assimétrico por forma de pagamento, é o design (ADR-CAIXA-002) |
| Devolução parcial | `248_devolver_ou_trocar_venda.sql:358-373` | **Tolera até R$0,02 de resíduo** entre valor declarado e recalculado sem reconciliação adicional (`IF ABS(v_valor_estorno - v_total_itens) > 0.02 THEN RAISE EXCEPTION`) |
| Troco com centavos | `caixaPagamentoSaldo.test.ts` testa inclusive `0.1+0.2` vs `0.3` (ruído de float) | **Comprovadamente testado e correto** |
| Valores muito pequenos | Guarda contra divisão por zero em `122:58` (`preco_unitario_original <= 0` pula o cálculo de %) | Sem teste específico de valores muito pequenos além disso |
| Valores muito altos | Colunas `numeric(10,2)` (limite ~99.999.999,99) | Sem teste de overflow; sem guarda de `Number.MAX_SAFE_INTEGER` no lado JS |

---

## 5. Auditoria Cross-Layer

Frontend → shared-core → Backend (RPC) → Banco **não produzem resultado idêntico por definição** — o projeto embute janelas de tolerância (R$0,01 a R$0,02) em cada checkpoint (`274:394-399`, `499-399`(sic, ver 3.1), `248:373`). Ou seja, a garantia real do sistema não é "mesmo resultado exato", é "resultado dentro de X centavos", e isso está no código, não é hipótese.

Divergência concreta e não tolerada (fora da janela projetada):
- `receita_estimada` (relatório 064) vs `vendas.total_liquido` (venda/dashboard) — diferença exatamente igual ao valor do desconto de gerente aplicado, sem limite de tolerância porque são duas fórmulas diferentes, não a mesma fórmula com arredondamento diferente. Ver §2.4.

---

## 6. Auditoria de Apresentação

Encontradas **5 implementações de formatação monetária independentes**, 4 delas em uso real:

| Superfície | Função | Formato |
|---|---|---|
| Rodapé do carrinho PDV | `formatDecimalBRL` (`lib/format/money.ts:48-53`) | `toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})` — **sem símbolo de moeda** |
| Campo de valor de pagamento | `.toFixed(2)` inline (`CaixaPdvOperadorTabs.tsx:122`) | string crua, **sem separador de milhar** |
| Financeiro / Dashboard / Relatórios | `formatBRL` (`lib/format/money.ts:20-25`) | `toLocaleString(locale, {style:'currency', currency:'BRL'})` — **com símbolo** |
| Recibo impresso (ESC/POS) | `brl()` local (`lib/thermal-printer/escpos.ts:93`) | `` `${venda.moeda} ${v.toFixed(2)}` `` — símbolo vem de campo `moeda`, **sem separador de milhar** |
| `shared-core/src/formatting/money.ts:11-17` | `formatMoney` | não consumida por nenhuma das 4 superfícies acima (nenhum import encontrado) |

**Evidência de divergência real:** o mesmo valor (ex.: 1234.5) aparece como `"1.234,50"` no financeiro/dashboard (`formatBRL`), `"1234.50"` no campo de pagamento e no recibo impresso (sem separador de milhar), e sem símbolo `R$` no rodapé do carrinho. É puramente cosmético (não altera nenhum valor persistido), mas é uma divergência real e comprovada, exatamente o que a seção pediu para verificar.

---

## 7. Testes Existentes

**Cálculos com teste automatizado (evidência):**
- Arredondamento (`roundAbnt`/`roundMoney2` vs Postgres) — `pdv-importados/core/money/roundAbnt.test.ts`
- Limite de desconto de gerente (clamp) — `shared-core/src/managerDiscount/policy.test.ts`
- Faixa de atacado / fronteira exata — `shared-core/src/pricing/calcularPrecoCanonico.spec.ts`
- Troco (incluindo ruído de float) — `pdv-importados/app/caixa/caixaPagamentoSaldo.test.ts`
- Validação de totais declarados vs calculados — `pdv-importados/app/caixa/finalizarVendaValidation.test.ts`
- Finalização de venda (integração) — `finalizarVendaCaixa.integration.test.ts`
- Cancelamento (integração) — `cancelarVendaContrato.integration.test.ts`
- Contas a receber (leitura) — `receivableReader.test.ts`
- Fluxo split-payment/contas a receber (E2E) — `e2e/caixa-fase5b-contas-receber.spec.ts`, `caixa-fase6-reconciliacao.spec.ts`

**Cálculos com ZERO teste (comprovado por grep sem resultado):**
- Trigger de limite de desconto por item (`DESCONTO_MANUAL_EXCESSIVO`) — `grep -rl "DESCONTO_MANUAL_EXCESSIVO" --include="*.test.ts" --include="*.spec.ts" .` → nenhum resultado
- `decrementar_estoque_seguro` (RPC central de baixa de estoque, P0/P1) — `grep -rl "decrementar_estoque_seguro" --include="*.test.ts" --include="*.spec.ts" .` → nenhum resultado
- Valores grandes / overflow numérico — `grep -rl "999999\|MAX_SAFE_INTEGER\|numeric(10" --include="*.test.ts" --include="*.spec.ts" .` → nenhum resultado
- Nenhum harness de teste em nível SQL (pgTAP ou equivalente) existe em `backend/` — apenas scripts de RLS (`test-rls-policies.mjs`, `test-rls-scope.mjs`), nada de dinheiro/estoque

---

## 8. Classificação por Criticidade

**P0 — qualquer erro altera dinheiro real:**
- `finalizar_venda_transacional_canonica_v4` (totais, pagamentos, criação de contas a receber) — grava valores definitivos em `vendas`/`vendas_pagamentos`/`contas_receber`.
- `cancelar_venda_transacional` (estorno de caixa) — altera `caixas.saldo_atual`.
- `calcular_valor_sistema_dinheiro_caixa` — base do fechamento de caixa.
- `round_abnt`/`roundAbnt` — qualquer erro de arredondamento aqui se propaga para todo valor monetário gravado.

**P1 — altera estoque ou financeiro (não o dinheiro em caixa diretamente):**
- `decrementar_estoque_seguro`, `devolver_ou_trocar_venda` — saldo de estoque.
- `contas_receber.valor_aberto` — saldo a receber.
- Enforcement de limite de desconto (trigger + `pdv_config`) — controla quanto dinheiro pode ser descontado, mas não grava o valor final por si.

**P2 — altera relatórios:**
- `064_relatorio_resumo_executivo_periodo.sql` (`receita_estimada`) — já comprovadamente diverge de `total_liquido` (§2.4).
- Consultas de dashboard (`078`–`100_dashboard_gerente_resumo*`) — leem `total_liquido` direto, risco baixo por herdarem a mesma fonte.

**P3 — apenas apresentação:**
- `formatDecimalBRL`, `formatBRL`, `.toFixed` inline, `escpos.ts brl()`, `shared-core/formatting/money.ts` — nenhuma altera valor persistido, apenas como é exibido (§6).

---

## 9. Evidências — índice rápido

Todas as afirmações acima citam pelo menos um de: função/RPC (`round_abnt`, `finalizar_venda_transacional_canonica_v4`, `calcular_valor_sistema_dinheiro_caixa`, `decrementar_estoque_seguro`, `devolver_ou_trocar_venda`, `cancelar_venda_transacional`), migration (`001, 055, 059, 077, 122, 127, 248, 274, 20260718184800`), arquivo TS/teste (`roundAbnt.ts`/`.test.ts`, `managerDiscount/policy.ts`/`.test.ts`, `calcularPrecoCanonico.spec.ts`, `caixaPagamentoSaldo.test.ts`, `finalizarVendaValidation.test.ts`) ou grep com resultado nulo comprovando ausência.

---

## 10. Resultado Final

### Confirmado
- Arredondamento server-side (`round_abnt`) e a implementação principal client-side (`roundAbnt`) implementam a mesma regra (half-away-from-zero) e concordam nos casos testados.
- Guardas de soma de pagamento, limite de desconto e suficiência de estoque existem e bloqueiam a transação via `RAISE EXCEPTION` dentro das RPCs canônicas.
- Cálculo de troco é testado contra ruído de ponto flutuante e está correto.
- Fronteira de atacado é inclusiva e testada.
- `vendas.total_liquido` flui sem recomputação para `contas_receber.valor_total` e para a maioria dos relatórios/dashboard.

### Não comprovado
- Que o valor do documento fiscal (dentro de `payload jsonb`, sem coluna própria) corresponde ao total da venda — não verificável com o schema atual.
- Que as 9 implementações independentes de `Math.round(v*100)/100` produzem resultado idêntico entre si e a `roundAbnt`/`round_abnt` em todos os casos de borda — só há semelhança algorítmica, não teste cruzado.
- Que valores gravados no SQLite do `pdv-local` reconciliam exatamente com Postgres após sync — não há arredondamento nem teste de paridade nessa camada.
- O invariante "Subtotal − Desconto + Acréscimo = Total" como formulado — "Acréscimo" não existe no schema.

### Divergências
- `receita_estimada` (relatório 064) diverge de `vendas.total_liquido` quando há desconto de gerente (§2.4) — sem tolerância, sem sinalização.
- `.toFixed(2)` diverge de `roundAbnt`/`Math.round` em 0.015 (0.01 vs 0.02) — usado em campo de pagamento e recibo impresso (§3.2).
- `calcular_valor_sistema_dinheiro_caixa` (E(c)) e `caixas.saldo_atual` podem divergir após cancelamentos — por design, mas são dois números diferentes (§1.3).
- Limite de desconto de gerente: default client-side (20%, hardcoded) vs config real no banco (`pdv_config`) — risco de descompasso (§4).
- 5 formatações monetárias diferentes em uso nas telas — mesmo valor renderiza diferente (§6).

### Riscos P0
- `estoque.quantidade_atual` sem `CHECK >= 0` no banco — única proteção é procedural dentro da RPC; caminho legado (`garantirLinhaEstoque`, D-I3) já contorna esse caminho.
- Nenhum `CHECK`/trigger de banco garante `soma(pagamentos) ≤ total` ou a consistência de `total_bruto/desconto/liquido` — tudo é procedural dentro de uma única RPC; um INSERT/UPDATE direto (bug futuro, hotfix manual, outra RPC) não seria barrado pelo schema.
- Valor do documento fiscal não é validado contra o total da venda por nenhum mecanismo automatizado.

### Conclusão

**PARCIALMENTE.**

Há evidência objetiva de que os mecanismos centrais — a RPC canônica de venda, o arredondamento server-side, a validação de estoque e a fronteira de atacado — preservam consistência dentro de janelas de tolerância definidas e parcialmente testadas. Mas há lacunas e divergências comprovadas por código (relatório 064, `.toFixed` vs `roundAbnt`, ausência de `CHECK` constraints para os invariantes centrais, valor fiscal não verificável, 9 implementações de arredondamento nunca testadas entre si) que impedem afirmar **SIM** de forma irrestrita. Nenhum dos achados chega a invalidar o sistema como um todo — são riscos localizados e documentados, não sistêmicos — o que também afasta um **NÃO** categórico.
