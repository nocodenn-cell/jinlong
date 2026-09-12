# Bling observado em conta real × Jinlong — o que aproveitar

**Data:** 2026-09-11
**Entrada:** 8 documentos de auditoria do Bling em conta real (rodadas 1–3, set/2026), com
convenção `[OBSERVADO] / [INFERÊNCIA] / [BLOQUEADO] / [NÃO OBSERVADO]`.
**Saída:** classificação de cada achado em **adotar · adaptar · não adotar · já existe**, com
evidência no código do Jinlong.
**Companheiro de:** [`SPRINT_PARIDADE_BLING_MAPA_GAPS.md`](./SPRINT_PARIDADE_BLING_MAPA_GAPS.md)
(mapa de gaps do dia anterior — este documento **corrige três itens dele**, ver §1).

> Os 8 documentos declaram o que não foi visto. **PDV, baixa de título, sessão de caixa,
> cancelamento e devolução do Bling nunca puderam ser abertos** (plano/trial expirado, conta sem
> Loja, sem Natureza de Operação). Onde o Bling está marcado como `[NÃO OBSERVADO]` eu **não trato
> como gap do Jinlong** — não há gabarito. Isso exclui da análise justamente os módulos em que o
> Jinlong é mais maduro.

---

## 1. Correções ao mapa de gaps de ontem

Três itens que marquei como gap estão, na verdade, implementados. Apurado ao cruzar as tabelas
reais com a UI:

| Item de ontem | Situação real | Evidência |
|---|---|---|
| **PR-1** "sem histórico do produto" | **Parcialmente errado.** Histórico de **preços** existe e tem UI dentro do formulário do produto. O que falta é histórico das demais alterações (NCM, fornecedor, situação). | `components/gerente/produtos/produtoFormSections/HistoricoPrecosSection.tsx`; `historicoPrecosActions.ts` |
| **PD-1** "venda em espera não existe (congelada)" | **Errado.** Está implementada e ligada ao PDV — tabela `vendas_em_espera` com `rotulo`, `numero_local`, `status`, RPC `listar_vendas_em_espera`, hook montado. | `app/caixa/hooks/useCaixaVendasEmEspera.ts`; `CaixaPageClient.tsx:49,746` |
| **CX-2** "`formas_pagamento` sem uso" | **Confirmado e pior do que eu disse.** A tabela não é só um enum: tem `taxa_percentual` e `prazo_compensacao_dias` — modelagem de taxa de cartão e prazo de compensação, completa e **100 % ociosa**. | `database.types.ts` · zero leituras fora de `vendas` |

---

## 2. Onde o Jinlong está **à frente** do Bling — não regredir

Isto não é elogio: é uma lista de coisas que uma sprint de "parecer com o Bling" pode destruir por
engano. Cada linha sai de um `[NÃO OBSERVADO]`/`[BLOQUEADO]` explícito dos documentos.

| Capacidade | Bling observado | Jinlong |
|---|---|---|
| **Log de auditoria central** | *"não foi encontrada uma tela de log de auditoria genérico"* (§14.12). A trilha existe só como "Alterado em … por …" espalhado por registro. | `/admin/auditoria` — linha do tempo com KPIs, filtro por tipo e período, sheet de detalhe, sobre `venda_eventos` + `movimentos_estoque_log`. |
| **Conferência física por nota** | **Não existe no plano observado.** "Conferência de estoque" é inventário por bipagem, não recebimento por NF (§04). A peça certa — *"Check-in de Recebimentos"* — aparece **🔒 bloqueada por plano**. | Conferência item a item **obrigatória** antes de qualquer crédito; quantidade vem sempre de `quantidade_conferida`, nunca do cliente. |
| **Guarda de dupla entrada OC ↔ NF-e** | O Bling concilia itens, mas os documentos não observaram nenhuma trava contra creditar ordem **e** nota da mesma compra. | Guardas nas duas portas, **no banco**: `IMPORT_NFE_OC_JA_RECEBIDA` / `OC_NFE_JA_CREDITADA` + índice único. |
| **Kardex imutável** | Ledger com origem rastreável — mesmo conceito. | Mesmo conceito **+ trigger que bloqueia `UPDATE`/`DELETE`**. |
| **Recebimento parcial da compra** | Só 4 estados, sem rótulo de recebimento parcial ("Em andamento" cobre, §14.3). | `quantidade_conferida` por item; título financeiro nasce de `conferida × preço`, não do pedido. |
| **Bilíngue pt/中文** | — | Paridade fechada em 0 assimetrias. |
| **Pré-requisito não bloqueia em modal repetido** | Ponto de atenção do próprio relatório: *"modais bloqueantes repetidos, sem link contextual"* (§10). | `ConsequenciaOperacao` declara o efeito **antes** do submit, com atalho para o destino. |

