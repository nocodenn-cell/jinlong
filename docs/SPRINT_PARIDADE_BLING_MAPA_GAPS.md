# Sprint — Imitar a experiência operacional do Bling · Mapa inicial de gaps

**Data:** 2026-09-11
**Status:** análise concluída; **nenhuma alteração de código feita até aqui**.
**Objetivo da sprint:** quem já sabe operar o Bling deve se sentir em casa no Jinlong — mesma
localização das funções, mesmo vocabulário, mesmos gestos. Não é redesign artístico.

Frente anterior encerrada e lida:
[`FECHAMENTO_FLUXO_ENTRADA_COMPRA_ESTOQUE_FINANCEIRO.md`](./FECHAMENTO_FLUXO_ENTRADA_COMPRA_ESTOQUE_FINANCEIRO.md)
· [`PIPELINE_MIGRATIONS_VALIDACAO_2026-09-11.md`](./PIPELINE_MIGRATIONS_VALIDACAO_2026-09-11.md).

---

> **CORRIGIDO EM 2026-09-11** por
> [`BLING_OBSERVADO_O_QUE_APROVEITAR.md`](./BLING_OBSERVADO_O_QUE_APROVEITAR.md), escrito sobre 8
> documentos de auditoria do Bling em **conta real**. Três itens abaixo estavam errados:
> **PR-1** (histórico de preços do produto **existe**, com UI no formulário), **PD-1** (venda em
> espera **está implementada** e ligada ao PDV) e **CX-2** (`formas_pagamento` não é só um enum
> ocioso — tem `taxa_percentual` e `prazo_compensacao_dias`). Ver §1 daquele documento.

---

## 0. Estado de entrada — o que esta sprint herda

| Fato | Consequência para esta sprint |
|---|---|
| 45 caminhos pendentes no working tree, incluindo **as 3 migrations da frente anterior ainda não commitadas** | Não commitar, mover nem reverter nada da frente anterior. Trabalhar por cima. |
| `main` local está **1 commit atrás** de `origin/main` | Qualquer `migration up` local volta a ser recusado. Esta sprint é de UI/UX — planejada para **não precisar de migration**. |
| 6 bloqueadores de go-live abertos, todos de banco/deploy | Nenhum deles é resolvido nem agravado por esta frente. |
| Banco local reconstruído por `db reset`, **só com seed** (`produtos=15`, `usuarios=4`) | O QA operacional desta sprint precisa **recriar massa de teste** (OC, NF-e, títulos) antes de validar telas de lista. |
| DIV-D0-016 (decisão vigente): *"Classificar Bling como referência de experiência"*, não como fonte de requisitos | **Esta sprint é a execução formal dessa decisão.** Nenhuma função do Bling vira obrigação só por existir lá. |

---

## 1. Fontes usadas

**Internas.** `FECHAMENTO_*`, `PIPELINE_*`, `AUDITORIA_MENU_EXPOSICAO_CLIENTE.md`,
`UX_AUDIT.md`, `PLANO_FASE_2_VALOR_PERCEBIDO.md`, `piloto-d0/DIVERGENCIAS_E_DECISOES.md`,
`pdv-importados/docs/PLANO_CADASTRO_PRODUTO_UX.md`, `docs/02-DESIGN-SYSTEM.md` — mais leitura
direta do código de todos os módulos prioritários.

> **Não existe auditoria dedicada do Bling no projeto.** As 60 ocorrências de "Bling" em `.md`
> são, na quase totalidade, (a) o `BlingProvider` fiscal — integração de API, assunto **não
> relacionado** a esta sprint; (b) o token de cor "Azul Bling" no design system; (c) comparações
> de mercado pontuais. Este documento é a primeira auditoria de experiência propriamente dita.

**Externas.** Central de Ajuda pública do Bling (`ajuda.bling.com.br`) — sem login, sem
credencial, somente leitura de artigos públicos. Usada para apurar menus, abas, ações de linha,
filtros e estados reais, em vez de descrevê-los de memória. **Não houve acesso a uma conta Bling**
— se o dono quiser fornecer uma, a apuração de telas que a ajuda não cobre (ações em massa,
customização de colunas, coluna lateral) fica mais precisa.

