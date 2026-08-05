# TB-07 — Financeiro (complemento da rodada 3)

## TB-07

**Título:** `registrar_pagamento_contas_pagar` aceita pagamento acima do saldo devedor; a contraparte de contas a receber bloqueia

**Categoria:** Bug

**Veredito:** CONFIRMADO

**Quadro comparativo:**

| RPC | Valida excesso? | Exceção |
|---|---|---|
| `registrar_liquidacao_receber` | ✅ sim | `LIQUIDACAO_EXCEDE_ABERTO` |
| **`registrar_pagamento_contas_pagar`** | ❌ **não** | — |

**Descrição:**
As duas RPCs financeiras são simétricas em quase tudo — ambas validam auth, perfil, loja, valor positivo e forma de pagamento. Mas `registrar_liquidacao_receber` tem a guarda `IF p_valor > v_aberto THEN RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO'`, e `registrar_pagamento_contas_pagar` **não tem equivalente**: ela insere o pagamento, soma `v_novo_pago := v_conta.valor_pago + p_valor` e grava.

Também não há CHECK no banco: `contas_pagar` tem `valor_total > 0` e `valor_pago >= 0`, mas **nada** impede `valor_pago > valor_total`.

**Impacto operacional:** Um erro de digitação (R$ 5.000,00 em vez de R$ 500,00) é aceito silenciosamente. A conta é marcada `PAGO` (pois `v_novo_pago >= valor_total`), e o excedente vira prejuízo invisível: `valor_pago` fica maior que `valor_total`, mas nenhum relatório acusa, porque o status está correto. Como não há RPC de estorno de pagamento auditada, a correção exige intervenção direta no banco.

Diferença de severidade em relação ao contas a receber: ali o excesso seria dinheiro *entrando* a mais (detectável na conferência de caixa). Aqui é dinheiro *saindo* a mais, para o fornecedor.

**Evidências:**
- **Sem guarda:** `remote_schema.sql:5048-5108`, função `registrar_pagamento_contas_pagar` — validações presentes: `PAGAMENTO_AUTH`, `PAGAMENTO_PERFIL`, `PAGAMENTO_CONTA_NAO_ENCONTRADA`, `PAGAMENTO_LOJA`, `PAGAMENTO_CONTA_ENCERRADA`, `PAGAMENTO_VALOR_INVALIDO`, `PAGAMENTO_FORMA_INVALIDA`. **Nenhuma** de excesso.
- **Com guarda (contraparte):** `remote_schema.sql:4715+`, `IF p_valor > v_aberto THEN RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO'`
- **Sem CHECK:** `CREATE TABLE public.contas_pagar` → `contas_pagar_valor_total_check (valor_total > 0)`, `contas_pagar_valor_pago_check (valor_pago >= 0)`; ausente `valor_pago <= valor_total`
- **Tabelas:** `public.contas_pagar`, `public.contas_pagar_pagamentos`

**Fluxo afetado:** Compra → Financeiro (contas a pagar)

**Comportamento atual:** Pagamento acima do saldo é aceito e a conta é marcada `PAGO`.

**Comportamento esperado:** Simetria com o contas a receber — `RAISE EXCEPTION 'PAGAMENTO_EXCEDE_SALDO'` quando `p_valor > (valor_total - valor_pago)`, mais CHECK `valor_pago <= valor_total` como rede de segurança.

**Causa provável:** As duas RPCs vieram de migrations diferentes (`108_contas_pagar_schema_e_rpc_pagamento.sql` e `112`); a guarda foi adicionada em uma e não retroalimentada na outra.

**Prioridade:** **P1**

**Arquivos:** nova migration sobre `registrar_pagamento_contas_pagar` + CHECK em `contas_pagar`

**Dependências:** verificar se há linhas com `valor_pago > valor_total` antes de aplicar o CHECK (usar `NOT VALID` + `VALIDATE`)

**Critério de aceite:** Pagamento de valor superior ao saldo devedor é rejeitado; CHECK impede o estado inconsistente.
