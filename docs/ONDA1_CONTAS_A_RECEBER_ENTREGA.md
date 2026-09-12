# Onda 1 · Item 2 — Contas a Receber · entrega

**Data:** 2026-09-11
**Escopo:** a experiência operacional de Contas a Receber, em paridade com o que foi entregue em
Contas a Pagar.
**Migrations:** **nenhuma.** UI, server action, adapter de leitura e política pura no `shared-core`.
**Invariantes tocadas:** nenhuma. `registrar_liquidacao_receber` e `estornar_liquidacao_receber`
não foram alteradas — ganharam (ou recuperaram) caminho de UI.
**Regras de crédito:** intocadas. `clientes.limite_credito` e a autorização de gerente no PDV
seguem exatamente como estavam.

---

## 1. O que foi observado no Bling

- **Contas a receber é o espelho de Contas a pagar** — mesma tela, mesmos filtros, mesmo botão
  "Incluir conta" (`[FATO]`, §13 da auditoria: *"layout idêntico … confirma a simetria"*).
- **Baixa total e baixa parcial** no menu de três pontos da linha.
- **Situações derivadas de saldo × vencimento**, não o status contábil cru.
- Filtro por situação incluindo **as já pagas** — o que foi recebido não some da tela.

## 2. O que já existia no Jinlong

| Já existia | Onde |
|---|---|
| Liquidação **parcial** com saldo (`valor_aberto`) | RPC `registrar_liquidacao_receber` |
| Ledger append-only de liquidações | `liquidacoes_receber` (com `operacao_tipo`, `operacao_origem_id`) |
| **Estorno** de liquidação | RPC `estornar_liquidacao_receber` |
| Regra de caixa: dinheiro exige caixa aberto; caixa só para dinheiro | mesma RPC |
| Recusa de liquidação entre lojas, para **todos** os perfis | mesma RPC (P0-4) |
| Criação manual de título, com a loja derivada do **cliente** | `criarTituloReceber` |
| Histórico de liquidações e estorno | `listarLiquidacoesReceber` / `estornarLiquidacaoReceber` |
| Filtros na **URL** (busca, cliente, período, situação) | `financeiroTitulosServer` |

> A URL já guardava o filtro — melhor que Contas a Pagar, que usa estado local. **Isso foi
> preservado**: a paridade adotada é a da LINHA e das AÇÕES, não a da mecânica de filtro.

## 3. O que faltava

1. **O 9º título em aberto não podia ser recebido.** A liquidação vivia num painel separado abaixo
   da tabela, sobre `abertas.slice(0, 8)`.
2. **Lista duplicada.** Uma tabela somente-leitura em cima, outra lista com formulários embaixo.
3. **Enum cru na tela:** `DINHEIRO`, `CARTAO_DEBITO`, `CARTAO_CREDITO` — e fora do i18n, então
   apareciam em português-de-banco também na interface em chinês.
4. **Situação de dois estados.** O selo só distinguia `ABERTO` de "não aberto"; vencimento não
   entrava na conta.
5. **Recebimento integral desaparecia.** A listagem só sabia pedir `ABERTO`/`PARCIAL`: título
   `QUITADO` ou `CANCELADO` não tinha filtro que o trouxesse de volta.
6. **Origem do título invisível.** `contas_receber.venda_id` existe e não era nem lido.
7. **`window.prompt`** para o motivo do estorno.
8. **Sem observação no recebimento.** A RPC aceita `p_observacao`; a UI mandava `null`.
9. **Ordenação por data de criação**, não por vencimento.

## 4. O que foi implementado

### Núcleo

- `ReceivableOpcao` no `shared-core`: `mix` (padrão, o que pede ação) · `ABERTO` · `PARCIAL` ·
  `atrasado` · `QUITADO` · `CANCELADO` · `todos`. `atrasado` é computado (vencimento < hoje sobre
  status em aberto), nunca persistido — mesma regra do item 13 do Plano Mestre.
- `ReceivableTitle.vendaId` — origem do título.
- A política `situacaoTitulo`, criada no item 3, passou a servir **os dois lados** sem alteração.

### Leitura

- `receivableReader` lê `venda_id`, entende as sete opções e **ordena por vencimento**
  (`nullsFirst: false`), como Contas a Pagar. Ordenar por criação misturava o que vence amanhã
  com o que vence em dois meses — numa lista de cobrança, o prazo é que manda.

### Ação

