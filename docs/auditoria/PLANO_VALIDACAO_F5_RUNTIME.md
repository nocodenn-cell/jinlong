# Plano de Validação em Runtime — Frente 5 (Trilha Operacional)

> Objetivo: confirmar, por teste controlado, quais eventos realmente gravam trilha e
> quais campos faltam. Substitui a suposição de "defeito" por evidência reproduzível.
> Cada cenário deve ser executado em ambiente de staging com dados reais (pós limpeza F3).

**Regra de ouro:** só vira ticket de CORREÇÃO após o teste controlado provar que o
evento executou e não gerou trilha (🔴 FALHA CONFIRMADA). Até lá, são tickets de VALIDAÇÃO.

> **Nota de consolidação (2026-08-05) — nome da tabela de trilha de cadastro.**
> Duas auditorias propuseram nomes diferentes para a **mesma** capacidade ausente:
> `produtos_auditoria` (aqui) e `auditoria_cadastros`
> (`docs/AUDITORIA_FUNCIONAL_COMPLETA_GO_LIVE.md` §B1). **Criar as duas seria criar duas
> fontes de verdade para a mesma trilha.**
>
> **Nome canônico adotado: `auditoria_cadastros`**, genérico, com coluna `entidade`.
> Justificativa: os 16 módulos de Server Action que hoje não deixam rastro compartilham o
> helper `app/gerente/shared/actionHelpers.ts` — uma tabela genérica cobre todos de uma vez;
> uma tabela por entidade exigiria 16 migrations. Onde este plano diz `produtos_auditoria`,
> leia `auditoria_cadastros` com `entidade = 'produto'`.
>
> Executado no **Pacote 6** (F6-AUD-001), **após** os cenários de validação abaixo.

---

## Cenários por evento

### CADASTRO

**C1 — produto criado (via UI)**
- Operação: acessar `/admin/catalogo` → criar produto com todos os campos → salvar.
- Tabela esperada: nova tabela `produtos_auditoria` (a criar) OU log genérico.
- Campos esperados: `produto_id`, `usuario_id`, `acao=CRIADO`, `criado_em`, `loja_id`, `payload_antes=null`, `payload_depois`.
- Critério de aprovação: 1 registro aparece com `acao=CRIADO` e `usuario_id` correto.

**C2 — produto alterado (via UI)**
- Operação: editar um produto real → alterar nome/preço/estoque → salvar.
- Tabela esperada: `produtos_auditoria`.
- Campos esperados: `acao=ALTERADO`, `payload_antes`, `payload_depois`, `campos_alterados[]`.
- Critério de aprovação: registro com `antes≠depois` e `campos_alterados` preenchido.

**C3 — produto excluído**
- Operação: excluir (ou inativar) um produto de teste.
- Tabela esperada: `produtos_auditoria` (`acao=EXCLUIDO`) ou soft-delete logado.
- Campos esperados: `acao=EXCLUIDO`, `payload_antes`, `motivo`.
- Critério de aprovação: registro de exclusão presente (soft-delete preserva dado).

**C4 — alteração de preço**
- Operação: alterar `preco_varejo`/`preco_atacado`/`preco_custo` de um produto real.
- Tabela esperada: `historico_precos_produto` (já existe).
- Campos esperados: `produto_id`, `usuario_id`, `preco_antigo`, `preco_novo`, `motivo`, `criado_em`.
- Critério de aprovação: registro gravado com `preco_antigo≠preco_novo`. (Hoje tabela vazia — teste dirá se é falta de instrumentação ou só falta de uso.)

---

### ESTOQUE

**C5 — entrada / saída / ajuste**
- Operação: receber mercadoria, vender (saída), ajustar estoque manual.
- Tabela esperada: `movimentos_estoque_log` (já existe, 51 regs).
- Campos esperados: `produto_id`, `tipo_codigo`, `quantidade_delta`, `usuario_id`, `loja_id`, `observacao`, `saldo_anterior` ⚠️ (HOJE AUSENTE), `saldo_resultante` ⚠️ (HOJE AUSENTE).
- Critério de aprovação (PARCIAL→VALIDADO): além dos atuais, gravar `saldo_anterior` e `saldo_resultante` para permitir reconstrução direta.

**C6 — inventário (contagem física)**
- Operação: executar contagem de inventário em uma loja.
- Tabela esperada: nova `inventarios` + `inventario_itens` (criar) OU `movimentos_estoque_log` com `tipo_codigo=INVENTARIO`.
- Campos esperados: `loja_id`, `usuario_id`, `produto_id`, `contado`, `divergencia`, `criado_em`.
- Critério de aprovação: registro de inventário gerado.

---

### FINANCEIRO

**C7 — lançamento criado**
- Operação: criar conta a pagar/receber em `/admin/financeiro`.
- Tabela esperada: nova `lancamentos_financeiros_auditoria` (criar) ou log genérico.
- Campos esperados: `lancamento_id`, `usuario_id`, `acao=CRIADO`, `valor`, `vencimento`, `tipo`, `criado_em`.
- Critério de aprovação: registro de criação de lançamento.

