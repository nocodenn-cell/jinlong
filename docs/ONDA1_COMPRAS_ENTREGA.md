# Onda 1 · Item 5 — Compras · entrega

**Data:** 2026-09-11 · **QA final:** 2026-09-12
**Escopo:** experiência operacional de Ordens de Compra, com as regras de entrada já existentes
tornadas visíveis e acionáveis.
**Migrations:** **nenhuma.** UI, leitura e server action.
**RPC alterada:** **nenhuma.** `registrar_conferencia_ordem_compra`, `receber_ordem_compra` e
`vincular_importacao_nfe_ordem_compra` não foram tocadas.

> **Item 5 concluído.** O ciclo completo — conferência → recebimento → crédito de estoque → título
> em Contas a Pagar — foi executado pela interface, com o efeito conferido no banco a cada passo
> (§7). O QA dessa etapa ficou pendente na primeira passagem por um incidente de ambiente (§9) e
> foi fechado depois.

---

## 1. O que foi observado no Bling

- Compra vive **dentro de Estoque** (`Estoque > Pedido de Compra`) — o Jinlong já segue isso.
- **Vínculo NF-e ↔ pedido de compra** é explícito, com *situações de vínculo* nomeadas e ação de
  remover — e a nota é quem credita quando existe.
- Ações na linha pelo menu de três pontos.
- O pedido mostra o prazo de pagamento, porque é ele que gera o financeiro.

## 2. O que já existia no Jinlong — e continua intacto

As quatro primeiras prioridades desta tarefa **já estavam implementadas no banco** pela frente de
entrada. Esta passagem não as reimplementou; conferiu que seguem valendo e as trouxe para a tela.

| Prioridade | Onde já vivia | Situação |
|---|---|---|
| 1 · Recebimento gera Contas a Pagar | `receber_ordem_compra` (migration `20260911130000`) | Intacta. Valor = `quantidade_conferida × preço`; só nasce com fornecedor **e** prazo. |
| 2 · Vínculo OC ↔ NF-e | `importacoes_nfe.ordem_compra_id` + `vincular_importacao_nfe_ordem_compra` (`20260911140000`) | Intacta. |
| 3 · Proteção contra duplo crédito | `IMPORT_NFE_OC_JA_RECEBIDA` e `OC_NFE_JA_CREDITADA`, mais índice único | Intacta. |
| 4 · Conferência física obrigatória | `registrar_conferencia_ordem_compra` antes do crédito | Intacta — a ação de linha **leva ao detalhe** em vez de receber por atalho, justamente para não pular a conferência. |

Também já existiam e foram preservados: transições de status com validação
(`STATUS_TRANSITIONS`), `ConsequenciaOperacao` no detalhe declarando o efeito antes do submit, e o
hub de Estoque no topo da tela.

## 3. O que faltava

1. **O vínculo com a NF-e não aparecia em lugar nenhum de Compras.** O operador só descobria a nota
   ao clicar em Receber e tomar `OC_NFE_JA_CREDITADA` como erro cru de banco.
2. **O título gerado não aparecia.** `contas_pagar.ordem_compra_id` existia e não era lido.
3. **Vencimento fora da lista** — o campo que decide se nasce obrigação financeira só existia no
   detalhe.
4. **Sem ações de linha.** Só clicar e descobrir dentro do modal.
5. **Contexto fora da URL.** Situação, busca, página e a ordem aberta eram estado local: voltar,
   recarregar ou compartilhar o link perdia tudo, e não havia como apontar para UMA ordem.
6. **KPIs congelados.** Vêm do servidor e nada os atualizava depois de um recebimento; além disso
   as actions revalidavam **só `/gerente/compras`**, que é rota legada de redirect — a rota viva é
   `/admin/compras`.
7. **Cancelar sem consequência declarada** — confirmação inline genérica.
8. **Campo de quantidade conferida sem rótulo acessível.**

## 4. O que foi implementado

### Leitura (sem migration)

