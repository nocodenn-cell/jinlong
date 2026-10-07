# Contrato — Fechamento de caixa por forma de pagamento (PR A)

| Campo | Valor |
|--------|--------|
| **Status** | Contrato operacional — **PR A (read model)** |
| **Data** | 2026-10-07 |
| **Domínio dono** | `cash` |
| **Base** | Tip pós-SSoT (`#476` / stack `#473→#476`); docs de decisão `#477` |
| **UI** | **Fora deste PR** — gate `READY FOR CLOSURE UI` |
| **Complementa** | [SSOT_CAIXA_SALDO_CONTRATO.md](./SSOT_CAIXA_SALDO_CONTRATO.md) · [ONDA3](../ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md) |

---

## 0. Pré-condição de base

A stack `#473→#474→#475→#476` **não** está mergeada em `main` na data deste contrato. A base inequívoca para implementação é o tip linear pós-SSoT (`cursor/remediacao-ssot-bloqueadores-001-004-7da4` / tip `1292520e`, com docs `#477` acima). **Não** duplicar commits da stack; **não** aplicar migrations no remoto Jinlong nesta sprint.

---

## 1. Três conceitos (não misturar)

| Símbolo | Nome | Significado | Autoridade |
|---------|------|-------------|------------|
| **A** | Dinheiro físico / gaveta | Quanto deve haver em espécie no caixa | \(E(c)\) = `internal.valor_sistema_dinheiro` |
| **B** | Valor **registrado** por forma no Jinlong | Soma dos fatos comerciais daquela forma no turno/caixa | Read model `calcular_valor_sistema_por_forma_caixa` (métrica `REGISTRADO_JINLONG`) |
| **C** | Valor **informado** pelo operador | Declaração humana no fechamento | Persistência só no **PR B** (snapshot auditável) |

`caixas.saldo_atual` continua **cache** de \(E(c)\) — nunca autoridade, nunca “PIX no caixa”.

### O que “conferir PIX/débito/crédito” significa hoje

**Não** é conciliação bancária nem liquidação de adquirente.

É **conferência de fechamento por forma**: o operador compara o que o Jinlong **registrou** (B) com o que ele **viu** no extrato/maquininha/recibo (C), se a loja optar por informar.

O Jinlong **não** consulta banco nem adquirente. A UI (PR B) **não** pode usar linguagem que sugira “PIX recebido no banco = PIX Jinlong” como fato verificado pelo sistema.

---

## 2. Matriz por forma (PR A)

| Forma | Valor sistema (B ou A) | Valor operador (C) | Diferença | Fonte canônica |
|-------|------------------------|--------------------|-----------|----------------|
| **DINHEIRO** | \(E(c)\) — métrica `E_C_AUTORIDADE` | Contagem de gaveta (PR B; já existe hoje como `valor_fechamento`) | informado − \(E(c)\) | `internal.valor_sistema_dinheiro` (**reuso obrigatório**) |
| **PIX** | Registrado Jinlong | Opcional: “conferido (extrato/máquina)” — **não** saldo bancário | só se informado | `vendas_pagamentos` / legado + `devolucoes` PIX no caixa |
| **CARTAO_DEBITO** | Registrado Jinlong | Opcional: conferido maquininha | só se informado | idem |
| **CARTAO_CREDITO** | Registrado Jinlong | Opcional: conferido maquininha | só se informado | idem |

**FIADO como forma de pagamento está desabilitado** (`FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO`; CHECKs em `vendas` / `vendas_pagamentos`). Pagamento parcial a prazo gera **`contas_receber`** (saldo em aberto), não uma linha “FIADO” no fechamento. O valor a prazo **não** aparece como forma até ser liquidado; liquidação em DINHEIRO entra em \(E(c)\); liquidação PIX/cartão **não** amarra `caixa_id` hoje.

Formas do read model: exatamente `DINHEIRO|PIX|CARTAO_DEBITO|CARTAO_CREDITO`.

---

## 3. RPC canônica (PR A)

```text
public.calcular_valor_sistema_por_forma_caixa(p_caixa_id uuid)
  RETURNS TABLE (
    forma_pagamento text,
    valor_sistema numeric(10,2),
    metrica text  -- 'E_C_AUTORIDADE' | 'REGISTRADO_JINLONG'
  )
```

