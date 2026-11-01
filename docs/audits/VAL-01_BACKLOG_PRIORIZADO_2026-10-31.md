# VAL-01 — Backlog priorizado com evidências (2026-10-31)

Complementa `VAL-01_AUDITORIA_CAMPOS_2026-10-31.md`. A varredura abaixo é por padrão de código
(grep em `pdv-importados/app`, `components`, `lib`, excluindo testes). **Não é inspeção campo a
campo.** Cada item precisa de leitura do fluxo antes de virar correção. Status: NÃO TESTADO salvo indicação.

Classificação dos padrões encontrados:

- **Valor ou quantidade digitado** (dinheiro, estoque, percentual): exige parser estrito (`parseMoedaEntrada`,
  `parseValorEntrada`, `parseQuantidadeEntrada`).
- **Identificador** (CNPJ, CPF, CEP, telefone, PIN, NCM): o `replace(/\D/g)` é normalização de formato, não
  conversão de valor. O risco é aceitar letras e tratar o resultado como válido. Exige validação de tamanho e
  de dígito verificador, não só remover caracteres.

## P0 — quebra venda, dinheiro ou estoque

| # | Área | Evidência (arquivo:linha) | Padrão | Risco | Ação proposta |
|---|------|---------------------------|--------|-------|---------------|
| 1 | PDV, quantidade no carrinho | `app/caixa/CaixaCartList.tsx` (campo `QuantidadeInput`) | digitação confirmada por tecla | **Corrigido nesta rodada** (rascunho + confirmação). Falta E2E | E2E da venda fracionada (ver seção "Rodada 2" de `VAL-01_AUDITORIA_CAMPOS_2026-10-31.md`) |
| 2 | PDV, unidade no carrinho | `stores/carrinhoStore.ts` (`ItemCarrinho` sem `unidadeMedida`) | regra por unidade não chega ao PDV | Produto UN aceita `0,5` no carrinho. Viola a regra de unidade | Incluir `unidade_medida` no resultado da busca do PDV e no item do carrinho; validar no `QuantidadeInput` |
| 3 | Ajuste de saldo de estoque | `app/admin/estoque/_components/AjusteSaldoModal.tsx:129,162-163` (`Number(qtd.replace(',', '.'))`) e `:260,285,298` (`type="number"`) | conversão manual + `type=number` | Aceita `1e5`; ajuste de saldo é operação de estoque | Parser estrito por unidade; mesma regra do cadastro |
| 4 | Financeiro, valores em R$ | `app/admin/financeiro/_components/FinanceiroContas.tsx:269,301`, `FinanceiroDespesaForm.tsx:18`, `FinanceiroRecebiveis.tsx:33`, `FinanceiroAcoesRapidas.tsx:194,206,225,240`, `FinanceiroReceberExtras.tsx:259,350` | `Field type="number"` em valor monetário | Separador decimal depende do navegador e do locale; risco de valor errado em conta a pagar/receber | Trocar por campo monetário estrito; validar com `parseMoedaEntrada`. Exige revisão do contador para regra de parcelas e taxa |
| 5 | Importação NF-e, quantidades e custos | `app/gerente/estoque/importar-nfe/ImportarNfePageClient.tsx:623,701,1126` (`type=number`) | `type=number` em quantidade/valor | Entrada de estoque errada. Custo já truncado a 2 casas (IM-F01) | Após decisão D-C1 (precisão do custo) |
| 6 | Recebimento e transferência, quantidade conferida | `app/gerente/recebimento/RecebimentoGerentePageClient.tsx:493,506`, `ItensPedidoRecebimento.tsx:35` (`step=0.001`), `app/gerente/transferencias/TransferenciasGerentePageClient.tsx:319` | `type=number` com fração | Quantidade de entrada/transferência errada | Parser fracionado por unidade do produto |
| 7 | Compras (OC), quantidade e custo | `app/gerente/compras/OcFormModal.tsx:360`; `parseFloat`/`parseInt` no mesmo arquivo (4) | `type=number` + conversão manual | Compra com valor errado | Parser estrito |

## P1 — dados de negócio com limite ou regra a decidir

