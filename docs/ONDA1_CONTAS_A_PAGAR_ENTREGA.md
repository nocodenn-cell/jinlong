# Onda 1 · Item 3 — Contas a Pagar · entrega

**Data:** 2026-09-11
**Escopo:** a experiência operacional de Contas a Pagar (decisão 3 do dono — prioridade alta).
**Migrations:** **nenhuma.** Tudo em UI, server action e política pura no `shared-core`.
**Invariantes tocadas:** nenhuma. Nenhuma RPC foi alterada; duas passaram a ter caminho de UI.

---

## 1. O que foi observado no Bling

Da auditoria em conta real e da ajuda oficial:

- **Seis situações** derivadas de saldo × vencimento: `Em aberto` · `Vencendo hoje` · `Atrasada` ·
  `Paga` · `Paga parcialmente, mas em dia` · `Paga parcialmente, porém atrasada`.
- **Ação de linha no menu de três pontos**, com `Baixa total` / `Baixa parcial`.
- **Baixa e estorno como operação de primeira classe**, não como tarefa de suporte.
- Lista com **filtro por situação, período e fornecedor**, exportação e ações em massa.

## 2. O que já existia no Jinlong

Mais do que o mapa de gaps registrava:

| Já existia | Onde |
|---|---|
| Pagamento **parcial** com saldo (`valor_pago` × `valor_total`) | RPC `registrar_pagamento_contas_pagar` |
| Ledger append-only de pagamentos | tabela `contas_pagar_pagamentos` (com `operacao_tipo`, `operacao_origem_id`) |
| **Estorno de pagamento** transacional | RPC `estornar_pagamento_contas_pagar` |
| Cancelamento que estorna os pagamentos junto | RPC `cancelar_conta_pagar` |
| Cálculo de "vencido" na leitura, sem persistir | `isTituloVencido` (item 13 do Plano Mestre) |
| Filtros, exportação CSV, KPIs, origem NF-e na linha | `ContasPagarListClient` |

## 3. O que faltava

1. **A situação da linha ignorava o vencimento.** O selo mostrava o status contábil cru
   (`PENDENTE`/`PARCIAL`/`PAGO`). Um título vencido ontem e um que vence em 30 dias ficavam
   visualmente idênticos.
2. **O saldo pendente não era o número dominante.** A linha destacava o valor **original**; o que
   ainda se deve aparecia em legenda secundária — e só quando havia algum pagamento.
3. **Histórico do título não tinha tela.** A tabela existia; ver os pagamentos exigia SQL.
4. **Estorno não tinha tela.** A RPC existia; corrigir um pagamento errado exigia SQL.
5. **Motivo de cancelamento vinha de `window.prompt`** — sem i18n, sem validação visível, sem
   declarar que o cancelamento estorna os pagamentos.
6. **Cinco gestos diferentes de ação de linha** no produto; nenhum era o dos três pontos.

## 4. O que foi implementado

### Núcleo — `shared-core` (política pura, sem I/O)

`src/financial/policies/situacaoTitulo.ts` — as seis situações do Bling mais `CANCELADO`,
derivadas de saldo × vencimento. Serve **AP e AR**, para que a simetria da Onda 1 item 2 não
precise reimplementar a regra. Mais `saldoTitulo`, `situacaoEmAberto`, `situacaoAtrasada`.

Comparação de datas por string `YYYY-MM-DD`, não por `Date` — comparar como `Date` reintroduziria
o bug de fuso já corrigido nesta frente.

### Contratos

`PayableReader.listPagamentos` e `PayablePaymentService.reverse` — espelhando exatamente o que o
lado a receber já tinha (`listLiquidacoes` / `reverse`).

### Adapters

`payableReader.listPagamentos` (lê `contas_pagar_pagamentos`, 50 linhas, mais recente primeiro) e
`payablePayment.reverse` (chama a RPC existente e devolve `status`/`valorPago` que a própria
transação já retorna, evitando um re-fetch).

### Server actions

`listarPagamentosContaPagarAction` e `estornarPagamentoContaPagarAction`, com as mesmas guardas
do lado AR: sessão, motivo obrigatório, chave de idempotência.

### Componentes compartilhados (base do TR-1)

| Componente | Papel |
|---|---|
| `RowActionsMenu` | O gesto de três pontos, genérico. Ação indisponível fica **visível e explicada**, não some. Substitui o `VendaActionsMenu` órfão. |
| `SituacaoTituloBadge` | Selo das sete situações; só escolhe tom e rótulo — a regra vive no `shared-core`. |
| `MotivoOperacaoModal` | Captura de motivo com `ConsequenciaOperacao` embutida. Substitui `window.prompt`. |