- `liquidarTitulo` passou a repassar `observacao` (a RPC já aceitava).

### Tela — uma lista só

| Antes | Agora |
|---|---|
| Tabela somente-leitura + painel com 8 formulários | **Uma** lista, ações no menu de três pontos |
| `total · pago · aberto` em colunas iguais | **Saldo dominante** + `de R$ X · recebido R$ Y` + barra |
| Pill de 2 estados | **7 situações** derivadas, com tom por urgência |
| `CARTAO_DEBITO` | **Cartão de débito** (pt) / **借记卡** (zh) |
| Formulário inline por linha | `ReceberTituloModal` com total/recebido/em aberto, valores sugeridos, forma, caixa e observação |
| "Histórico" expandindo na linha | `HistoricoRecebimentosModal` com ledger e estorno |
| `window.prompt` | `MotivoOperacaoModal` com as três consequências declaradas |
| "Novo título" sempre aberto no rodapé | Ação de cabeçalho (`NovoTituloReceberModal`) |
| — | **`Venda ABCDEF12`** ou **`Lançamento manual`** em cada linha, com atalho para a venda |

- **89 chaves novas** em `contas_receber`, pt e zh.
- `FinanceiroReceberExtras.tsx` **removido** — virou código morto e continha o último
  `window.prompt` do app.

### Venda endereçável (pré-requisito da origem)

Não existia caminho para UMA venda: o detalhe abria só por clique na lista. Um atalho "abrir venda
de origem" que só chega na lista não é origem, é decoração. Foram acrescentados
`?venda=<uuid>` em `/admin/vendas` (validado como UUID) e `hrefVendaDetalhe()` no SSOT de rotas.

### Diferenças deliberadas em relação a Contas a Pagar

| Assunto | AP | AR | Por quê |
|---|---|---|---|
| Autorização de gerente por valor | Exige senha acima do limite | **Não exige** | No AP, pagar em dinheiro é uma **sangria** (dinheiro sai). No AR o dinheiro **entra**; a RPC não pede autorização e inventar uma seria criar regra de crédito nova. |
| Data do pagamento | Campo editável | **Não existe** | `registrar_liquidacao_receber` carimba com `now()` e não aceita data. Oferecer o campo prometeria o que o banco não cumpre. |
| Cancelar título | Existe | **Não existe** | Não há RPC de cancelamento para AR. Não improvisei um `UPDATE` de status. |
| Filtro | Estado local | **URL** (preservado) | A URL guarda o contexto; seria regressão trocar. |

---

## 5. Defeitos encontrados **durante** a implementação

| # | Defeito | Causa | Como apareceu |
|---|---|---|---|
| 1 | **"Histórico de títulos (somente leitura)"** no cabeçalho de uma lista que recebe dinheiro | Rótulo nunca atualizado depois que a liquidação entrou na tela | QA ao vivo |
| 2 | **Lista ordenada por data de criação** | `order('created_at')` herdado; AP já ordenava por vencimento | QA ao vivo — a lista abria com R$ 530 antes de um vencido de 15 dias |
| 3 | **Cabeçalho do histórico com saldo velho depois do estorno** | O modal guardava a linha como objeto; `router.refresh()` atualizava a lista, não o objeto retido | QA ao vivo |

O #3 foi corrigido mudando o estado para **ID**: a linha é derivada de `contas` a cada render, então
modal e lista não podem divergir.

---

## 6. Testes e QA

### Automatizado

| Suíte | Resultado |
|---|---|
| `ContasReceberTable.behavior.test.tsx` (novo) | **15 testes** — abre com o guarda de regressão do `slice(0, 8)`: **12 títulos, 12 menus**, e os de índice 9, 10 e 12 oferecendo "Registrar recebimento" |
| Demais suítes de financeiro, admin-v2 e `shared-core` | **119 testes, 0 falhas** (19 arquivos) |
| `tsc --noEmit` · ESLint (`app`, `components`, `lib`) | OK |
| `guard:routes` | OK — 28 rotas `/admin` com página |
| `check:entity-ssot` | OK |
| Paridade i18n pt × zh | **0 assimetrias**, 3.013 chaves de cada lado |

O teste cobre ainda: saldo dominante (5.000 / 2.000 / **3.000 a receber**), "Recebida" no lugar de
"R$ 0,00 a receber", as situações derivadas, origem de venda × manual com o link contendo
`venda=<id>`, ações por estado do título, e título de outra loja com ação desabilitada mas
histórico acessível.

