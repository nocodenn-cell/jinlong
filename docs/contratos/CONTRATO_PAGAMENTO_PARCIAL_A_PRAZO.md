# Contrato — Pagamento integral, parcial e 100% a prazo

Status: **contrato v2 — decisões do produto registradas; implementação NÃO aprovada.**
A capacidade de fiado/pagamento parcial (BA-001) **permanece**; a venda **100% a prazo** passa a ser válida.
`loja.permitir_venda_a_prazo` e `prazo_venda_a_prazo_dias` (configuração por loja) são evolução **posterior** — não entram agora,
mas a arquitetura abaixo não pode impedi-las (§6).
O mapeamento **fiscal está fora deste contrato** (§8).

## 0. Decisões do produto (registradas)
1. Manter fiado e pagamento parcial; permitir também venda 100% a prazo, desde que: cliente identificado; limite de crédito validado;
   autorização de gerente quando aplicável; vencimento definido; descrição/origem registrada; auditoria registrada; **nenhum valor não
   recebido lançado no caixa**.
2. Prazo: **não hardcodar 30 dias na regra**. 30 é o **DEFAULT da configuração da loja**; o contrato permite configuração futura por loja.
3. **NÃO** adicionar `A_PRAZO` a `vendas.forma_pagamento`. `forma_pagamento` = **meio(s) de pagamento**.
4. `QUITADA`/`PARCIAL`/`A_PRAZO` = **situação comercial/financeira**, **derivada** de `vendas_pagamentos` e `contas_receber`.
   Isto também elimina a venda dividida exibida como "DINHEIRO" (só a 1ª parcela está em `vendas.forma_pagamento`).
5. Separar contrato comercial/financeiro do mapeamento fiscal; os 35 documentos fiscais em erro seguem como risco separado.

## 1. Domínio
Situação **no momento da venda** (`total` = `vendas.total_liquido`; `pago` = Σ `vendas_pagamentos`):

| Situação | Definição |
|---|---|
| `QUITADA` | `pago = total` |
| `PARCIAL` | `0 < pago < total` (saldo em `contas_receber`) |
| `A_PRAZO` | `pago = 0` e `total > 0` (total em `contas_receber`) |

Exemplo (R$100): pago 100 → QUITADA; pago 60 + 40 a receber → PARCIAL; pago 0 + 100 a receber → A_PRAZO.
- **I-1** `total = pago + saldo_a_prazo`, com `saldo_a_prazo = total − pago` = valor original financiado no título gerado pela venda.
- **I-2** Valor não recebido **nunca** entra no caixa (só parcelas pagas em DINHEIRO — já é assim, trigger em `vendas_pagamentos`).
- **I-3** Título de venda tem `cliente_id`, `venda_id`, `vencimento`, `descricao`, `origem` não nulos.
- **I-4** A situação **não muda** quando o título é liquidado depois; o que muda é o **saldo em aberto** (`contas_receber.valor_aberto`).
  São duas informações distintas: `situacao` (comercial, na venda) e `saldo_em_aberto` (financeiro, hoje).
- **I-5** `vendas.forma_pagamento` deixa de ser lida como verdade (legado/compat). Meios = `vendas_pagamentos`.

## 2. Estado atual (provado em produção; corpo de `finalizar_venda_transacional_canonica_v4_unscoped`)
| Requisito | Hoje |
|---|---|
| Parcial permitido | **Sim** (`caixaPagamentoSaldo.ts`; RPC exige cliente se saldo > 0,009). |
| Valor pago entra no caixa | Sim, só DINHEIRO. |
| Saldo gera `contas_receber` | Sim: `cliente_id, venda_id, loja_id, valor_total, valor_aberto, status` (upsert idempotente por `venda_id`). |
| Cliente identificado | Sim (`SALDO_PENDENTE_EXIGE_CLIENTE`, `CLIENTE_LOJA_INVALIDO`). |
| Limite de crédito | Sim: `clientes.limite_credito` × abertos; `pdv_config.modo_limite_credito` (padrão **AVISO** — aviso invisível na UI); `BLOQUEIO` e `AUTORIZACAO_GERENTE` (token) existem. |
| Valor do título | `valor_total` recebe o **total da venda** e `valor_aberto` o saldo — o valor original financiado não é gravado em campo próprio (ver D-6). |
| **Vencimento** | **Não** (`NULL`; título de venda nunca vence — `tituloVencido.ts:23`). |
| **Descrição/origem** | **Não** (`descricao NULL`; não há `origem` em `contas_receber`). |
| **Situação na venda** | **Não** (retorno da RPC só traz `contas_receber_id`). |
| Relatórios distinguem parcial/integral/meios | **Não** (dashboard, relatórios e exportação usam `vendas.forma_pagamento`). |
| Recibo/2ª via | **Não** mostra saldo, vencimento nem cliente. |
| **100% a prazo** | **Bloqueado**: `PAGAMENTO_ZERO` (soma ≤ 0,009) **e** `vendas.forma_pagamento NOT NULL` (CHECK: 4 meios). |
| Auditoria | Sem evento próprio da concessão de crédito. |
| Texto "fiado desabilitado" | `pt.json:647,2578`, manual do operador, checklist de go-live — **incorreto**. |