**C8 — pagamento realizado**
- Operação: registrar pagamento de uma conta.
- Tabela esperada: `lancamentos_financeiros_auditoria` (`acao=PAGO`).
- Campos esperados: `valor_pago`, `forma_pagamento`, `usuario_id`, `data_pagamento`.
- Critério de aprovação: registro de pagamento com valor.

**C9 — alteração financeira**
- Operação: editar um lançamento (valor/vencimento).
- Tabela esperada: `lancamentos_financeiros_auditoria` (`acao=ALTERADO`).
- Campos esperados: `valor_antes`, `valor_depois`, `motivo`.
- Critério de aprovação: registro com antes≠depois.

---

### CAIXA

**C10 — abertura / fechamento**
- Operação: abrir e fechar caixa em loja real.
- Tabela esperada: `caixas` (já existe) + nova `caixas_auditoria` para autorização.
- Campos esperados: `caixa_id`, `usuario_id`, `acao=ABERTURA/FECHAMENTO`, `valor`, `criado_em`.
- Critério de aprovação (PARCIAL→VALIDADO): registro dedicado de auditoria além do `caixas`.

**C11 — divergência**
- Operação: fechar caixa com valor divergente do esperado.
- Tabela esperada: `caixas` (`fechamento_diferenca`) + `caixas_auditoria` (`acao=DIVERGENCIA`).
- Campos esperados: `diferenca`, `justificativa`, `usuario_id_autorizador`, `criado_em`.
- Critério de aprovação: divergência registrada com justificativa e autorizador.

**C12 — autorização (sangria/suprimento)**
- Operação: realizar sangria e suprimento no caixa.
- Tabela esperada: `movimentos_caixa` (já existe, vazia).
- Campos esperados: `caixa_id`, `tipo`, `valor`, `usuario_id`, `autorizado_por`, `criado_em`, `motivo`.
- Critério de aprovação: registro de sangria/suprimento com autorizador. (Hoje vazia — teste confirmará instrumentação.)

---

### VENDA

**C13 — criação**
- Operação: finalizar venda no PDV.
- Tabela esperada: `venda_eventos` (já existe, 61 regs).
- Campos esperados: `sale_id`, `operador_id`, `loja_id`, `total`, `criado_em` ✅ + `valor_anterior` ⚠️ (ausente) + `motivo` ⚠️ (ausente).
- Critério de aprovação (PARCIAL→VALIDADO): incluir contexto de motivo quando aplicável.

**C14 — desconto**
- Operação: aplicar desconto em venda.
- Tabela esperada: `descontos_venda` (já existe, 2 regs).
- Campos esperados: `venda_id`, `gerente_id`, `operador_id`, `desconto_valor`, `motivo_desconto` ✅ + `loja_id` ⚠️ (ausente).
- Critério de aprovação (PARCIAL→VALIDADO): incluir `loja_id`.

**C15 — cancelamento**
- Operação: cancelar venda.
- Tabela esperada: `vendas_canceladas_auditoria` (já existe, 5 regs).
- Campos esperados: `venda_id`, `operador_id`, `caixa_id`, `motivo`, `valor_estornado` ✅ + `valor_anterior` ⚠️ (ausente).
- Critério de aprovação (PARCIAL→VALIDADO): incluir valor anterior à venda.

**C16 — devolução**
- Operação: devolver item/valor de uma venda.
- Tabela esperada: nova `vendas_devolucoes` (criar) ou `venda_pos_venda_operacoes` (existe, vazia).
- Campos esperados: `venda_id`, `produto_id`, `quantidade`, `valor`, `motivo`, `usuario_id`, `criado_em`.
- Critério de aprovação: registro de devolução gerado.

---

## Matriz de critério de aprovação (resumo)

| Evento | Estado hoje | Cenário | Vira FALHA se |
|---|:--:|---|---|
| produto criado | ⚪ | C1 | executar C1 e não gravar trilha |
| produto alterado | ⚪ | C2 | executar C2 e não gravar trilha |
| produto excluído | ⚪ | C3 | executar C3 e não gravar trilha |
| alteração preço | ⚪ | C4 | executar C4 e `historico_precos_produto` continuar vazio |
| entrada/saída/ajuste | 🟡 | C5 | gravar mas sem `saldo_anterior`/`saldo_resultante` |
| inventário | ⚪ | C6 | executar C6 e não gravar |
| lançamento/pagamento/alt. | ⚪ | C7-9 | executar e não gravar trilha fin. |
| abertura/fechamento | 🟡 | C10 | gravar mas sem auditoria dedicada |
| divergência | 🟡 | C11 | gravar mas sem justificativa/autorizador |
| autorização | ⚪ | C12 | executar C12 e `movimentos_caixa` continuar vazio |
| criação/desconto/cancel. | 🟡 | C13-15 | gravar mas sem campos ausentes |
| devolução | ⚪ | C16 | executar C16 e não gravar |

**Saída esperada do plano:** relatório de validação marcando cada evento como
VALIDADO / PARCIAL / FALHA CONFIRMADA / NÃO VALIDADO, com print dos registros gerados.