---

## 2. Padrões do Bling apurados (o vocabulário de referência)

Apurados na ajuda oficial; são o gabarito contra o qual o Jinlong foi medido.

| Padrão | Como é no Bling |
|---|---|
| **Localização de compras** | `Estoque > Pedido de Compra`, `Estoque > Notas fiscais de entrada`, `Estoque > Gestão de Compras`. Compra vive **dentro de Estoque**. |
| **Localização do financeiro** | `Financeiro > Contas a pagar`, `> Contas a receber`, `> Caixas e bancos`. |
| **Cadastros de apoio** | `Cadastros > Formas de pagamento`, `Cadastros > Categorias financeiras`, `Cadastros > Clientes e fornecedores`, `Cadastros > Produtos`. |
| **Ação de criar** | Botão `+ Incluir conta` / `Incluir Pedido` / `Incluir Categoria`, **canto superior direito**. |
| **Ações de linha** | Menu de **3 pontos** na própria linha: `Baixar` → *Baixa total do pagamento* / *Baixa parcial do pagamento*, `Lançar contas`, editar, excluir. |
| **Ações laterais** | Coluna lateral direita com `Mais ações` (ex.: *Importar XML NF-e*), filtros e customização de colunas. |
| **Ações em massa** | Selecionar linhas (até 300) → `Baixar selecionados`, com opção *Recebimento agrupado*. Edição de categoria em massa. |
| **Colunas** | O operador escolhe **quais colunas vê e em que ordem**, e clica em `Aplicar`. |
| **Filtros de lista** | Situação, categoria, tipo de pagamento, forma de pagamento, valor, nº do documento, período. |
| **Estados de título** | `Em aberto` · `Vencendo hoje` · `Atrasada` · `Paga` · `Paga parcialmente, mas em dia` · `Paga parcialmente, porém atrasada`. **Seis** estados, derivados de saldo × vencimento. |
| **Salvar** | Dois botões: `Salvar` e **`Salvar e dar baixa`** (elimina um ciclo lista→linha→ação). |
| **Parcelamento na compra** | No pedido de compra: nº de parcelas *ou* dias (`30, 60, 90`) → `Gerar parcelas`; cada parcela com dias, data, valor, forma e observação editáveis; excluir/incluir parcela. |
| **Custo da compra** | Frete e ICMS ST entram no cálculo do preço de custo. |
| **Vínculo OC ↔ NF-e** | Vínculo **por item** ("Conciliar produtos"), com *situações de vínculo* nomeadas e ação explícita de **remover o vínculo**. |
| **Impressão** | O pedido de compra tem versão impressa — daí existir "observações internas (não exibidas no pedido impresso)". |
| **Anexos** | Conta a pagar e pedido de compra aceitam anexo de arquivo. |

---

## 3. Mapa de gaps

Legenda de prioridade: **P0** o operador vindo do Bling trava ou erra · **P1** ele consegue, mas
com atrito ou desconfiança · **P2** polimento.
Legenda de custo: **UI** só front · **UI+action** front + server action · **DB** exige migration.

### 3.1 Produto / Catálogo

O módulo mais maduro. Filtros (busca, status, origem, categoria, marca, fornecedor, saldo,
imagem), chips removíveis, seleção em lote, exportar CSV, importar CSV, ações de linha
(editar, duplicar, excluir, ver estoque), atalho para etiqueta no form.

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **PR-1** | ~~Sem histórico do produto.~~ **CORRIGIDO:** o histórico de **preços** existe e tem UI (`HistoricoPrecosSection` no formulário). Resta só o histórico das demais alterações (NCM, fornecedor, situação). | `components/gerente/produtos/produtoFormSections/HistoricoPrecosSection.tsx` | P2 | UI+action |
| **PR-2** | Etiqueta não é ação de linha na lista, só dentro do formulário. Etiquetar N produtos exige abrir N formulários. | `adminEtiquetasProdutoQuery` usado só em `ProdutoFormModal.tsx:518` | P1 | UI |
| **PR-3** | Sem ação em massa além de excluir (não há alterar categoria/marca/preço em lote). Bling tem edição em massa. | `CatalogoLoteToolbar.tsx` expõe só `onExcluir` | P2 | UI+action |
| **PR-4** | Colunas fixas; o operador não escolhe o que vê. | `CatalogoTable.tsx` | P2 | UI |