| # | Área | Evidência | Padrão | Risco | Ação proposta |
|---|------|-----------|--------|-------|---------------|
| 8 | Comissões (regra de percentual) | `app/admin/comissoes/regras/RegrasComissaoClient.tsx:100` (`step=0.01 min=0`, sem `max`); `metas/MetasComissaoClient.tsx:72,75,128` (`max=100`, `max=99`) | limites diferentes por tela | Percentual sem teto na regra; limites inconsistentes entre telas | **Decisão de negócio** (regra por tipo de comissão). Não aplicar 0–100% a tudo |
| 9 | Clientes, documentos e contato | `app/gerente/clientes/ClienteEditarModal.tsx:36,47,89,91,126,131,150,152`; `app/gerente/clientes/clienteDisplayFormat.ts:6,15`; `app/admin/clientes/customerWriter.ts:20,22` | strip de não dígitos antes de salvar | CPF/CNPJ com letra vira número válido se o tamanho bater; falta dígito verificador | Validar tamanho **e** dígito verificador antes do strip; rejeitar letras |
| 10 | Fornecedores, CNPJ | `app/gerente/fornecedores/fornecedorContrato.ts:44`, `fornecedoresListUi.ts:19` (`.slice(0,14)`) | `slice` silencioso | `slice(0,14)` trunca CNPJ digitado a mais sem aviso | Rejeitar excedente em vez de cortar |
| 11 | Importação NF-e, CNPJ e NCM | `app/gerente/estoque/importar-nfe/NotaManualForm.tsx:193` (`.slice(0,14)`); `actions.validation.ts:96-119`; `app/admin/importacoes/actions.ts:152` (NCM) | `replace` + `transform` | NCM com letras vira número; CNPJ de 15 dígitos corta | Validação de formato e tamanho (NCM 8 dígitos) |
| 12 | Configurações da empresa | `app/gerente/configuracoes/actions.ts:81-116` (CNPJ, CEP, telefone, CNAE) | `replace` no servidor | CNAE e CEP sem validação de formato antes do strip | Validar formato no servidor e rejeitar |
| 13 | Assinatura, quantidade de lojas e caixas | `app/admin/assinatura/_components/AssinaturaContent.tsx:119-120` | `Number(e.target.value) \|\| 1` | Campo vazio ou `abc` vira `1` sem aviso | Parser estrito; não substituir por 1 |
| 14 | Divisão de comissão por venda | `app/admin/comissoes/metas/MetasComissaoClient.tsx:128` (`min=1 max=99`, `Number(...)`) | limite fixo na tela | Divisão de comissão fora da regra do servidor | Confirmar a regra no servidor |
| 15 | Configurações admin, campos numéricos | `app/admin/configuracoes/_components/ConfiguracoesContent.tsx:556,571` | `type=number` | Não auditado | Ler o fluxo antes de decidir |
| 16 | Etiquetas, impressão de preço | `app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx:333`, `EtiquetaCarrinho.tsx:139` | `type=number` | Quantidade de etiqueta, baixo impacto | Parser inteiro |

## P2 — identificadores e PIN (validação de formato)

| # | Área | Evidência | Ação |
|---|------|-----------|------|
| 17 | PIN de caixa e funcionário | `app/caixa/meu-pin/MeuPinClient.tsx:55,68`; `app/admin/funcionarios/FuncionarioPinModal.tsx:72`; `FuncionarioEditarModal.tsx:369,381` | Strip de dígitos e `slice(0,4)`. Rejeitar letra; validar 4 dígitos |
| 18 | GTIN/EAN no cadastro | `app/gerente/produtos/produtoFormSchema.ts:76,82,89` (`replace` + `transform`) | Validar dígito verificador de GTIN antes do `transform` (ainda não implementado) |
| 19 | Funcionário, CPF | `app/admin/funcionarios/funcionarioDados.ts:23` | Validar CPF com dígito verificador |

## Pendências que dependem de decisão ou de banco (não corrigidas nesta rodada)

- **D-B2 — Migration `20261031120000` não aplicada em homologação.** Testada em transação com `ROLLBACK` (ver relatório). Aplicar de fato exige aprovação, porque homologação tem 4 migrations de 2026-10-30 que o repositório não contém (ver seção "Rodada 2" de `VAL-01_AUDITORIA_CAMPOS_2026-10-31.md`).
- **D-PRECISAO — Custo com 6 casas (IM-F01).** Parser já aceita (`parseValorEntrada`). Schema e cálculos de custo ficam para decisão.
- **D-TETO — Teto de negócio para estoque e quantidade.** Não há teto de negócio aplicado. Só os técnicos (`numeric(10,3)`, `integer`).
- **D-FRACAO-PDV — Fração no PDV para unidade contável.** Depende do item 2.