---

## 3. O achado de maior retorno — capacidade já no banco, sem UI

Quatro funções que o Bling tem e que **o Jinlong já modelou e não expôs**. São as de melhor
relação valor/risco da sprint inteira: não inventam regra, não mudam invariante.

### 3.1 Aba "Fornecedores" do produto — **a tabela já existe**

O Bling amarra **N fornecedores por produto**, cada um com seu código, preço de compra e preço de
custo (§01, §14.2). É a base de comparação de preço entre fornecedores — e o público do Jinlong é
justamente importador.

O Jinlong **já tem a tabela N:N**: `vinculos_fornecedor_produto` (`produto_id`, `fornecedor_id`,
`ref_fornecedor`, `gtin_origem`, `criado_por`). Ela é usada **só como lookup interno** na
importação de NF-e e no GTIN cache — **não há nenhuma tela de cadastro**.

Falta: três colunas (`preco_compra`, `preco_custo`, `garantia`) e uma seção no formulário.

> **Achado colateral:** `produtos.fornecedor_id` (1:1) coexiste com `vinculos_fornecedor_produto`
> (N:N). Duas verdades sobre "quem fornece este produto" — ambiguidade de SSOT a resolver antes de
> construir a tela, não depois.

### 3.2 Formas de pagamento — cadastro completo e ocioso

`formas_pagamento` tem `codigo`, `nome`, `ativo`, **`taxa_percentual`**, **`prazo_compensacao_dias`**,
escopada por loja. É exatamente `Cadastros > Formas de pagamento` do Bling — e ninguém lê essa
tabela. Enquanto isso, a liquidação de Contas a Receber usa um array hardcoded
(`const FORMAS = ['DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO']`) que nem passa pelo i18n.

Ligar a tela de baixa a essa tabela resolve o **AR-3** de ontem e destrava taxa de cartão e prazo
de compensação sem migration alguma.

### 3.3 Histórico de pagamentos e estorno de Contas a Pagar

`contas_pagar_pagamentos` (tabela) e `estornar_pagamento_contas_pagar` (RPC) existem. Nenhum dos
dois tem UI. Já era **AP-2/AP-3** de ontem; os documentos confirmam que no Bling a baixa e o
estorno são ação de linha de primeira classe.

### 3.4 Ficha Financeira por contato

`conta.extrato.php` — extrato financeiro **por cliente/fornecedor**, que exige escolher o contato
antes de mostrar dado (§13, §14.8). O Jinlong tem `contas_receber`, `contas_pagar`,
`liquidacoes_receber` e `contas_pagar_pagamentos` — todos os dados existem; falta a tela que os
agrupa por contato. Zero migration.

---

## 4. Classificação de todos os achados

### 4.1 ADOTAR — paridade real, sem mudar regra de negócio