`OC_SELECT` e `OC_DETALHE_SELECT` passaram a embutir, pelas FKs que já existiam:

```
nfe:importacoes_nfe!importacoes_nfe_ordem_compra_id_fkey(id, numero_nf, status)
titulo:contas_pagar!contas_pagar_ordem_compra_id_fkey(id, status, valor_total)
```

`OcListaDTO` ganhou `nfe_id`, `nfe_numero`, `nfe_status`, `titulo_id`, `titulo_status`,
`titulo_valor`.

### Tela

- **Coluna Vencimento**, com `sem prazo` em itálico quando a ordem não tem prazo — porque essa
  ausência é justamente o que impede o título de nascer.
- **Coluna Vínculo**, mostrando `NF-e #23577` e/ou `Conta a pagar · R$ 600,00`.
- **Menu de três pontos** por linha, variando com a situação: abrir detalhe · confirmar ·
  marcar em trânsito · conferir e receber · editar · abrir NF-e vinculada · abrir conta a pagar ·
  cancelar.
- **Guarda de dupla entrada explicada antes do clique**: com a nota vinculada já `CONCLUIDA`, a
  ação *Conferir e receber* fica **desabilitada** com o motivo no `title`, e o detalhe exibe um
  aviso dizendo que receber de novo lançaria a mesma mercadoria duas vezes.
- **`CancelarOcModal`** com as três consequências declaradas. **Sem campo de motivo**: a tabela
  `ordens_compra` não tem coluna para guardá-lo, e um textarea descartado no submit seria pior que
  nenhum.
- **Contexto na URL**: `?status=`, `?q=` (com debounce, para não poluir o histórico), `?page=` e
  `?oc=<uuid>`.
- **KPIs atualizam** após qualquer mutação (`router.refresh()`), e as actions passaram a revalidar
  também `/admin/compras`, `/admin/estoque` e `/admin/financeiro`.
- **`aria-label`** no campo de quantidade conferida, com o nome do produto.
- **33 chaves novas** de i18n em pt e zh.

### Fora de Compras, porque o item exigia

Uma única saída de escopo, necessária para o requisito 5 do item anterior: o atalho "abrir venda de
origem" de Contas a Receber precisava de destino. `/admin/vendas` ganhou `?venda=<uuid>` e o SSOT
ganhou `hrefVendaDetalhe()`. Já estava entregue no item 2 e é citada aqui por completude.

---

## 5. Defeitos encontrados durante a implementação

| # | Defeito | Correção |
|---|---|---|
| 1 | Actions de Compras revalidavam só a rota legada `/gerente/compras`; a lista viva (`/admin/compras`) e seus KPIs nunca eram invalidados | Revalidação das rotas reais + `router.refresh()` após mutação |
| 2 | Com a NF-e já confirmada, o detalhe exibia o bloco *"o que acontece ao registrar o recebimento"* logo abaixo do aviso dizendo que o recebimento está bloqueado — a tela se contradizia | O bloco de consequência só aparece quando a ação existe |
| 3 | Campo de quantidade conferida sem rótulo acessível | `aria-label` com o nome do produto |
| 4 | **Achado no QA final.** O modal de cancelamento prometia: *"O cancelamento fica registrado com o seu usuário e o motivo informado"* — mas não há campo de motivo, nem coluna para guardá-lo, e `atualizarStatusOC` só troca o status. A frase veio copiada de Contas a Pagar, onde ela **é** verdadeira (lá o motivo é obrigatório e vai gravado). Em Compras, era promessa vazia | Frase trocada pela consequência que de fato importa e é verdadeira: `CANCELADA` é estado terminal (`STATUS_TRANSITIONS.CANCELADA: []`), então *"Não dá para reabrir a ordem depois"*. Chave renomeada para `cancelar_efeito_irreversivel`, pt e zh |

---

## 6. Testes