## 3. Regras
**R-1 Autorização de crédito** (sempre que `saldo_a_prazo > 0`, inclusive A_PRAZO): cliente da loja; limite conforme `modo_limite_credito`;
token de gerente quando `AUTORIZACAO_GERENTE`; excesso no modo `AVISO` deve ser **mostrado ao operador**.
**R-2 Vencimento obrigatório.** `vencimento = data da venda + prazo`, sendo `prazo` resolvido por **um único ponto** (§6). O PDV pode enviar
`p_vencimento` (opcional); nunca anterior à data da venda; nunca nulo.
**R-3 Descrição e origem.** `contas_receber.origem` (`VENDA_PDV` | `MANUAL`; coluna `NOT NULL DEFAULT 'MANUAL'`, mesma semântica de
`liquidacoes_receber.origem`) e `descricao` = `Venda <número curto> — <PARCIAL|A_PRAZO>`.
**R-4 Venda 100% a prazo.** `p_pagamentos` vazio é aceito **se e somente se** `saldo_a_prazo = total > 0` e R-1/R-2/R-3 satisfeitas.
`PAGAMENTO_ZERO` permanece para venda **sem** título (total > 0, nada pago, nada a receber). Nada entra no caixa; nenhuma linha em
`vendas_pagamentos`; o trigger de crédito de caixa não dispara.
**R-5 `vendas.forma_pagamento` = meio de pagamento (compat).** Não recebe `A_PRAZO`. Para venda sem nenhum pagamento (A_PRAZO) o valor é
**`NULL`**: exige `ALTER COLUMN forma_pagamento DROP NOT NULL` — o CHECK `vendas_forma_pagamento_check` e `vendas_forma_pagamento_nao_fiado`
já aceitam `NULL` (`venda_eventos.forma_pagamento` já é nullable). Para venda dividida a coluna continua sendo a 1ª parcela **apenas por
compatibilidade**; nenhum leitor novo a usa (I-5). O CHECK que proíbe `FIADO/CREDIARIO/CREDITO_LOJA/FIADO_LOJA` como **forma** permanece:
crédito não é meio de pagamento, é saldo a receber.
**R-6 Leitura única da situação.** View **`vendas_situacao_pagamento`** (única fonte de leitura, sem coluna armazenada):
`venda_id, loja_id, total, pago, saldo_a_prazo, situacao (QUITADA|PARCIAL|A_PRAZO), meios text[] (de vendas_pagamentos), titulo_id,
vencimento, saldo_em_aberto`. Dashboard, `/admin/vendas`, relatórios, exportação, comprovante e 2ª via passam a usá-la.
Venda dividida passa a exibir **"Dinheiro + PIX"**; parcial exibe "Dinheiro (parcial) + A receber".
**R-7 Cancelamento e devolução.** Cancelar a venda cancela o título (regra existente, `DECISOES_PRODUTO_UX03.md:269`); a parte paga em
dinheiro sai do **caixa aberto que paga** (`CONTRATO_CAIXA_C3.md` C-2/C-3/C-7); devolução parcial reduz primeiro o saldo em aberto do título
e só depois o pago; se já houve liquidação, o excedente é estornado na forma recebida.
**R-8 Liquidação posterior.** Inalterada (`registrar_liquidacao_receber`): DINHEIRO entra no caixa que recebe.
**R-9 Auditoria.** A concessão de crédito registra: cliente, valor, limite antes/depois, modo, quem autorizou (token), vencimento — no log de
auditoria central (classe C8) e em `venda_eventos`.

## 4. Consistência com PDV, vendas, caixa, contas a receber e relatórios
| Superfície | Como consome o contrato |
|---|---|
| PDV | Permite finalizar com 0 pago quando há cliente; escolhe vencimento; exibe aviso de limite; mostra situação e saldo. |
| Vendas (`/admin/vendas`) | Situação + meios via R-6; "saldo em aberto" e link ao título já existem (`VendaDetailSheet.tsx:207-216`). |
| Caixa | Só o pago em dinheiro (I-2); nada do valor a receber. |
| Contas a receber | Título com I-3; vence de fato (`tituloVencido`). |
| Relatórios/Dashboard | Meios por `vendas_pagamentos`; total a prazo separado do recebido; exportação idem. |
| Recibo/2ª via | Saldo a receber, vencimento e cliente também na reimpressão. |