| # | Achado do Bling | Onde entra no Jinlong | Custo |
|---|---|---|---|
| A-1 | **Menu de linha "⋮"** como gesto único (§01, §14.2 — inclui "Clonar produto") | Padroniza as 5 formas diferentes de ação de linha hoje. Já era **TR-1**. | UI |
| A-2 | **Painel lateral de ações em massa** (Exportar planilha · Imprimir etiquetas · Mais ações) — presente em Produtos, Contatos e Notas de entrada | Hoje o Jinlong só tem "excluir em lote" no Catálogo. | UI |
| A-3 | **`Salvar` + `Salvar e dar baixa`** no formulário de conta (§06) | Elimina o ciclo lista → linha → ação para conta já paga. Redução de cliques literal. | UI+action |
| A-4 | **Seis situações derivadas de saldo × vencimento** (§06: Em aberto · Vencendo hoje · Atrasada · Paga parcialmente em dia · Paga parcialmente atrasada · Paga) | **AP-1 / AR-4**. Derivado, não persistido — nenhuma migration. | UI |
| A-5 | **Baixa em massa** ("Baixar selecionados", recebimento agrupado, até 300) | **AP-5**. | UI+action |
| A-6 | **"Imprimir agrupado por fornecedor/cliente" e "Gerar recibos"** (§06) | **AP-6 / AR-7** — os recibos do PDV já são referência de implementação. | UI |
| A-7 | **Ficha Financeira por contato** | §3.4 acima. | UI+action |
| A-8 | **Aba Fornecedores do produto com preço de compra/custo** | §3.1 acima. | UI + 3 colunas |
| A-9 | **Formas de pagamento como cadastro, não enum** | §3.2 acima. | UI+action |
| A-10 | **Filtro padrão útil por lista** (Produtos = "Últimos incluídos"; Notas recebidas = "Com pendência"; Orçamentos = "Em aberto") | Jinlong abre tudo em "todos". Uma lista que já abre no que precisa de ação economiza um clique por acesso. | UI |
| A-11 | **"Alterado em <data>, por <usuário>" no cabeçalho do registro** (§14.12 — confirmado em Contato e Produto) | O Jinlong tem `atualizado_por`/`updated_at` em `produtos` e não os exibe. | UI |
| A-12 | **Colunas customizáveis com "Aplicar"** | **TR-12**, P2. | UI |
| A-13 | **Anexos em conta e em pedido de compra** | Storage já existe (imagem de produto). | UI + DB |

### 4.2 ADAPTAR — a ideia é boa, a forma do Bling não serve

| # | Achado | Adaptação proposta | Por quê |
|---|---|---|---|
| B-1 | **Ajuste de estoque sempre pede preço de compra e custo** (§04, §14.5 — obrigatórios até no Balanço) | Pedir custo **só quando o ajuste for positivo**. | Hoje o `AjusteSaldoModal` pede quantidade, mínimo, motivo e observação — **nenhum custo**. Um ajuste positivo entra "de graça" e distorce `preco_custo_medio`. Ajuste negativo não precisa de custo. |
| B-2 | **Três datas na conta: Emissão · Competência · Vencimento** | Adotar **competência** só se houver DRE/relatório que a use. Caso contrário, é campo obrigatório sem consumidor. | `contas_pagar` tem `vencimento` e `criado_em`. Competência sem relatório de competência é burocracia. |
| B-3 | **Ocorrência: Única \| Parcelada \| Mensal \| … \| Semanal** (recorrência de contas fixas) | Adotar **Parcelada** (resolve **CO-1**, o parcelamento da compra). Deixar recorrência (aluguel, internet) para depois. | Parcelamento é o que falta no fluxo de compra já implementado. Recorrência é módulo novo. |
| B-4 | **Juros mensal % / Multa %** | Só junto com B-2/B-3, se houver decisão de cobrar encargo. | Escrita financeira nova — mesma classe do P1-5 congelado. |
| B-5 | **Conta Financeira / Portador na baixa** (§06 — para onde o dinheiro vai) | Reusar `caixas` + `formas_pagamento`, sem criar entidade "portador". | O Jinlong já pergunta o caixa físico, mas só quando há mais de um aberto e só para DINHEIRO. |
| B-6 | **Contato unificado Cliente/Fornecedor com tags de papel** (§02, achado nº 2) | **Não fundir as tabelas.** Enriquecer `fornecedores`, que hoje tem **só `cnpj` e `nome`** — sem endereço, e-mail, telefone. | `clientes` já tem documento/email/telefone/endereço/`limite_credito`. A assimetria é o problema real; a fusão é migration de alto risco sobre duas tabelas com RLS, FK e histórico. Ver §5. |
| B-7 | **Onboarding fiscal — wizard de 6 passos que destrava 3 funcionalidades** (§06, §13) | O Jinlong **já tem** `/admin/implantacao` com checklist persistido — mas é `adminOnly`, com vocabulário de fornecedor ("GO-LIVE"). Reaproveitar o mecanismo para um checklist **do cliente**. | Não precisa construir do zero: `implantacao_checklists` + `implantacao_checklist_itens` já existem. |
| B-8 | **Conferência de estoque por bipagem → "Gerar balanço"** (§04) | Adotar o gesto (bipar GTIN/SKU, contador lidos × a ler, log salvo) sobre o `AjusteSaldoModal` existente. | "Inventário formal" está **fora do D0**. O que cabe agora é a contagem assistida, não o processo de inventário. |

