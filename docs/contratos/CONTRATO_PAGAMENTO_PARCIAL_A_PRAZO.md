# Contrato — Pagamento integral, parcial e a prazo

Status: **contrato definitivo proposto; implementação só após aprovação.**
Decisão de produto (2026-09-30): a capacidade **permanece**; pagamento parcial (BA-001) e **venda 100% a prazo** são válidos.
A configuração `loja.permitir_venda_a_prazo` está aprovada como evolução **posterior** e **não** faz parte desta entrega.

## 1. Domínio
Toda venda concluída está em exatamente uma situação, **derivada** (não armazenada como segunda verdade):

| Situação | Definição (`total` = `vendas.total_liquido`) |
|---|---|
| `QUITADA` | Σ `vendas_pagamentos` = total |
| `PARCIAL` | 0 < Σ `vendas_pagamentos` < total, com saldo em `contas_receber` |
| `A_PRAZO` | Σ `vendas_pagamentos` = 0, com o total em `contas_receber` |

Exemplo (venda R$100): pago 100 → QUITADA; pago 60 + 40 a receber → PARCIAL; pago 0 + 100 a receber → A_PRAZO.
**Invariante I-1:** `total = Σ vendas_pagamentos + saldo_a_receber` (saldo = `contas_receber.valor_aberto` no momento da
venda; o título mantém `valor_total` e `valor_aberto` por liquidação).
**Invariante I-2:** valor não recebido **nunca** entra no caixa (só parcelas pagas em DINHEIRO entram — já é assim).
**Invariante I-3:** `contas_receber` de venda tem `cliente_id`, `venda_id`, `vencimento` e `descricao` não nulos.
Fonte de verdade da situação: `vendas_pagamentos` + `contas_receber` (view `vendas_situacao_pagamento`, ver §4).

## 2. Estado atual (provado em produção, corpo de `finalizar_venda_transacional_canonica_v4_unscoped`)
| Requisito | Hoje |
|---|---|
| Parcial permitido | **Sim** (`caixaPagamentoSaldo.ts`; RPC exige cliente se saldo > 0,009). |
| Valor pago entra no caixa | Sim, só DINHEIRO (trigger em `vendas_pagamentos`). |
| Saldo gera `contas_receber` | Sim — `cliente_id, venda_id, loja_id, valor_total, valor_aberto, status` (upsert idempotente por `venda_id`). |
| Cliente identificado | Sim (`SALDO_PENDENTE_EXIGE_CLIENTE`, `CLIENTE_LOJA_INVALIDO`). |
| Limite de crédito | Sim: `clientes.limite_credito` × abertos; modo em `pdv_config.modo_limite_credito` (padrão **AVISO** — aviso invisível na UI). `BLOQUEIO` e `AUTORIZACAO_GERENTE` (token) existem. |
| **Vencimento** | **Não** (`NULL`; título de venda nunca vence — `tituloVencido.ts:23`). |
| **Descrição/origem** | **Não** (`descricao NULL`; não existe coluna `origem` em `contas_receber`). |
| **Indicação na venda** | **Não** (retorno da RPC só traz `contas_receber_id`; `vendas.forma_pagamento` = 1ª parcela → "Dinheiro R$71,90"). |
| Relatórios distinguem parcial/integral | **Não** (dashboard, relatórios e exportação usam `vendas.forma_pagamento`). |
| Recibo/2ª via | **Não** mostram saldo, vencimento nem cliente. |
| **100% a prazo** | **Bloqueado**: `PAGAMENTO_ZERO` (soma ≤ 0,009), e `vendas.forma_pagamento` é `NOT NULL` com CHECK só de 4 formas. |
| Auditoria | Sem evento próprio da concessão de crédito. |
| Texto "fiado desabilitado" | Presente em `pt.json:647,2578`, manual do operador, checklist de go-live — **incorreto**. |

