# VAL-01 — Auditoria de campos numéricos e monetários (2026-10-31)

Escopo deste documento: diagnóstico da Etapa 1 (somente leitura), matriz dos campos
numéricos do cadastro de produto (fluxo completo inspecionado), mapa de risco dos demais
módulos (varredura por padrão de código, **não** inspeção campo a campo) e o resultado da
VAL-01A (correção prioritária do cadastro de produto).

Legenda de status: **PASSOU / FALHOU / NÃO TESTADO** (como pedido na Etapa 7).

## 1. Padrões de defeito encontrados

| # | Padrão | Onde | Efeito real | Evidência |
|---|--------|------|-------------|-----------|
| D1 | Filtro de tecla remove `.` e `-` e corta letras | `hooks/useMoneyInput.ts` → `filterBRLChars` | `10.50` vira `1050` (R$ 1.050,00); `-10` vira `10`; `abc` vira vazio sem aviso | `lib/format/money.ts:73` |
| D2 | Strip de não-dígitos | `EstoqueSection.tsx`, `PrecosSection.tsx` (gatilho) | `0,500` vira `500`; `1.5` vira `15`; `12abc` vira `12` | `replace(/\D/g, '')` |
| D3 | `parseInt` sobre texto já filtrado | `estoqueInicialCadastro.ts`, `produtoForm.mappers.ts` (`parseGatilhoSubmit`) | `1.000` vira `1`; decimal vira parte inteira | `Number.parseInt` |
| D4 | `Number()` aceita notação científica e hex | `FaixasAtacadoEditor.tsx` (quantidade) | `1e5` vira 100000 faixa de atacado | `Number(quantidadeTexto)` |
| D5 | Casas decimais cortadas em silêncio | `filterBRLChars` (corta a 2 casas) | `2,005` vira `2,00` | `money.ts:83` |
| D6 | Sem teto de valor | formulário inteiro | valor acima de `numeric(10,2)` chega ao banco e estoura erro cru | `001_schema_inicial.sql:70` |
| D7 | Validador de domínio sem teto nem regra de casas | `shared-core/src/products/policies/validateProductInput.ts` | RPC/Writer/Updater aceitam `2.005` e `1e8` sem rejeitar | código antes da VAL-01A |
| D8 | `type="number"` no ajuste de estoque e no PDV | `AjusteSaldoModal.tsx`, `CaixaCartList.tsx` | ver seção 3 (PDV) | grep |
| D9 | RPC `criar_produto_com_estoque_inicial` converte com `::numeric` e grava `numeric(10,2)` | `backend/supabase/migrations/20260902140100_criar_produto_icms_origem.sql` | chamada direta à RPC com `2.005` arredonda no banco sem erro | migration |

## 2. Matriz — cadastro de produto (fluxo inspecionado)

Campos numéricos do formulário de produto (`ProdutoFormCompleto` / `ProdutoFormRapido`):