### 4.3 NÃO ADOTAR

| Achado | Por quê |
|---|---|
| **Três telas financeiras com nomes parecidos** (Contas a Pagar/Receber · Caixas e Bancos · Controle de Caixa) | O próprio relatório marca como confuso (§7: *"exigem que o usuário entenda a diferença conceitual entre título, extrato e sessão de caixa"*). O Jinlong tem Financeiro + Caixa — dois, não três. Manter. |
| **Dois sentidos de "Checkout"** (comercial × separação logística) | O relatório recomenda explicitamente evitar (§13, item 9). |
| **"Controle de Estoque" e "Lançamentos de estoque" para a mesma tela** | Dois rótulos, uma tela (§5). Ruído. |
| **Produto em abas** | Decisão vigente do Jinlong: seções permanentes, meta de 20 s/cadastro, com Recovery Guard. Ver mapa de gaps §5. |
| **Pedido de venda com 8 estados** | O Jinlong é PDV-first: venda nasce concluída. Oito estados servem a e-commerce/expedição, não a loja de balcão. |
| **Modal bloqueante repetido a cada campo tocado** | Ponto de atenção do próprio relatório (§10, §14.14). |
| **Pré-requisito que só aparece na hora de operar** | Mesma causa. O padrão certo é o `ConsequenciaOperacao` que o Jinlong já usa. |

### 4.4 FORA DE ESCOPO — grande, e sem gabarito observado

| Achado | Situação |
|---|---|
| **"Notas recebidas" — busca automática de NF-e na SEFAZ (DF-e)** | Terceiro caminho de entrada, por CNPJ destinatário. Feature de integração fiscal inteira; o Jinlong só importa XML manual. O próprio auditor marcou o conteúdo como `[NÃO OBSERVADO]` (conta sem NF-e pendente). |
| **Multi-depósito + transferência entre depósitos** | O Jinlong escopa por **loja** (`transferencias`), não por depósito dentro da loja. Mudança de modelo de estoque. |
| **Produto com variação (grade) e com composição (kit)** | Os documentos marcam os campos internos como `[NÃO OBSERVADO]` — só os rótulos do seletor foram vistos. **Sem gabarito, não se implementa.** |
| **Listas de preço (Taxas / Por período / Customizada)** | Zero cadastradas na conta observada; estrutura não vista. O Jinlong tem faixas de atacado. |
| **Naturezas de operação por wizard de perfil de negócio** | Bom achado (§06: o Bling não pede CFOP cru, deriva de regime + faixa + ramo + atividades), mas é fiscal de saída — a fila fiscal do Jinlong é outra frente. |

---

## 5. A única decisão que é do dono

**Cliente e Fornecedor: fundir ou enriquecer?**