- Autorização: **igual** a `calcular_valor_sistema_dinheiro_caixa` (mesma loja; operador do caixa ou GERENTE/DONO/ADMIN).
- **Somente leitura** — sem persistir saldo derivado.
- Linha **DINHEIRO**: `valor_sistema = internal.valor_sistema_dinheiro(p_caixa_id)` — **proibido** segunda fórmula.
- Demais formas: `internal.valor_sistema_registrado_forma(p_caixa_id, forma)`.

### Fórmula `REGISTRADO_JINLONG` (PIX / cartões / FIADO)

Para forma \(F \in \{\mathrm{PIX}, \mathrm{CARTAO\_DEBITO}, \mathrm{CARTAO\_CREDITO}\}\):

\[
R(c,F) = V_{\mathrm{split}}(c,F) + V_{\mathrm{legado}}(c,F) - D(c,F)
\]

| Termo | Fonte | Filtros |
|-------|--------|---------|
| \(V_{\mathrm{split}}\) | `vendas_pagamentos` ⋈ `vendas` | `vendas.caixa_id = c`, `status = CONCLUIDA`, `forma = F` |
| \(V_{\mathrm{legado}}\) | `vendas` | mesma caixa/status, `forma_pagamento = F`, **sem** linhas em `vendas_pagamentos` |
| \(D\) | `devolucoes` ⋈ `vendas` | `forma = F`, caixa = `COALESCE(caixa_desembolso_id, venda.caixa_id)`, e `(caixa_desembolso_id IS NOT NULL OR venda.status = CONCLUIDA)` |

**Excluído de \(R\) (de propósito):**

| Excluído | Por quê |
|----------|---------|
| Abertura / suprimento / sangria | Movimentação de **caixa físico** — só em \(E(c)\) |
| `liquidacoes_receber` não-DINHEIRO | Contrato atual: `LIQUIDACAO_CAIXA_APENAS_DINHEIRO` — PIX/cartão na liquidação **não** amarram `caixa_id` |
| Vendas `CANCELADA` | Saem de `CONCLUIDA`; não somam em \(V\) |
| Devoluções de cancel sem `caixa_desembolso_id` | Mesmo filtro de \(E(c)\): evita dupla com a saída da venda |

**Recebimento AR posterior em dinheiro:** entra só em \(E(c)\) (linha DINHEIRO), via `liquidacoes_receber` — não cria linha PIX fantasma.

---

## 4. Mapa de eventos → efeito

| Evento | DINHEIRO \(E(c)\) | PIX/Débito/Crédito \(R\) |
|--------|------------------|--------------------------|
| Venda forma única | + se DINHEIRO | + se essa forma |
| Split | + parcela DINHEIRO | + parcela da forma |
| Parcial + CR | + só parcelas DINHEIRO recebidas; título CR em `contas_receber` | + só parcelas dessa forma recebidas |
| Recebimento AR DINHEIRO | + no caixa da liquidação | 0 |
| Recebimento AR PIX/cartão | 0 (não toca gaveta; sem `caixa_id`) | **0 no caixa** (contrato atual) |
| Cancelamento | remove venda de CONCLUIDA | idem |
| Devolução parcial | − se DINHEIRO no desembolsador | − se forma correspondente |
| Estorno AR DINHEIRO | − | 0 |
| Suprimento / sangria | ± | **nunca** |

---

## 5. Persistência (PR B — não neste PR)

Não criar tabela neste PR A. Quando o PR B persistir declaração do operador:

- Owner: `cash`
- Snapshot auditável do fechamento (**não** nova autoridade transacional)
- Campos mínimos: `caixa_id`, `forma`, `valor_sistema_snapshot`, `valor_informado`, `diferenca`, `usuario_id`, `timestamp`, justificativa opcional

---

## 6. Permissões (inalteradas)

Quem já pode ler \(E(c)\) do caixa pode chamar a RPC por forma. Fechar / justificar / reabrir: regras atuais de `fechar_caixa_*` — **sem** ampliar neste PR.

---

## 7. Número explicável

Para cada `valor_sistema` retornado, a reconstrução usa apenas as fontes da §3; exclusões da §3; DINHEIRO sempre reconciliável com `calcular_valor_sistema_dinheiro_caixa` (igualdade obrigatória).

Cenário composto e respostas: ver testes + artefato `fechamento-por-forma-numero-explicavel` nos testes Vitest/SQL.

---

## 8. Fora de escopo (explícito)

Open Finance, consulta bancária, TEF, adquirente, MDR, antecipação, conciliação bancária, Importações, Contábil, Intelligence, Mobile, Central de Compras, UI de fechamento (PR B).