| Módulo | Tela / arquivo | Campo | Tipo | Regra antes | Regra depois (VAL-01A) | Limite | Precisão | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Produtos | `PrecosSection.tsx` | Preço varejo | moeda | filtro BRL (D1, D5) | `parseMoedaEntrada` estrito; motivo no campo | 0 a 99.999.999,99 | 2 casas | Crítico | P0 | PASSOU (unit) |
| Produtos | `PrecosSection.tsx` | Preço de custo | moeda | filtro BRL (D1, D5) | idem | idem | 2 casas (ver decisão D-C1) | Alto | P0 | PASSOU (unit) |
| Produtos | `PrecosSection.tsx` | Preço atacado (inline) | moeda | filtro BRL (D1) | idem | idem | 2 casas | Alto | P0 | PASSOU (unit) |
| Produtos | `FaixasAtacadoEditor.tsx` | Preço da faixa | moeda | filtro BRL (D1) | estrito | idem | 2 casas | Alto | P0 | PASSOU (unit) |
| Produtos | `FaixasAtacadoEditor.tsx` | Quantidade mínima da faixa | inteiro | `type=number` + `Number()` (D4) | `parseQuantidadeInteiraEntrada` | 1 a 9.999.999 | inteiro | Médio | P1 | PASSOU (unit) |
| Produtos | `EstoqueSection.tsx` | Estoque inicial | inteiro | strip de dígitos (D2, D3) | rejeita decimal, letras e negativo | 0 a 9.999.999 | inteiro (ver D-Q1) | Alto | P0 | PASSOU (unit) |
| Produtos | `EstoqueSection.tsx` | Estoque mínimo | inteiro | strip de dígitos (D2) | idem | idem | inteiro | Médio | P1 | PASSOU (unit) |
| Produtos | `PrecosSection.tsx` | Quantidade gatilho de atacado | inteiro | strip (D2) | idem | idem | inteiro | Médio | P1 | PASSOU (unit) |
| Produtos | `shared-core validateProductInput.ts` | Preço e atacado (create/update) | moeda | sem teto nem casas (D6, D7) | rejeita > teto, > 2 casas, NaN, Infinity | idem | 2 casas | Alto | P0 | PASSOU (unit) |
| Produtos | `shared-core validateProductInput.ts` | Estoque inicial (create) | inteiro | só `< 0` (D7) | rejeita > teto e não finito | 9.999.999 | — | Médio | P1 | PASSOU (unit) |
| Produtos | RPC `criar_produto_com_estoque_inicial` | preço, estoque | numeric | sem teto nem casas | **não alterado** (exige migration) | — | arredonda | Alto | P1 | FALHOU (banco) — ver D-B1 |

Campos de produto sem numérico com risco identificado nesta rodada: nome (mín. 2 caracteres, sem máximo),
código de barras (mín. 3, sem máximo e sem validação de dígito GTIN), NCM/CEST/CFOP (sem validação de formato).
Não avaliados em profundidade — ver backlog.

## 3. Mapa de risco dos demais módulos (varredura por padrão, sem inspeção campo a campo)

Contagem obtida por busca no código (`pdv-importados/app`, `components`, `lib`):

- 57 ocorrências de strip `replace(/\D/g, …)` em 30 arquivos `.tsx`.
- 23 arquivos com `<input type="number">`.
- 6 consumidores de `parseBRL`/`parseMoney`/`parseMoneyOrZero`, e 5 de `useMoneyInput`/`filterBRLChars` (todos com comportamento legado de filtro).

| Prioridade | Área | Arquivos | Risco | Status |
|---|---|---|---|---|
| **P0** | PDV — quantidade no carrinho | `app/caixa/CaixaCartList.tsx` | Campo `type="number"`. Ao digitar `0,5` ou apagar o valor, o parser devolve 0 e `CaixaPageClient.tsx:697` **remove o item** do carrinho ("qtde zero"). Quebra a venda fracionada, que é regressão obrigatória. | FALHOU (análise de código; sem E2E) |
| **P0** | Financeiro — valores | `FinanceiroContas`, `FinanceiroDespesaForm`, `FinanceiroReceberExtras`, `FinanceiroAcoesRapidas`, `FinanceiroRecebiveis` | Strip de dígitos e `type="number"` em campos de dinheiro | NÃO TESTADO |
| **P0** | Estoque — ajuste de saldo | `app/admin/estoque/_components/AjusteSaldoModal.tsx` | `Number(qtd.replace(',', '.'))` aceita `1e5`; `type="number"` | NÃO TESTADO |
| **P1** | Comissões | `RegrasComissaoClient`, `MetasComissaoClient` | Percentuais e metas com strip/`type="number"`; regra de percentual não revisada (ver seção 5) | NÃO TESTADO |
| **P1** | Clientes | `ClienteEditarModal.tsx` (8 ocorrências) | Limite de crédito e campos numéricos com strip | NÃO TESTADO |
| **P1** | Compras | `OcFormModal.tsx` (`parseFloat`/`parseInt` ×4) | Quantidades e custos de OC | NÃO TESTADO |
| **P1** | Recebimento / transferências | `RecebimentoGerentePageClient`, `ItensPedidoRecebimento`, `TransferenciasGerentePageClient` | Quantidades conferidas com `type="number"` | NÃO TESTADO |
| **P1** | Importação NF-e | `ImportarNfePageClient`, `NotaManualForm` | Valores de NF-e digitados manualmente; custo truncado a 2 casas já registrado (IM-F01) | NÃO TESTADO |
| **P1** | Server-side | `lib/gerente/financeiroTitulosServer.ts`, `app/caixa/server/caixaFechamentoServer.ts` | `parseFloat`/`parseInt` em borda de servidor | NÃO TESTADO |
| P2 | Configurações, assinatura, funcionários (PIN), etiquetas | arquivos listados no grep | strip de dígitos e `type="number"` | NÃO TESTADO |