### Tela

- **Coluna "Em aberto"** reescrita: o saldo é o número dominante, com o original e o pago abaixo,
  e barra de progresso. Título quitado mostra **"Quitada"** em vez de "R$ 0,00 pendente".
- **Selo de situação** derivado, com tom por urgência.
- **Menu de três pontos** com `Registrar pagamento` · `Histórico de pagamentos` ·
  `Abrir NF-e de origem` (quando há) · `Cancelar conta`.
- **`HistoricoPagamentosModal`**: saldo no topo, ledger com estornos riscados, botão de estornar
  por pagamento (desabilitado quando já estornado), e o modal de motivo com os três efeitos.
- **KPIs** passam a sair da situação derivada, não do status cru.
- **45 chaves novas em pt e zh**, paridade mantida.

### Regra de loja preservada

`registrar_pagamento_contas_pagar` recusa pagamento entre lojas. Antes a linha escondia a ação;
agora ela aparece **desabilitada com o motivo no `title`** — e o **histórico continua acessível**,
porque ler não é escrever.

---

## 5. Defeitos encontrados **durante** a implementação

Três, todos corrigidos. Dois só apareceram no QA ao vivo — nenhum teste os teria pego.

| # | Defeito | Causa | Como apareceu |
|---|---|---|---|
| 1 | **Um título que vence HOJE exibia "ontem"** ao lado do selo "Vence hoje" | `relativoVenc` media de `Date.now()` até a meia-noite do vencimento: às 12h, hoje virava −0,5 dia → arredondava para −1. Errava até um dia em **todas** as linhas ("há 7 dias" para 6 dias) | QA ao vivo com dado real |
| 2 | **Menu de ações transparente** — a linha de trás vazava através dele | `bg-[var(--color-surface-elevated)]`: token que **não existe** no design system. Trocado por `admin-v2-panel`, a superfície elevada real | QA visual |
| 3 | **O número dominante perdia o tamanho da fonte** | `cn()` (tailwind-merge) trata `text-body` e `text-fg` como o mesmo grupo `text-*` e descarta o primeiro. A tipografia saiu do `cn` e só a cor varia | Teste de comportamento |

> Sobre o #3: varri o projeto — o padrão aparece em 3 lugares e **em nenhum outro** combina
> tamanho com cor na mesma chamada. Era só o meu.

---

## 6. Testes e QA

### Automatizado

| Suíte | Resultado |
|---|---|
| `situacaoTitulo.spec.ts` (novo) | **20 asserções, 0 falhas** — as seis situações, bordas de centavo, timestamp com hora, status legado `ATRASADO`, AR com `ABERTO`/`PARCIAL` |
| `RowActionsMenu.behavior.test.tsx` (novo) | **10 testes** — abertura, `aria-expanded`, href interno × externo, ação desabilitada que permanece visível, separador do destrutivo, Escape, menu vazio |
| `ContasPagarListClient.behavior.test.tsx` (novo) | **14 testes** — inclui o requisito literal: 5.000 / 2.000 / **3.000 pendente**, o saldo como número dominante, quitado sem "R$ 0,00 pendente", as situações, o menu por estado do título, conta de outra loja, e a ausência de `window.prompt` |
| `tsc --noEmit` · ESLint (`app`,`components`,`lib`) | OK |
| `guard:routes` | OK — 28 rotas `/admin` com página |
| `check:entity-ssot` | OK (1 aviso legado pré-existente) |
| Paridade i18n pt × zh | **0 assimetrias**, 2.924 chaves de cada lado |
| **Suíte completa `pdv-importados`** | **1.352 passando · 4 falhando em 2 arquivos** — ambos os arquivos são as falhas **pré-existentes e ambientais** já registradas em `FECHAMENTO_*.md` §9: `productUpdater.semRpc.integracao.test.ts` (*"insert produto: No suitable key or wrong key type"*, o erro literal daquele documento) e `produtosFiscalEdicao.integration.test.ts` (*"TypeError: fetch failed"*). São testes de integração de produto/fiscal que exigem credenciais do projeto remoto enquanto o stack local está no ar. **Nenhum importa qualquer módulo tocado nesta entrega**, e as falhas são de setup de rede/credencial, não de asserção. |

### QA operacional ao vivo

Stack Supabase local, app apontado para ele, autenticado como DONO. Massa criada cobrindo as
cinco situações (o banco estava só com seed depois do `db reset`).