## 5. Plano de implementação (após aprovação)
| Camada | Mudança | Reaproveita |
|---|---|---|
| Banco | `contas_receber.origem`; `vendas.forma_pagamento` nullable; RPC v4 (`_unscoped`): aceitar `p_pagamentos` vazio com saldo, `p_vencimento`, preencher `vencimento/descricao/origem`, retornar `situacao` e `saldo_a_prazo`; view `vendas_situacao_pagamento`; evento de auditoria | mesma RPC v4 (sem RPC nova); `round_abnt`; `SALDO_PENDENTE_EPS` |
| Servidor | `caixaVendas.impl.ts`: repassar `vencimento`; devolver situação/saldo | — |
| PDV | Permitir 0 pago com cliente; vencimento; aviso de limite | `CaixaSelecionarClienteModal`, `pagamentoParcialExigeCliente` |
| Leitura | Trocar `vendas.forma_pagamento` pela view nas telas/relatórios/exportação (classe C4) | — |
| Textos | `pt.json:647,2578`; `MANUAL_OPERADOR_RESUMIDO.md`; `docs/CHECKLIST_EXECUCAO_GO_LIVE.md`; comentário de `formas_pagamento` | — |
| Testes | SQL: I-1…I-5; R-4 (com/sem cliente/limite/token); R-5 (NULL aceito, FIADO recusado); R-6 (dividida = "Dinheiro + PIX"); cancelamento e devolução; unit `caixaPagamentoSaldo`; e2e `caixa-venda-multi-pagamento`, `caixa-fase5b-golden-flow-ui` | testes BA-001 existentes |

## 6. Prazo e futura configuração por loja (sem implementar agora)
- **Ponto único de resolução**: o prazo é obtido por *um* resolvedor (`prazo_venda_a_prazo_dias(loja)`), nunca por literal na RPC ou no PDV.
- **Fonte inicial**: valor seedado `30` numa chave de `configuracoes_gerais` (tabela global chave/valor, já existente, sem mudança de esquema),
  tratado como **DEFAULT** da configuração.
- **Evolução por loja**: quando `prazo_venda_a_prazo_dias` (e `permitir_venda_a_prazo`) forem criadas em `pdv_config` (tem `loja_id`), o resolvedor
  passa a ler primeiro a linha da loja e cai no default global. **A RPC, o PDV e a view não mudam.**
- **Habilitação futura**: `permitir_venda_a_prazo` = **uma** checagem no ponto que cria o título (RPC v4); desabilitado → integral permitido,
  parcial e 100% a prazo bloqueados; habilitado → os três. O PDV só reflete (UX).
- **O que nada disso exige hoje**: coluna nova em `lojas`/`pdv_config`, tela de configuração, flag.

## 7. Compatibilidade e riscos
- `vendas.forma_pagamento` deixar de ser `NOT NULL`: revisar leitores que assumem valor (dashboard, exportação, `toPayment`, comissões, fiscal).
- View nova é a única leitura: migrar telas por etapas, sem manter dois cálculos em paralelo.
- Venda 100% a prazo aumenta exposição de crédito: modo `AVISO` como padrão é frágil (D-2).
- Títulos já criados por vendas anteriores não têm vencimento/descrição/origem: **backfill** conservador (`origem='VENDA_PDV'`, descrição
  gerada, vencimento = data da venda + prazo) só com aprovação, em dry-run primeiro.

## 8. Fiscal — risco separado (fora do contrato)
O mapeamento fiscal do meio de pagamento (PARCIAL/A_PRAZO) **não** é resolvido por rótulo em `forma_pagamento`. Os 35 documentos em `ERRO`
(`NFC_E_STUB`, 13/08) permanecem risco próprio até haver análise do fluxo fiscal. Este contrato apenas garante que a informação necessária
(meios pagos, saldo a prazo, título) esteja derivável de `vendas_pagamentos`/`contas_receber`.

## 9. Decisões abertas
- **D-1** Confirmar que semear o default `30` em `configuracoes_gerais` (global) é aceitável até existir a configuração por loja.
- **D-2** `modo_limite_credito` padrão para A_PRAZO: manter `AVISO` (com aviso visível) ou `AUTORIZACAO_GERENTE`?
- **D-3** O operador pode editar o vencimento no PDV? Limite máximo de prazo?
- **D-4** Cliente com cadastro completo (CPF validado — classe C7) como pré-requisito de A_PRAZO?
- **D-6** `contas_receber.valor_total` deve passar a ser o valor financiado (`saldo_a_prazo`) em vez do total da venda? Hoje I-1 só se verifica por `total − pago`; mudar afeta relatórios de AR já publicados.
- **D-5** Backfill dos títulos de venda existentes (§7).