| Suíte | Resultado |
|---|---|
| `ComprasContent.behavior.test.tsx` (novo) | **18 testes** — vencimento e `sem prazo`; vínculo NF-e e título na linha; ações por situação (rascunho/confirmada/em trânsito/recebida); atalhos para NF-e e título com o href correto; **receber desabilitado e explicado quando a nota já creditou**; receber disponível com a nota ainda em conferência; filtro, detalhe e limpeza de filtros escrevendo na URL; `?oc=` abrindo o detalhe no carregamento; cancelamento declarando consequência **sem** campo de motivo e **sem** prometer motivo registrado; aviso de irreversibilidade |
| Financeiro + admin-v2 + compras | **100 testes, 0 falhas** (13 arquivos) |
| `tsc --noEmit` · ESLint (`app`, `components`, `lib`) | OK |
| Paridade i18n pt × zh | **0 assimetrias**, 3.043 chaves em cada idioma |

---

## 7. QA ao vivo — evidências

### Lista, menu e guarda de dupla entrada

1. Lista com as quatro ordens semeadas: **Vencimento** preenchido, **`sem prazo`** na ordem sem
   prazo, e **`NF-e #23577`** na coluna Vínculo apenas na ordem vinculada.
2. Menu de três pontos por linha, com as ações certas para cada situação.
3. **Guarda de dupla entrada, ao vivo** (OC `0C000004`, a única com NF-e): o item
   *Conferir e receber* veio `disabled: true` com
   `title: "O estoque desta compra já entrou pela NF-e"`.
4. **Detalhe:** aviso *"Esta ordem está vinculada à NF-e #23577, que já foi confirmada e creditou o
   estoque. Receber a ordem de novo lançaria a mesma mercadoria duas vezes — por isso o recebimento
   está bloqueado"*, com o botão *Registrar recebimento* ausente.
5. **Contradição do defeito #2 corrigida** e reconferida na tela.
6. `?status=EM_TRANSITO` filtrando pela URL; `?oc=<id>` abrindo o detalhe; a URL passando a
   `?oc=...` ao abrir pelo menu.
7. **0 px de overflow horizontal** em 1280.

> Uma medição intermediária acusou 52 px de overflow. Era **artefato do harness**: o painel estava
> oculto e `clientWidth` valia 0. Com viewport real, 0 px. Mesmo tipo de falso positivo já
> registrado em `FECHAMENTO_*.md` §6.

### Ciclo completo de recebimento — executado pela interface

Roteiro corrido na OC **`0C000003`** (em trânsito, fornecedor *Importadora Yiwu Ltda*, vencimento
09/10/2026, 15 un × R$ 40,00, **sem NF-e vinculada** — o caminho livre). Linha de base medida no
banco antes de tocar na tela: **estoque 10.000**, nenhum título, nenhum movimento.

| Passo | O que a tela fez | O que o banco registrou |
|---|---|---|
| Menu da linha | `Abrir detalhe` · `Conferir e receber` · `Cancelar ordem` — receber **habilitado**, porque não há nota creditando | — |
| `Conferir e receber` | **Abriu o detalhe**, não recebeu por atalho. URL passou a `?oc=0c000003-…` | — |
| Detalhe | Campo com `aria-label` *"Qtd. recebida — LED护眼台灯可调光 · Luminária LED mesa regulável"* | — |
| Conferência de 15 | O bloco de consequência **recalculou sozinho**: de *"título de R$ 0,00"* para ***"Um título de R$ 600,00 entra em Contas a pagar, vencendo em 09/10/2026"*** | — |
| `Registrar recebimento` | Modal fechou, `?oc=` saiu da URL, lista recarregou sozinha | `status=RECEBIDA`, `quantidade_conferida=15` |
| Lista | OC virou **Recebida**; coluna Vínculo passou a **`Conta a pagar · R$ 600,00`** | `contas_pagar`: **1** registro — *"Ordem de compra 0C000003"*, R$ 600,00, venc. 2026-10-09, `PENDENTE` |
| Crédito de estoque | — | **10.000 → 10.015**, exatamente +15 |
| Crédito único | — | **1** lançamento no kardex: `ENTRADA_OC`, delta `+15`, obs. *"Recebimento OC 0c000003… (conferido)"* |
| Menu após receber | Passou a oferecer só `Abrir detalhe` e `Abrir conta a pagar gerada` — receber e cancelar sumiram | — |
| Atalho do título | Levou a `/admin/financeiro?tab=pagar`, onde a linha aparece: *Importadora Yiwu Ltda · Ordem de compra 0C000003 · 09/10/2026 (em 27 dias) · R$ 600,00 · Em aberto* | — |
| Detalhe reaberto | Botão de receber **ausente**; no lugar, *"O QUE ACONTECEU — Estoque creditado e título lançado em Contas a pagar"* com atalhos `Ver no estoque` e `Ver contas a pagar` | — |