Não auditados nesta rodada (sem evidência coletada): Fornecedores, Funcionários (cadastro), Planos e
assinaturas (preço de `saas.planos` é placeholder, conforme `PROXIMOS_PASSOS.md`), validação de CPF, CNPJ,
CEP, GTIN e NCM (sem função de dígito verificador localizada nesta varredura).

## 4. O que foi corrigido (VAL-01A)

Código novo:
- `shared-core/src/formatting/entradaNumerica.ts`: `parseMoedaEntrada` (pt-BR estrito) e
  `parseQuantidadeInteiraEntrada`. Entrada inválida retorna `motivo`, nunca um número corrigido.
- `pdv-importados/components/gerente/produtos/form/produtoForm.entrada.ts`: validação das entradas do
  formulário de produto, mensagens PT/ZH e campo de erro (`data-field`).

Código alterado:
- `hooks/useMoneyInput.ts`: nova opção `{ estrito: true }` e método `validar()`. **Padrão legado
  preservado** para os outros 4 consumidores (opt-in).
- `components/gerente/produtos/form/useProdutoForm.ts`: preço varejo, atacado e custo usam o modo estrito.
- `useProdutoFormOrchestration.ts`: bloqueia o salvar com o erro no campo antes de qualquer RPC.
- `EstoqueSection.tsx`, `PrecosSection.tsx`, `FaixasAtacadoEditor.tsx`: sem strip; exibem o erro no campo.
- `produtoForm.mappers.ts` (`parseGatilhoSubmit`), `lib/gerente/estoqueInicialCadastro.ts`: usam o parser estrito.
- `shared-core/src/products/policies/validateProductInput.ts`: teto de moeda e de quantidade e rejeição
  de mais de 2 casas e de não finitos. É a camada usada por `productWriter` e `productUpdater`.
- `src/lib/i18n/pt.json` e `zh.json`: 8 mensagens novas (`entrada_*`). A tradução ZH é de revisão
  técnica; **pendente revisão nativa**.

Comportamento após a correção, para as entradas da Etapa 6 (camada de formulário e validador):

| Entrada | Preço | Quantidade inteira |
|---|---|---|
| `abc` | recusa (formato) | recusa (formato) |
| `12abc` | recusa (formato) | recusa (formato) |
| `10.50` | recusa (usar vírgula) | recusa (fracionada) |
| `10,50` | aceita 10,50 | — |
| `1.234,56` | aceita 1234,56 | — |
| `1e5` | recusa (formato) | recusa (formato) |
| `-10` | recusa (negativo) | recusa (negativo) |
| `0` | aceita (validação de "> 0" mantida no salvar) | aceita |
| `0,500` | aceita 0,5 | recusa (fracionada) |
| `10,555` | recusa (mais de 2 casas) | — |
| `100.000.000,00` | recusa (acima do teto) | — |
| vazio | opcional (null) | opcional (null) |
| colado com espaços | `trim` antes do parse | `trim` antes do parse |

Arquivos alterados: ver `git status` do branch. Nenhuma migration foi criada nem executada.

## 5. Testes executados

| Suíte | Resultado |
|---|---|
| `shared-core` — `src/formatting` (entradaNumerica: 21 casos novos) + `src/products` (validador: 5 casos novos) | PASSOU — 63/63 |
| `shared-core` `tsc --noEmit` | PASSOU |
| `pdv-importados` — `tsc --noEmit -p tsconfig.typecheck.json` | PASSOU |
| `pdv-importados` — vitest em `components/gerente/produtos`, `lib/gerente/estoqueInicialCadastro`, `lib/format`, `app/admin/produtos`, `hooks` | PASSOU — 46 arquivos, 310 testes passaram, 0 falhas (filtro amplo: `components/gerente/produtos`, `lib/gerente/estoqueInicialCadastro`, `lib/format`, `app/admin/produtos`, `hooks`) |
| Teste novo `produtoForm.entrada.test.ts` | PASSOU (incluído acima) |
| E2E (Playwright) do cadastro de produto em homologação | NÃO TESTADO — sem acesso à homologação nesta sessão; nada foi executado em produção |
| Regressão: venda fracionada no PDV | NÃO TESTADO — defeito P0 identificado na seção 3 (ver decisões) |
| Regressão: alteração de estoque, cálculo de preço, importação NF-e, fechamento de venda | NÃO TESTADO |
| Rejeição no backend com frontend contornado (chamada direta à RPC) | FALHOU — RPC não alterada (D-B1) |