O fato: no Bling é **um cadastro só** (`contatos.php`, formulário intitulado "Cliente ou
Fornecedor"), com papel por tag multi-seleção — confirmado diretamente, não inferido. Para
importador que compra e vende ao mesmo parceiro, isso elimina cadastro duplo.

No Jinlong são duas tabelas, e são desiguais:

| | `clientes` | `fornecedores` |
|---|---|---|
| Campos | nome, documento, email, telefone, endereco, **limite_credito**, tipo, ativo, consentimento | **cnpj, nome** — e nada mais |

**Minha recomendação: não fundir.** Fundir é migration sobre duas tabelas com RLS, FKs
(`contas_pagar.fornecedor_id`, `contas_receber.cliente_id`, `produtos.fornecedor_id`,
`vinculos_fornecedor_produto`, `importacoes_nfe.fornecedor_id`) e histórico — risco alto para um
ganho que é de cadastro, não de operação. O problema que dói hoje é outro: **`fornecedores` é pobre
demais**. Não dá para mandar um pedido de compra por e-mail a um fornecedor que não tem e-mail.

Proposta: enriquecer `fornecedores` com email, telefone, endereço, condição de pagamento padrão e
observação — aditivo, sem tocar em nada existente. A fusão fica registrada como opção, com o custo
declarado, para o dono decidir se algum dia vale.

**Isto é a única coisa nesta análise que eu não decido sozinho.** Todo o resto de §4.1 e §4.2 sai
das auditorias e do próprio código.

---

## 6. Efeito no plano da sprint

A Onda 1 (os P0 de ontem) **não muda** — os documentos a confirmam item por item:
o kebab de 3 pontos (A-1), as seis situações de título (A-4), a simetria Pagar/Receber
(*"layout idêntico … confirma a simetria"*, §13) e a baixa como ação de linha.

O que os documentos **acrescentam** à Onda 2, por ordem de valor sobre risco:

1. **A-9** — formas de pagamento via tabela (mata o enum cru do AR-3 de quebra)
2. **A-8** — aba Fornecedores do produto (tabela já existe; resolve SSOT de `fornecedor_id`)
3. **A-7** — Ficha Financeira por contato (zero migration)
4. **A-3 + A-5 + A-6** — Salvar-e-baixar, baixa em massa, recibo de baixa
5. **A-10 + A-11** — filtro padrão útil e "alterado em/por" (duas linhas de código, ganho diário)
6. **B-1** — custo no ajuste positivo de estoque (**defeito de custo médio, não paridade**)
7. **B-7** — checklist de configuração do cliente reusando `implantacao_checklists`

E **B-3 (parcelamento)** deixa de ser "fora de escopo" e vira proposta formal com gabarito: o Bling
faz nº de parcelas *ou* dias `30/60/90` → "Gerar parcelas", com cada parcela editável em dias,
data, valor, forma e observação. Continua exigindo migration e decisão — mas agora está desenhado.

---

## 7. Adendo — PDV do Bling (foto da tela real, 2026-09-11)

As três rodadas de auditoria **nunca conseguiram abrir o PDV** (`pdv.php` → "Este usuário não
possui acesso ao módulo!", plano/trial expirado). A foto da tela "Venda - Pedido 146" é, portanto,
a **primeira evidência direta** do Frente de Caixa — e fecha o único buraco grande do benchmark.

### O que a tela mostra

**Cabeçalho e navegação.** Título "Venda - Pedido 146" (o número do pedido é a identidade da
venda em curso). Canto direito: buscar venda, `Nova venda (Alt+N)`, e um trilho vertical à direita
com o pedido aberto e um contador — **vendas paralelas em abas**.

**Três abas:** `Produto (Alt+Z)` · `Cliente (Alt+C)` · `Adicionais (Alt+P)`.

**Painel de produto:** seletor `Lista de preço` ("Nenhuma lista") · toggle
`Leitor de código de barras: Desativado` · busca "por código, descrição ou GTIN" ·
`Pesquisa avançada (Alt+A)` · `Ver favoritos (Alt+G)` · prévia da imagem do produto · preço grande
· `Quantidade` com stepper · `Desconto` com botão de limpar (×) · `Valor unitário` editável ·
`Subtotal` · `Comentário` (texto livre por item) · botão `Inserir`.

**Carrinho:** colunas `Produto | Qtde (6,00) | Preço | Sub Total | Ações` — **o cabeçalho da
coluna carrega o total** — cada linha com data/hora da inserção e ícones de editar/excluir.
`Total 56,00` no rodapé.

**Saídas sempre visíveis:** `Excluir venda (Alt+Q)` e `Finalizar venda (Alt+E)`.

### O achado central: **o atalho está escrito no próprio rótulo**

Oito atalhos aparecem grudados no texto do botão — `(Alt+Z)`, `(Alt+C)`, `(Alt+P)`, `(Alt+A)`,
`(Alt+G)`, `(Alt+N)`, `(Alt+Q)`, `(Alt+E)`. O operador aprende o teclado **usando o mouse**, sem
manual e sem abrir tela de ajuda.

O Jinlong **já tem o mesmo modelo mental de abas** — `Alt+Z` produto, `Alt+C` cliente, `Alt+B`
pagamento (`useCaixaKeyboardShortcuts.ts`) — e um conjunto maior de teclas (`F1` referência,
`F2`/`Ctrl+B` busca, `F3` consulta rápida, `F4`/`F9` finalizar, `F6`, `F8` novo cupom, `F12`
reimprimir). Mas eles vivem quase todos **escondidos atrás do F1**: no dicionário, só
`reimprimir_cupom` ("Reimprimir (F12)") e uma dica de rodapé trazem a tecla no rótulo.

**Adotar (A-14, P1, custo UI):** levar a tecla para o rótulo das ações principais do PDV, como o
Bling faz. É i18n puro mais alguns rótulos — nenhuma regra tocada, e ataca direto a "redução de
cliques" e a "previsibilidade operacional" da sprint.

### Onde o Jinlong já é melhor — não regredir

| | Bling (foto) | Jinlong |
|---|---|---|
| Tipo de preço na linha | Só uma coluna `Preço` | `TipoPrecoBadge` por item: varejo/atacado **com a quantidade mínima da faixa** |
| Desconto no item | Campo livre no painel | Desconto discricionário com token de autorização de gerente (`tokens_desconto_gerente`) |
| Vendas paralelas | Trilho de pedidos | `vendas_em_espera` com rótulo e número local, recuperável |
| Reimpressão | não observada | `F12` + histórico de caixa |

### Adotar do PDV — classificado

| # | Achado | Decisão | Custo |
|---|---|---|---|
| A-14 | **Atalho no rótulo do botão** | **Adotar** — maior retorno da tela inteira | UI (i18n) |
| A-15 | **Agregado no cabeçalho da coluna** (`Qtde (6,00)`) | **Adotar** — confere o cupom sem somar de cabeça | UI |
| A-16 | **Botão de limpar (×) no campo de desconto** | **Adotar** — hoje corrigir um desconto exige apagar dígito a dígito | UI |
| B-9 | **Comentário por item** | **Adaptar/adiar** — `itens_venda` **não tem** coluna de observação; é migration em tabela de venda, fora de "só UI" | DB |
| B-10 | **Favoritos de produto** (`Alt+G`) | **Adiar** — precisa de modelo de favorito por loja/operador; útil para importador com giro concentrado | DB |
| B-11 | **Lista de preço por venda** | **Adiar** — o Jinlong resolve por faixa de atacado automática, não por lista escolhida na venda. Mudar isso é decisão de precificação | DB |
| — | **Preço unitário editável no PDV** | **Não adotar** | — |
| — | **Toggle "leitor de código de barras"** | **Não adotar** — o Jinlong tem `scan-pipeline` que detecta a leitura; um interruptor manual seria um passo a mais para o mesmo resultado | — |

> **Por que não o preço unitário editável:** no Bling o operador digita qualquer preço no item. No
> Jinlong o preço vem do motor de preços e um desvio exige token de gerente
> (`tokens_desconto_gerente`, `descontos_venda`). Copiar o campo livre derrubaria um controle de
> perda deliberado — exatamente o tipo de limitação que a sprint mandou **não** copiar.