**Prioridade 1 confirmada ponta a ponta:** o recebimento gerou o título, e o título é visível tanto
na lista de Compras quanto em Contas a Pagar. **Prioridade 3 (crédito único) confirmada por
contagem**, não por inspeção visual: um único movimento de estoque e um único título.

### Cancelamento pelo modal

Executado na OC `0C000001` (rascunho). O modal declarou as consequências, **sem campo de motivo**,
e — depois da correção do defeito #4 — sem prometer que um motivo ficaria registrado. Confirmado:

- `ordens_compra.status = CANCELADA`;
- **estoque intacto em 10.015** — a promessa *"nada é retirado do estoque"* se sustenta;
- **nenhum título** criado para a ordem cancelada;
- os KPIs do topo recalcularam (Rascunhos 0, Confirmadas 1).

> Um primeiro clique de confirmação não surtiu efeito e cheirou a defeito. Não era: eu havia clicado
> por **coordenada crua** enquanto o modal ainda animava. Antes de acusar o produto, testei o
> `UPDATE` sob o JWT do próprio usuário (`linhas_afetadas=1`) e reli as políticas de RLS —
> `oc_auth`, `ALL` na mesma loja. Repetido o clique **por referência de elemento**, cancelou de
> primeira. Fica o registro para não virar bug fantasma.

### 375 px

| Verificação | Resultado |
|---|---|
| Overflow horizontal da página | **0 px** (lista e detalhe) |
| Tabela larga | Rola **no próprio contêiner** (`overflow-x-auto`, 341 px visíveis de 841) — o corpo nunca rola na horizontal |
| Menu de ações | Fora da largura inicial, **alcançável ao rolar a tabela**; visível e clicável depois |
| Modal de detalhe | 375 px de largura, **0 filhos estourando** |
| KPIs | Empilham em coluna única |

### Onde a leitura pesou

O detalhe levou ~20 s para carregar em 375 px, contra ~13 s em 1280. É **lentidão de `next dev`**
em rota fria (sem erro de console, sem falha de rede), não característica do produto. Não medi
tempo em build de produção — se performance de abertura virar requisito, é medição à parte.

---

## 8. Riscos

| Risco | Situação |
|---|---|
| Regredir conferência obrigatória | A ação de linha *Conferir e receber* **não recebe**: abre o detalhe, onde a conferência item a item acontece. Nenhum atalho pula a etapa. |
| Esconder ação por estado derivado errado | `nfeJaCreditou` exige `nfe_status = 'CONCLUIDA'`. Com a nota ainda em conferência a ação continua disponível — coberto por teste. E a autoridade segue sendo o banco: mesmo se a UI errasse, `receber_ordem_compra` recusaria. |
| Embeds novos pesarem na listagem | Duas relações 1-1 por linha, em página de 20. Sem `count` extra. |
| Filtros na URL quebrarem os atalhos do hub de Entrada | `hrefComprasPorStatus('EM_TRANSITO')` continua funcionando: `?status=` é lido no servidor e no cliente. |
| Disco cheio voltar a mascarar defeito | Registrado aqui como achado de ambiente. Ver §9. |
| QA escrever no banco errado | `next dev` sem wrapper aponta para o Supabase **remoto**. Ver §9 — sugerido script `dev:local`. |