## 6. Decisões que dependem de aprovação (não alteradas por mim)

- **D-Q1 — Estoque inicial inteiro.** A regra atual (inteiro) foi preservada. Produtos vendidos por peso
  (KG) podem precisar de estoque inicial fracionário. A coluna de estoque aceita 3 casas. Definir por unidade de medida.
- **D-M1 — Ponto como separador.** `10.50` é recusado com mensagem; `1.234` é lido como 1234 (milhar).
  `10.500` é lido como 10500. Alternativa: aceitar `.` como decimal quando houver exatamente 1 ou 2
  dígitos após ele (é o caso de teclado numérico em celular). Requer aprovação.
- **D-C1 — Precisão do custo.** O custo continua com 2 casas, como hoje no banco
  (`preco_custo numeric(10,2)`). `PROXIMOS_PASSOS.md` (IM-F01) aponta necessidade de 4 a 6 casas. A entrada
  já bloqueia o 3º decimal; ao mudar a escala, alterar `parseMoedaEntrada` (ou criar parser de custo) e o banco juntos.
- **D-T1 — Tetos.** `99.999.999,99` para moeda e `9.999.999` para quantidade são escolhas técnicas
  (espelham `numeric(10,2)` e um teto de operação). Confirmar com o negócio.
- **D-B1 — Backend.** A RPC `criar_produto_com_estoque_inicial` e as de ajuste de estoque ainda não rejeitam
  mais de 2 casas nem valores acima do teto quando chamadas direto. Corrigir exige nova migration, o que
  não foi feito (restrição de migrations). Proposta: migration com `RAISE` nos mesmos limites, após revisão.
- **D-PDV1 — Quantidade fracionada no carrinho (P0).** Corrigir `CaixaCartList`/`CaixaPageClient` mexe no
  fluxo de venda. Pede aprovação e teste E2E de venda fracionada antes de mudar.
- **D-MIG — Opt-in do `useMoneyInput`.** O padrão legado foi mantido de propósito para não alterar
  Financeiro, Caixa, Clientes e OC sem revisão. Migrar cada consumidor é um lote do VAL-01C.

## 7. Backlog priorizado (VAL-01C, um PR por lote)

1. PDV — quantidade fracionada no carrinho (P0; decisão D-PDV1).
2. Financeiro — campos de dinheiro (strip e `type="number"`), com parser estrito.
3. Estoque — `AjusteSaldoModal`: quantidade e mínimo.
4. Backend — limites e casas na RPC de criação e de ajuste (D-B1, migration).
5. Comissões e clientes (percentuais e limites: regra por tipo, sem o 0–100% geral).
6. Compras, recebimento, transferências e importação NF-e (custo e quantidade).
7. Identificadores: CPF/CNPJ/CEP/GTIN/NCM/CEST/CFOP — formato, dígito verificador e preservação de zeros à esquerda.
8. Textos: limites de nome, descrição e observação (hoje sem máximo), após consulta ao banco.

## 8. Riscos e regressões

- O modo estrito muda o que o operador vê: antes um valor errado era corrigido sem aviso; agora ele
  precisa corrigir. É o comportamento pedido, mas aumenta o atrito no cadastro rápido. Monitorar.
- Tradução ZH das mensagens `entrada_*` pendente de revisão nativa.
- Edição de produto existente: o valor carregado é formatado com `formatDecimalBRL` (`1.234,50`), que o
  parser estrito aceita. Coberto por teste de parser, não por teste de tela.
- Dados existentes não foram alterados. Nenhuma migração, nenhum UPDATE.