> **Divergência deliberada — manter.** O Bling cadastra produto em **abas**; o Jinlong usa
> **seções permanentes** (Essencial · Comercial · Compra · Estoque · Fiscal recolhível). Isso foi
> decidido e documentado em `PLANO_CADASTRO_PRODUTO_UX.md`, com a meta de cadastro em ~20 s e o
> "Recovery Guard" proibindo reimportar a branch de abas. **Não reverter.** Abas escondem campos
> atrás de cliques; o público do Jinlong cadastra centenas de itens/dia.

### 3.2 Compras (Pedido de Compra)

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **CO-1** | **Uma ordem gera um único título.** O Bling parcela na própria compra (`30/60/90` → `Gerar parcelas`, cada uma editável). O Jinlong tem um só `ordens_compra.data_vencimento`. | `20260911130000_*.sql`; `ordens_compra` sem tabela de parcelas | **P0** | **DB** |
| **CO-2** | **Filtros e ordem aberta não estão na URL.** `status` e `busca` são `useState`; o detalhe é um modal sem rota. Voltar/atualizar/compartilhar perde o contexto; não existe link para uma OC. | `ComprasContent.tsx:71-72`, `detalheId` em estado local | **P0** | UI |
| **CO-3** | **Sem ações de linha.** Só clique na linha → modal. Não há kebab com *Receber · Editar · Cancelar · Imprimir*. | `ComprasContent.tsx:290` (`onRowClick`) | **P0** | UI |
| **CO-4** | **Vencimento não aparece na lista** — é justamente o campo que decide se nasce obrigação financeira. Só foi exposto no detalhe (correção #15 da frente anterior). | colunas em `ComprasContent.tsx:160-210` | P1 | UI |
| **CO-5** | Sem **impressão do pedido de compra** (o Bling imprime e distingue observação interna de observação impressa). | nenhum `print` em `app/admin/compras` | P1 | UI |
| **CO-6** | Sem exportar CSV (existe em Catálogo, Relatórios e Contas a Pagar). | — | P1 | UI+action |
| **CO-7** | Sem filtro por fornecedor nem por período de emissão/previsão. | `ComprasContent.tsx` só tem chips de status + busca | P1 | UI+action |
| **CO-8** | Frete/ICMS ST não compõem o custo da compra. | `OcFormModal.tsx` | P2 | DB |
| **CO-9** | Sem anexo de documento na ordem. | — | P2 | DB |

### 3.3 Entrada / NF-e

O hub `/admin/estoque/entrada` já foi construído **explicitamente** como paridade Bling e é o
melhor exemplo do alvo desta sprint (o próprio cabeçalho do arquivo declara isso).

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **NF-1** | **Não há como desfazer um vínculo OC ↔ NF-e.** O Bling tem "remover o vínculo" como ação de primeira classe. No Jinlong o vínculo é criado por RPC e protegido por índice único — **um vínculo errado é irreversível pela interface**. | `vincular_importacao_nfe_ordem_compra` sem par; `VinculoOrdemCompra.tsx` | **P0** | DB |
| **NF-2** | Vínculo é **por documento**; no Bling é **por item** ("Conciliar produtos"). Nota parcial de uma ordem não tem representação. | migration `20260911140000` | P1 | DB |
| **NF-3** | Sem lista de notas de entrada com filtros/situação — a tela é "importar", não "gerenciar". O Bling tem `Estoque > Notas fiscais de entrada` como lista de trabalho. | `app/admin/estoque/importar-nfe/page.tsx` | P1 | UI+action |
| **NF-4** | Sem estorno de entrada de NF-e. Já mapeado como **P1-4** na frente anterior, com as 4 decisões de negócio pendentes. | `FECHAMENTO_*.md` §10 | P1 | DB |

### 3.4 Recebimento

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **RC-1** | Lista de remessas **sem filtro e sem busca** (só as recentes). Com volume, vira inutilizável. | `RecebimentoGerentePageClient.tsx:124-148` | P1 | UI+action |
| **RC-2** | Sem detalhe/retorno: não dá para abrir uma remessa recebida e ver o que entrou. | — | P1 | UI+action |
| **RC-3** | Sem impressão do comprovante de recebimento. | — | P2 | UI |

### 3.5 Estoque

Melhor caso de navegação do sistema: filtros **na URL**, chips removíveis, paginação por link,
ações de linha (`Ajuste` e `Kardex`). É o padrão que os outros módulos deveriam seguir.

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **ES-1** | Sem exportar saldo. | nenhum CSV em `app/admin/estoque` | P1 | UI+action |
| **ES-2** | Etiqueta e transferência não são ações de linha. | `EstoqueTable.tsx:175-197` só tem ajuste e kardex | P1 | UI |
| **ES-3** | Cabeçalho da coluna fixa cobre o vizinho no mobile ("SALDO" vira "LDO"). Pendência conhecida e não bloqueadora. | `FECHAMENTO_*.md` §12 | P2 | UI |

### 3.6 Financeiro (hub)

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **FI-1** | **A pagar e A receber são duas telas com filosofias diferentes.** A Pagar tem KPIs, chips de situação, busca, filtro de período e fornecedor, exportar e ações de linha. A Receber é uma **tabela somente-leitura**. O operador do Bling espera simetria: as duas listas se comportam igual. | `ContasPagarListClient.tsx` × `ContasReceberTable.tsx` | **P0** | UI |
| **FI-2** | Falta `Caixas e bancos` como destino do financeiro — no Bling é onde a baixa aterrissa. O Jinlong tem caixa, mas o financeiro não conversa com ele na navegação. | `financeiroTabs.ts` = receber/pagar/fiscal | P1 | UI |

### 3.7 Contas a Pagar

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **AP-1** | **Situação não considera o vencimento.** Badge mostra `PENDENTE/PARCIAL/PAGO/CANCELADO`; o Bling mostra *Em aberto · Vencendo hoje · Atrasada · Paga parcialmente em dia · Paga parcialmente atrasada · Paga*. O KPI "atrasadas" existe, mas a **linha** não avisa. | `statusBadgeClass`, `ContasPagarListClient.tsx:80` | **P0** | UI |
| **AP-2** | **Sem histórico de pagamentos do título.** A tabela `contas_pagar_pagamentos` existe e não tem tela. A Receber tem histórico; a Pagar não. | `contas_pagar_pagamentos` em `database.types.ts:1055`; sem action de listagem | **P0** | UI+action |
| **AP-3** | **`estornar_pagamento_contas_pagar` existe no banco e não tem nenhuma UI.** Pagamento errado só se corrige por SQL. | `database.types.ts:5591`; `contas-pagar/actions.ts` não a chama | **P0** | UI+action |
| **AP-4** | **Motivo de cancelamento pedido por `window.prompt`.** Diálogo do navegador, sem i18n, sem validação visual, sem consequência declarada. | `ContasPagarListClient.tsx:200` | **P0** | UI |
| **AP-5** | Sem baixa em massa ("Baixar selecionados"). Fechar 20 parcelas do mesmo fornecedor = 20 ciclos. | — | P1 | UI+action |
| **AP-6** | Sem recibo/comprovante de pagamento imprimível (o PDV imprime tudo; o financeiro não imprime nada). | `PagamentoModal.tsx` sem print | P1 | UI |
| **AP-7** | Sem lançamento manual de conta a pagar. Já mapeado como **P1-5**: faltam `categoria_id` e `criado_por`. No Bling, "Incluir conta" é a porta principal do módulo. | `FECHAMENTO_*.md` §10 | P1 | DB |
| **AP-8** | Sem filtro por categoria financeira, valor ou nº do documento; sem colunas customizáveis. | `ContasPagarListClient.tsx:440-500` | P2 | UI |

### 3.8 Contas a Receber

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **AR-1** | **Só os 8 primeiros títulos podem ser liquidados.** O painel "Liquidar título" faz `abertas.slice(0, 8)`. O 9º título em aberto **não tem como ser baixado pela interface**. | `FinanceiroReceberExtras.tsx:146` | **P0** | UI |
| **AR-2** | **Lista duplicada.** Uma tabela somente-leitura em cima e outra lista com formulários embaixo. O Bling tem uma lista com ação na linha. | `FinanceiroContent.tsx:128-137` | **P0** | UI |
| **AR-3** | **Enum cru na tela do operador:** `CARTAO_DEBITO`, `CARTAO_CREDITO`, `DINHEIRO`. Além de feio, **não passa pelo i18n** — quebra a paridade pt/zh que a frente anterior fechou em 0 assimetrias. | `FinanceiroReceberExtras.tsx:28` e rótulos hardcoded | **P0** | UI |
| **AR-4** | Sem situação derivada do vencimento (mesmo problema do AP-1); o `StatusPill` só distingue ABERTO de não-ABERTO. | `ContasReceberTable.tsx:43` | **P0** | UI |
| **AR-5** | Sem filtro de situação/período e **sem exportar** (a Pagar tem os dois). | `page.tsx` AR só tem filtros de cliente/busca/data | P1 | UI+action |
| **AR-6** | `window.prompt` para motivo de estorno. | `FinanceiroReceberExtras.tsx:65` | P1 | UI |
| **AR-7** | Sem recibo de recebimento imprimível. | — | P1 | UI |

### 3.9 Caixa

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| **CX-1** | A baixa do financeiro pede "Caixa físico" só quando há mais de um caixa aberto, e por `<select>` de operador — sem o conceito de **portador/conta de destino** que o Bling usa. | `FinanceiroReceberExtras.tsx:207-216` | P1 | UI |
| **CX-2** | `formas_pagamento` é tabela real, **sem CRUD e sem leitura em lugar nenhum**; as formas são enum hardcoded. **Pior do que eu disse:** ela carrega `taxa_percentual` e `prazo_compensacao_dias` — taxa de cartão e prazo de compensação modelados e 100 % ociosos. Ligá-la à tela de baixa resolve o **AR-3** sem migration. | `database.types.ts:1908`; zero referências fora de `vendas` | **P1** | UI+action |

### 3.10 PDV

Módulo mais maduro do produto e **o mais próximo do Bling em modelo mental**: menu de operações,
atalhos de teclado documentados, reimpressão (F12), sangria/suprimento com recibo, histórico,
fechamento com recibo. **Nenhum gap P0.**

| # | Gap | Evidência | Prio | Custo |
|---|---|---|---|---|
| ~~**PD-1**~~ | ~~Venda em espera não existe.~~ **CORRIGIDO — não é gap.** Está implementada: tabela `vendas_em_espera` (`rotulo`, `numero_local`, `status`), RPC `listar_vendas_em_espera`, hook montado no PDV. | `app/caixa/hooks/useCaixaVendasEmEspera.ts`; `CaixaPageClient.tsx:49,746` | — | — |

---

## 4. Gaps transversais

| # | Gap | Evidência | Prio |
|---|---|---|---|
| **TR-1** | **Ações de linha sem padrão.** Estoque usa dois ícones; Vendas usa dois ícones; Compras não tem nenhuma; Contas a Pagar usa dois botões; Contas a Receber usa um formulário inline. O Bling tem **um** gesto: os 3 pontos. Existe até um `VendaActionsMenu` pronto (Ver · Imprimir · Cancelar) — **e ele é código morto, não montado em lugar nenhum.** | `app/gerente/vendas/VendaActionsMenu.tsx` sem importador | **P0** |
| **TR-2** | **Reimprimir cupom sumiu do Admin.** O PDV reimprime (F12, histórico); `/admin/vendas` só tem *Detalhes* e *Cancelar*. Quem administra a loja não consegue reimprimir uma venda. | `VendasTable.tsx:279-283`; `VendaActionsMenu` órfão | **P0** |
| **TR-3** | **Preservação de contexto desigual.** Estoque, Catálogo, Vendas e Auditoria guardam filtro na URL. **Compras não**, e nenhum modal de detalhe (OC, venda, título) é endereçável. Voltar do detalhe para a lista filtrada só funciona onde o filtro está na URL. | §3.2 CO-2 | **P0** |
| **TR-4** | **Exportar existe em 4 de 10 listas** (Catálogo, Relatórios, Contas a Pagar, Histórico de Caixa). Falta em Estoque, Vendas, Compras, Contas a Receber, Clientes, Fornecedores, Auditoria. | grep de `downloadCsv`/`text/csv` | P1 |
| **TR-5** | **Imprimir só existe no PDV e em etiquetas.** Nenhum documento do back-office imprime: OC, entrada, recebimento, recibo de pagamento, recibo de recebimento. | grep de `window.print` | P1 |
| **TR-6** | **`ConsequenciaOperacao` — o padrão Bling que o projeto já criou — está em 3 telas** (conferência NF-e, recebimento de OC, recebimento). Falta onde o efeito também é transversal e irreversível: cancelar venda, ajustar estoque, pagar/cancelar título, liquidar, transferir. | `components/ui/admin-v2/ConsequenciaOperacao.tsx` | P1 |
| **TR-7** | **Histórico por registro não existe.** A Auditoria é global (período + tipo). O Bling põe o histórico **dentro** do registro. Não há "histórico deste título / desta OC / deste produto". | `app/admin/auditoria/page.tsx:68` | P1 |
| **TR-8** | **~950 LOC de menu morto e divergente:** `lib/navigation/gerenteNavUi.ts` + `GerenteHeaderNav.tsx` + `GerenteMobileNavDrawer.tsx`, nenhum montado. Armadilha: alguém "arruma o menu" ali e nada muda. Já apontado em `AUDITORIA_MENU_EXPOSICAO_CLIENTE.md` §4.2 e **ainda aberto**. | grep de importadores | P1 |
| **TR-9** | **Segunda armadilha de menu:** `estoqueHubNav.ts` e `catalogoHubNav.ts` só são referenciados por **testes**. O `ESTOQUE_HUB_TABS` morto **não tem "Entrada" nem "Compras"** — ou seja, há um teste verde sobre um menu que não existe. O menu vivo é `hubNavLabels.ts`. | grep de `ESTOQUE_HUB_TABS` | P1 |
| **TR-10** | **"Ir para PDV" é o último item do último grupo** do menu, sendo o destino mais usado da loja. Recomendação de mover para o topo está aberta desde `AUDITORIA_MENU_EXPOSICAO_CLIENTE.md` §3. | `adminV2SidebarNav.ts` (`ADMIN_V2_SISTEMA_ITEMS`) | P1 |
| **TR-11** | **`window.prompt` como padrão de captura de motivo** em duas operações financeiras irreversíveis. Sem i18n, sem validação, sem consequência declarada. | AP-4, AR-6 | **P0** |
| **TR-12** | Colunas não customizáveis em nenhuma lista. No Bling é recurso de primeira classe. | `DataTable.tsx` | P2 |

---

## 5. Divergências deliberadas — **não** copiar do Bling

| Assunto | Decisão do Jinlong | Por quê |
|---|---|---|
| Cadastro de produto em abas | **Seções permanentes**, só Fiscal recolhível | `PLANO_CADASTRO_PRODUTO_UX.md`: meta de 20 s/cadastro; abas escondem campo atrás de clique. Há "Recovery Guard" explícito proibindo a branch de abas. |
| Bloquear dupla entrada por heurística | **Só vínculo explícito** | `FECHAMENTO_*.md` §1: heurística (mesmo fornecedor + valores próximos) recusaria remessa legítima. |
| Derivar vencimento quando não informado | **Não gerar título** | Inventar prazo é inventar regra financeira. |
| Venda em espera | Congelada (D0-04) | Fora do piloto. |
| Bling como fonte de requisitos | **Referência de experiência** | DIV-D0-016. |

**Invariantes que esta sprint não pode tocar:** conferência física antes do crédito; quantidade
sempre de `quantidade_conferida`; idempotência de recebimento e importação; kardex imutável;
isolamento por loja e perfil nas RPCs; RLS; trilha de auditoria; SSOT de rotas e de entidades.
Toda a Onda 1 abaixo é **UI e server action** — sem migration, sem tocar RPC.

---

## 6. Plano de execução proposto

**Onda 1 — os P0, sem banco.** Ordem por dependência, não por módulo:

1. **TR-1 + TR-2** — componente único de ações de linha (kebab de 3 pontos), aproveitando o
   `VendaActionsMenu` órfão como base; devolver *Imprimir cupom* ao Admin.
2. **AR-1/AR-2/AR-3/AR-4** — refundar Contas a Receber sobre o mesmo shell da Contas a Pagar:
   uma lista, ação na linha, situação derivada, formas via i18n. Mata o `slice(0, 8)`.
3. **AP-1 + AP-2 + AP-3** — situação derivada do vencimento; histórico do título; expor o estorno
   que já existe no banco.
4. **AP-4 + AR-6 (TR-11)** — modal de motivo com consequência declarada, no lugar dos dois
   `window.prompt`.
5. **CO-2 + CO-3 + CO-4** — filtros de Compras na URL, detalhe endereçável, ações de linha,
   vencimento na lista.

**Onda 2 — P1 de alto retorno.** NF-1 (desvincular — exige migration), TR-4 (exportar nas listas
que faltam), TR-5 (imprimir OC e recibos financeiros), TR-6 (consequência declarada nas operações
irreversíveis restantes), TR-7 (histórico por registro), RC-1/RC-2.

**Onda 3 — higiene e P2.** TR-8/TR-9 (matar os dois menus mortos), TR-10, PR-1/PR-2, ES-1/ES-2,
CX-2, TR-12.

**Fora desta sprint:** CO-1 (parcelamento na compra) e NF-2 (vínculo por item) — são mudanças de
modelo de dados com regra financeira nova, na mesma classe do P1-4/P1-5 já congelados. Entram como
proposta formal, não como implementação silenciosa.

**Ciclo por item:** ler o código → alterar → `tsc` + ESLint + Vitest → QA visual autenticado em
1280 px e 390 px → paridade pt/zh → corrigir → seguir.

---

## 7. Riscos desta sprint

| Risco | Mitigação |
|---|---|
| Trabalhar sobre 45 caminhos pendentes da frente anterior | Não commitar nem reverter nada existente; alterações aditivas e revisáveis por diff. |
| Banco local só com seed | Recriar massa de QA (OC, NF-e, títulos AR/AP) antes de validar listas — senão "funciona" só no estado vazio. |
| Refundar Contas a Receber tocar liquidação | A RPC `registrar_liquidacao_receber` **não muda**; só a camada de apresentação. Regra de loja (`foraDaLoja`) preservada literalmente. |
| Quebrar paridade i18n (hoje em 0 assimetrias) | Todo rótulo novo entra em `pt.json` **e** `zh.json` no mesmo commit; checagem de paridade antes de fechar. |

---

**Próximo passo:** Onda 1, item 1. Nenhuma decisão do dono é necessária para começar — todas as
escolhas acima saem das auditorias existentes ou do próprio código.