---

## 9. Achado de ambiente — fora do produto

**A partição `C:` chegou a 0 byte livre durante esta sessão.** Isso produziu sintomas que parecem
defeito de produto: página travada em "Carregando…", efeito de cliente que nunca roda, compilações
de 40–90 s e, por fim, `docker`/`psql` sem resposta.

Medição de ocupação, colhida durante o incidente (`C:` = 238 GB, **100 % em uso, 0 disponível**):

| Caminho | Tamanho |
|---|---|
| **`.claude/worktrees/`** | **34 GB** |
| `.qa-round2-worktree/` | 2,2 GB |
| `pdv-importados/.next` | 1,7 GB |
| `pdv-importados/node_modules` | 218 MB |

Liberei apenas `pdv-importados/.next`, que é cache de build e se regenera sozinho.

**Não removi `.claude/worktrees/` (34 GB) nem `.qa-round2-worktree/` (2,2 GB).** São cópias de
trabalho de sessões anteriores e podem conter alterações não commitadas; apagá-las é decisão do
dono do repositório, não minha. São elas, e não o projeto, que ocupam o disco: o repositório em si
é uma fração disso.

Enquanto o disco esteve cheio, `docker` e `psql` pararam de responder — foi o que adiou o QA da
§7, concluído depois com **15 GB livres**.

**Segundo tropeço, na retomada.** Ao religar o servidor com um `next dev` simples, ele passou a
falar com o Supabase **remoto** (`.env.local` aponta para lá), e não com o Docker local. Peguei
antes de executar qualquer escrita: o schema remoto nem tem `data_vencimento`, e um recebimento ali
teria criado título e crédito de estoque no banco errado. A sessão anterior usava um wrapper que
sobrescreve `NEXT_PUBLIC_SUPABASE_URL` para `http://127.0.0.1:54321`; sem ele, o alvo padrão é o
remoto. **Vale um `npm run dev:local`** no `package.json` para que o alvo local não dependa de
lembrar de um wrapper.

---

## 10. Gaps restantes

### Da Onda 1

| Item | Estado |
|---|---|
| **1 — kebab nas demais listas** | **Parcial.** Em uso em AP, AR e Compras. Falta Vendas (com a reimpressão de cupom que sumiu do Admin) e Estoque. |
| **2, 3, 4** | Concluídos. |
| **5 — Compras** | **Concluído.** Implementado e verificado ponta a ponta na interface (§7). |

### De Compras — fora desta entrega, por decisão

- **Desvincular OC ↔ NF-e** (NF-1) — o Bling tem "remover o vínculo"; o Jinlong não tem RPC para
  isso. Um vínculo errado segue irreversível pela interface. **Exige migration** — proposta, não
  improviso.
- **Parcelamento na compra** (CO-1) — o Bling gera N parcelas; aqui é um título só. Mudança de
  modelo com regra financeira nova.
- **Imprimir o pedido de compra** (CO-5) e **exportar CSV** (CO-6) — Onda 2.
- **Frete e ICMS ST no custo** (CO-8), **anexos** (CO-9) — exigem colunas novas.
- **Motivo no cancelamento** — só com coluna para guardá-lo. Contas a Pagar já captura e grava
  motivo; Compras não tem onde. Equiparar é decisão de negócio com migration, não ajuste de tela.
- **Atalho do título não aponta para o título** — *"Abrir conta a pagar gerada"* leva a
  `/admin/financeiro?tab=pagar`, a aba inteira, não à linha específica. Com poucos títulos não
  incomoda; com muitos vira caça. A busca da aba é client-side e não lê a URL, então um deep-link
  (`?tab=pagar&titulo=<id>`) exige encanamento novo no Financeiro — fora do "corrigir só o
  necessário" desta passagem, e registrado aqui como o próximo passo natural.