Fluxo verificado ponta a ponta:

1. Lista com as cinco situações corretas: `Parcial · atrasada`, `Atrasada`, `Vence hoje`,
   `Paga em parte`, `Paga`.
2. **O requisito do dono na tela:** `R$ 3.000,00 pendente` · `de R$ 5.000,00 · pago R$ 2.000,00`.
3. Menu de três pontos com as três ações, sobre fundo opaco.
4. Histórico abre com saldo, situação e o pagamento de R$ 2.000 em PIX com a observação.
5. **Estorno completo:** motivo → confirmação → título volta a `Em aberto` com
   `R$ 5.000,00 pendente`, a lista atualiza **sem refetch**, e o ledger no banco fica
   `PAGAMENTO 2000` + `ESTORNO 2000 origem=<id do pagamento>` — append-only, nada apagado.
6. Reaplicado o pagamento para devolver a massa ao estado do exemplo.

| Medição | Desktop 1280 | Mobile 375 |
|---|---|---|
| Overflow horizontal da página | **0 px** | **0 px** |
| Erros de console | **0** | **0** |

---

## 7. Riscos

| Risco | Situação |
|---|---|
| Estorno é escrita financeira | A RPC **não** foi alterada — ela já existia, testada, com idempotência. Só ganhou porta. A chave é determinística por pagamento (`estorno-ap:<id>`), então retry não gera segundo estorno. |
| Situação derivada divergir do status do banco | A política trata o status como autoridade para `CANCELADO`/`PAGO` e só resolve a granularidade do "em aberto". Saldo zerado com status em aberto é exibido como quitado — decisão documentada no código. |
| Regressão em Contas a Receber | Nada de AR foi tocado nesta entrega. A política já nasce servindo os dois lados para o item 2. |
| Diff de i18n | Ao adicionar as chaves, a reserialização do JSON reformatou objetos inline. **Revertido**: a formatação original foi restaurada e conferida chave a chave — 0 perdidas. Dois pares de **chaves duplicadas** pré-existentes (`preco_custo`, `pdv_pgto_valor_recebido`) foram deduplicados mantendo o último valor, que é exatamente o que o `JSON.parse` do runtime já fazia. |
| Senha local em fixture | Para o QA foi definida uma senha para `dono.seed@local.test` **no stack local**, que é descartável e já foi reconstruído por `db reset`. Nada remoto foi tocado. |

---

## 8. Gaps restantes

### Da Onda 1 — ainda não feitos

| Item | Estado |
|---|---|
| **2 — Contas a Receber** | **Não iniciado.** É o próximo: refundar sobre o mesmo shell, matando o `slice(0, 8)` que impede baixar o 9º título, a lista duplicada e o enum cru `CARTAO_DEBITO`. A política de situação e os três componentes já estão prontos para isso. |
| **5 — Compras** | **Não iniciado.** Filtros na URL, detalhe endereçável, ações de linha, vencimento na lista. |
| **1 — kebab nas demais listas** | **Parcial.** O componente existe e está em uso em AP. Falta aplicar em Vendas (com a reimpressão de cupom que sumiu do Admin), Estoque e Compras. |
| **4 — `window.prompt`** | **Parcial.** O de AP saiu. Resta o de AR (`FinanceiroReceberExtras.tsx:65`), que cai junto com o item 2. |

### De Contas a Pagar — deliberadamente fora desta entrega

- **Baixa em massa** (A-5) — "Baixar selecionados" do Bling. Onda 2.
- **Recibo de pagamento imprimível** (A-6). Onda 2.
- **Lançamento manual de conta** (P1-5) — exige `categoria_id` e `criado_por`; é escrita financeira
  nova, congelada por decisão anterior.
- **Origem "Ordem de compra" como link tipado** — hoje a origem está no texto da descrição
  (`Ordem de compra 50467B28`, escrito pela própria RPC) e a NF-e tem atalho. O link para a OC
  espera o **CO-2** (detalhe de compra endereçável); fazer agora levaria a uma lista filtrada, não
  ao registro.
- **Filtro por categoria financeira / valor / nº documento** e **colunas customizáveis** — P2.

### Observação de mobile

A tabela rola horizontalmente dentro do próprio container (página com 0 px de overflow), então o
menu de ações exige rolar para a direita em 375 px. É o comportamento pré-existente do `DataTable`
e vale para todas as listas — não é regressão desta entrega, mas é candidato real da Onda 3.