## 3. Regras do contrato
**R-1 Autorização de crédito** (sempre que `saldo > 0`, inclusive A_PRAZO): cliente da loja; limite de crédito conforme
`modo_limite_credito`; token de gerente quando o modo for `AUTORIZACAO_GERENTE`; aviso de excesso **visível** ao operador
no modo `AVISO`.
**R-2 Vencimento obrigatório.** `vencimento = data da venda + prazo`. O PDV envia o vencimento escolhido; sem envio, o
servidor aplica prazo padrão. *Decisão D-1.* Nunca nulo; não anterior à data da venda.
**R-3 Descrição/origem.** `contas_receber.descricao = 'Venda <número/curto> — <PARCIAL|A_PRAZO>'` e
`contas_receber.origem` (`VENDA_PDV` | `MANUAL`), coluna nova `NOT NULL DEFAULT 'MANUAL'` — a mesma semântica que já existe em
`liquidacoes_receber.origem`.
**R-4 Venda 100% a prazo.** `p_pagamentos` vazio é aceito **se e somente se** `saldo = total > 0`, com R-1 satisfeita.
`PAGAMENTO_ZERO` continua valendo para venda **sem** título (total > 0, nada pago, nada a receber). Nada entra no caixa;
nenhum registro em `vendas_pagamentos`; o trigger de crédito de caixa não dispara.
**R-5 `vendas.forma_pagamento` é rótulo resumido, não verdade.** Para A_PRAZO grava-se `'A_PRAZO'` (CHECK ampliado; o
CHECK `nao_fiado` e `formas_pagamento_codigo_check1` continuam proibindo `FIADO/CREDIARIO/CREDITO_LOJA/FIADO_LOJA` como forma
de **pagamento**, coerentes: crédito não é meio de pagamento, é saldo a receber). Relatórios deixam de agrupar por essa coluna.
**R-6 Cancelamento e devolução.** Cancelar a venda cancela o título (já é regra: `DECISOES_PRODUTO_UX03.md:269`); a parte
paga em dinheiro devolve do caixa **aberto que paga** (ver `CONTRATO_CAIXA_C3.md` C-2/C-7); devolução parcial reduz primeiro
o saldo em aberto do título e só depois o valor pago; se o título já tem liquidações, o excedente é estornado na forma
recebida.
**R-7 Liquidação posterior.** Inalterada (`registrar_liquidacao_receber`): DINHEIRO entra no caixa que recebe; outras formas não.
**R-8 Auditoria.** Concessão de crédito (cliente, valor, limite antes/depois, quem autorizou) registrada no log de auditoria
central (classe C8) e em `venda_eventos`.
**R-9 Fiscal.** Venda A_PRAZO/PARCIAL exige o meio de pagamento fiscal correspondente (NFC-e "crédito loja"): **fora do escopo**
desta entrega; a fila fiscal hoje está em `NFC_E_STUB` (35 documentos em erro). Registrar como risco.

## 4. Onde o contrato muda o sistema (plano de implementação, após aprovação)
| Camada | Mudança | Reaproveita |
|---|---|---|
| Banco | `contas_receber.origem`; CHECK de `vendas.forma_pagamento` + `'A_PRAZO'`; RPC v4 (`_unscoped`): aceitar `p_pagamentos` vazio com saldo, preencher `vencimento/descricao/origem`, retornar `saldo_a_receber`/`situacao`; **view** `vendas_situacao_pagamento` (única leitura da situação) | RPC v4 existente (mesmo nome — sem RPC nova) |
| Servidor | `caixaVendas.impl.ts`: repassar vencimento; devolver saldo/vencimento ao front | `SALDO_PENDENTE_EPS`, `caixaPagamentoSaldo.ts` |
| PDV | Permitir finalizar com 0 pago quando há cliente; escolher vencimento; **exibir aviso de limite**; mensagem do saldo | `CaixaSelecionarClienteModal`, `pagamentoParcialExigeCliente` |
| Leitura | Dashboard, `/admin/vendas`, relatórios, exportação, recibo/2ª via consomem `vendas_situacao_pagamento` e `vendas_pagamentos` (classe C4) | leitura única de vendas líquidas |
| Textos | Corrigir `pt.json:647,2578`, `MANUAL_OPERADOR_RESUMIDO.md`, `docs/CHECKLIST_EXECUCAO_GO_LIVE.md`; comentário de `formas_pagamento` | — |
| Testes | SQL: I-1/I-2/I-3, R-4 (100% a prazo com/sem cliente/limite), cancelamento e devolução; unit: `caixaPagamentoSaldo`; e2e: `caixa-venda-multi-pagamento`, `caixa-fase5b-golden-flow-ui` | testes existentes de BA-001 |

## 5. Etapa posterior (aprovada, NÃO implementar agora): `loja.permitir_venda_a_prazo`
Desabilitado: integral permitido; **parcial bloqueado; 100% a prazo bloqueado**. Habilitado: os três permitidos. Deve ser uma
única checagem no ponto que cria o título (RPC v4), refletida no PDV apenas como UX. Só entra depois de estabilizado o domínio acima.

## 6. Decisões pendentes
- **D-1.** Prazo padrão de vencimento (proposta: 30 dias, configurável por loja em `pdv_config`) e se o operador pode editá-lo.
- **D-2.** `modo_limite_credito` padrão: manter `AVISO` (com aviso visível) ou subir para `AUTORIZACAO_GERENTE` quando A_PRAZO?
- **D-3.** Meio de pagamento fiscal para PARCIAL/A_PRAZO (R-9) e prazo para tratar os documentos em `NFC_E_STUB`.
- **D-4.** Existe teto de A_PRAZO sem cliente com cadastro completo (CPF validado — classe C7)?