### QA operacional ao vivo

Stack local, autenticado como DONO, 14 títulos semeados (13 em aberto — mais que os 8 do limite
antigo).

1. Lista abre pelo **mais vencido** (27/08, há 15 dias), não pelo mais recente.
2. **13 linhas, 13 menus de ação** — o limite artificial não existe mais.
3. Situações corretas: `Parcial · vencida`, `Vencida`, `Vence hoje`, `Recebida em parte`,
   `Em aberto`; datas relativas certas (`HOJE`, `HÁ 6 DIAS`, `EM 20 DIAS`).
4. Espelho do exemplo do AP: **`R$ 3.000,00 a receber · de R$ 5.000,00 · recebido R$ 2.000,00`**.
5. Filtro **"Recebidas"** traz o título quitado — antes invisível — exibindo `Recebida`.
6. Recebimento parcial de R$ 1.000: modal com os três tiles, `Restará R$ 2.000,00 em aberto`,
   formas em português; após confirmar, a linha vira `R$ 2.000,00 a receber · recebido R$ 3.000,00`.
7. Histórico lista os dois recebimentos; **estorno** com motivo → ledger no banco fica
   `RECEBIMENTO 2000` · `RECEBIMENTO 1000` · `ESTORNO 1000` · `ESTORNO 2000`, cada estorno
   apontando para a origem. Nada apagado.
8. Recebimento já estornado tem o botão **desabilitado** com `title="Recebimento já estornado."`.
9. Modal e lista voltam juntos para `R$ 5.000,00 a receber · Em aberto`.
10. Massa restaurada ao estado do exemplo.

| Medição | Desktop | Mobile 375 |
|---|---|---|
| Overflow horizontal da página | **0 px** | **0 px** |
| Erros de console atribuíveis a esta entrega | **0** | **0** |

---

## 7. Riscos

| Risco | Situação |
|---|---|
| Estorno é escrita financeira | A RPC não mudou. Chave determinística por liquidação (`estorno-ar:<id>`) — retry não gera segundo estorno. |
| Perder a guarda de caixa do dinheiro | O modal só oferece caixas **da loja do título** e exige escolha quando há mais de um; a RPC continua sendo a autoridade. |
| Perder a recusa cross-loja | Preservada. A ação aparece desabilitada com o motivo, e o histórico segue legível. |
| Filtro novo trazer volume | O padrão continua `mix`. `todos`/`QUITADO` são escolha explícita, e o `limite` (50–500) não mudou. |
| Remoção de `FinanceiroReceberExtras` | Verificado sem importadores antes de apagar; as três funções dele (liquidar, histórico, novo título) foram para modais com cobertura de teste. |

---

## 8. Achado aberto — **não** introduzido por esta entrega

Aviso de desenvolvimento do React: *"Each child in a list should have a unique key prop — check the
render method of `FinanceiroContent`"*. Bissectei: some quando se deixa de renderizar **apenas o
`kpiSection`**, que é criado no Server Component e passado como `ReactNode` — código que esta
entrega não tocou. É dev-only, sem efeito para o usuário. **Não corrigi** porque a correção mexe em
como a página entrega as seções ao componente cliente — refatoração estrutural por questão
cosmética, exatamente o que a sprint proíbe. Fica registrado para a Onda 3.

---

## 9. Gaps restantes

### Da Onda 1

| Item | Estado |
|---|---|
| **5 — Compras** | **Não iniciado.** Próximo: filtros na URL, detalhe endereçável, ações de linha, vencimento na lista. |
| **1 — kebab nas demais listas** | **Parcial.** Em uso em AP e AR. Falta Vendas (com a reimpressão de cupom que sumiu do Admin), Estoque e Compras. |
| **4 — `window.prompt`** | **Concluído.** Não resta nenhum no app. |

### De Contas a Receber — fora desta entrega, por decisão

- **Baixa em massa** ("Baixar selecionados", recebimento agrupado) — Onda 2.
- **Recibo de recebimento imprimível** — Onda 2, junto com o do AP.
- **Cancelar título a receber** — não existe RPC; criar uma é escrita financeira nova.
- **Exportar CSV de AR** — AP tem; entra na Onda 2 junto com TR-4.
- **Ficha Financeira por contato** (A-7) — Onda 2; agora com AP e AR falando a mesma língua, é
  quase só composição.
