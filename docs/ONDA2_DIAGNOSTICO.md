# Onda 2 · UX/UI — Paridade operacional com o Bling · Diagnóstico

**Data:** 2026-09-12
**Base congelada:** Onda 1 no commit `27f35cdbef761825309c07ac98964953f34c9374` (74 arquivos),
verificado alcançável e íntegro antes desta análise.
**Status:** diagnóstico **+ resultado da implementação autorizada** (ver §9).

> **Leia primeiro o §1.** Os dois documentos de referência são de **11/09, escritos antes da
> Onda 1**. Vários P0 deles já foram resolvidos e **três alegações não se sustentam mais no código
> de hoje**. Este diagnóstico vale o que vale porque cada linha abaixo foi reconferida contra o
> código atual — não copiada dos documentos anteriores.

---

## 0. Método

1. `git status` + verificação do SHA da Onda 1 — íntegro.
2. Leitura de `BLING_OBSERVADO_O_QUE_APROVEITAR.md` (270 linhas) e
   `SPRINT_PARIDADE_BLING_MAPA_GAPS.md` (280 linhas).
3. **Inventário das 28 telas admin reais** (`find app/admin -name page.tsx`).
4. **Reconferência item a item** de cada gap alegado contra o código pós-Onda 1.
5. Reprodução na tela, autenticado, da pendência de Configurações (§6).

**Documento citado que não existe:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md`. O que há é o diretório
`docs/regras-negocio/`. Não inventei conteúdo para preencher a lacuna.

---

## 1. Correções aos documentos de 11/09

Os documentos anteriores foram escritos antes da Onda 1. O que mudou:

### 1.1 Resolvido pela Onda 1 — sair do backlog

| Item de 11/09 | Situação hoje | Evidência |
|---|---|---|
| **TR-11 / AP-4 / AR-6** — `window.prompt` para motivo | **Resolvido.** Zero `window.prompt` em produção; só menções em comentários explicando o que substituiu. `MotivoOperacaoModal` no lugar. | `grep window.prompt app/**/*.tsx` → só comentários |
| **AR-1** — só os 8 primeiros títulos liquidáveis | **Resolvido.** `FinanceiroReceberExtras.tsx` foi removido no commit da Onda 1. | `D` no commit `27f35cdb` |
| **AR-3** — enum cru sem i18n | **Parcialmente resolvido.** Os rótulos agora passam por i18n (`forma_${forma.toLowerCase()}`). **Mas a origem continua hardcoded** — ver §1.3. | `ReceberTituloModal.tsx:350` |
| **CO-2 / CO-3 / CO-4** — Compras sem URL, sem ação de linha, sem vencimento | **Resolvido.** | Onda 1, item 5 |
| **AP-1 / AP-2 / AP-3 / AR-4** | **Resolvido.** Situação derivada, históricos e estorno expostos. | `HistoricoPagamentosModal`, `HistoricoRecebimentosModal`, `situacaoTitulo` |

### 1.2 Alegação que **não se sustenta** — corrigir o registro

**TR-8 dizia:** *"~950 LOC de menu morto … nenhum montado"*.

**O código diz outra coisa, e o desfecho é o mesmo por outro motivo.** A cadeia
`GerenteLayoutShell → GerenteHeaderNav → GerenteMobileNavDrawer → gerenteNavUi` **está montada**,
em `app/gerente/layout.tsx`. Só que **todas as quatro páginas sob esse layout são `redirect()`**:

| Rota | O que faz |
|---|---|
| `app/gerente/page.tsx` | `redirect(ROUTES.admin.dashboard)` |
| `app/gerente/[...path]/page.tsx` | `redirect(legacyGerenteRedirect(slug))` |
| `app/gerente/financeiro/contas-pagar/page.tsx` | `redirect(/admin/financeiro?tab=pagar)` |
| `app/gerente/estoque/imprimir-etiquetas/page.tsx` | `redirect(/admin/estoque/imprimir-etiquetas)` |

Ou seja: **1.053 LOC de navegação montados sobre rotas que só redirecionam** — o layout nunca
chega a pintar tela. O risco é o mesmo que o documento apontou (alguém "arruma o menu" ali e nada
muda), mas a descrição estava errada, e quem fosse remover confiando nela encontraria um layout
vivo e recuaria.

**TR-9 confirma-se em parte:** `estoqueHubNav.ts` só é referenciado por testes.
`catalogoHubNav.ts` **não existe mais**.

### 1.3 Alegação que ficou **pior** do que o registrado

**CX-2 / A-9 — formas de pagamento.** A tabela `formas_pagamento` (com `taxa_percentual` e
`prazo_compensacao_dias`) continua **sem uma única leitura** fora dos parâmetros de RPC de venda.
O que os documentos não apuraram: as telas não só ignoram a tabela — **elas discordam entre si**:

| Tela | Conjunto de formas |
|---|---|
| Contas a **Receber** (`ReceberTituloModal.tsx:34`) | `DINHEIRO · PIX · CARTAO_DEBITO · CARTAO_CREDITO · OUTROS` |
| Contas a **Pagar** (`PagamentoModal.tsx:30`) | `DINHEIRO · PIX · CARTAO · BOLETO · TRANSF` |

Duas listas irmãs, mesmo conceito, **vocabulários incompatíveis**, nenhum vindo do cadastro. Quem
vem do Bling — onde forma de pagamento é `Cadastros > Formas de pagamento`, uma só — encontra duas
verdades. Isso é mais grave do que "enum cru".

---

## 2. Inventário — 28 telas admin

```
auditoria · catalogo · catalogo/novo · categorias-financeiras · categorias-produtos
clientes · comissoes · compras · configuracoes · dashboard · diagnostico-caixa
estoque · estoque/entrada · estoque/importar-nfe · estoque/imprimir-etiquetas
estoque/recebimento · estoque/transferencias · financeiro · financeiro/contas-pagar
financeiro/documento/[id] · fornecedores · funcionarios · implantacao
marcas-produtos · provisionamento · relatorios · suspensao · vendas
```

`/gerente/*` não tem mais tela própria — só redirects (§1.2). `/caixa` é o PDV.

### Cobertura dos padrões, medida

| Padrão | Onde está | Onde falta |
|---|---|---|
| **Kebab de ações de linha** (`RowActionsMenu`) | Compras · Contas a Receber · Contas a Pagar | Vendas · Estoque · Catálogo · Clientes · Fornecedores · Recebimento · Transferências · Auditoria. **Funcionários tem implementação própria** (`FuncionarioRowActions.tsx`) — um quarto padrão paralelo |
| **Exportar CSV** | Catálogo · Relatórios · Caixa · Contas a Pagar | **Contas a Receber** · Estoque · Vendas · Compras · Clientes · Fornecedores · Auditoria |
| **Imprimir** | PDV (recibos, cupom) · Relatórios | OC · entrada · recebimento · recibo de pagamento · recibo de recebimento |
| **Filtros na URL** | Catálogo · Estoque · Vendas · Compras · Auditoria · Financeiro · Relatórios | **Clientes · Fornecedores** (zero leitura de `searchParams`) |
| **`ConsequenciaOperacao`** | Cancelar OC · detalhe OC · conferência NF-e · recebimento | Cancelar venda · ajuste de estoque · transferência · liquidação |
| **Histórico dentro do registro** | Conta a pagar · conta a receber · preços do produto | OC · venda · produto (demais campos) · remessa |

---

## 3. Mapa `Bling observado → Jinlong atual`

Só diferenças **comprovadas** no código de hoje. Prioridade: **P0** trava ou erra · **P1** atrito
ou desconfiança · **P2** paridade · **P3** cosmético.

| Fluxo | Estado Jinlong | Diferença UX vs. Bling | Prio | Ação |
|---|---|---|---|---|
| **Transversal** | Kebab em 3 de ~12 listas; Funcionários com padrão próprio | O Bling tem **um** gesto de linha em toda lista. Hoje o operador aprende 4 gestos diferentes | **P0** | Estender `RowActionsMenu` às listas restantes; absorver `FuncionarioRowActions` |
| **Vendas** | `/admin/vendas` só tem *Detalhes* e *Cancelar*. `VendaActionsMenu` (Ver · Imprimir · Cancelar) existe e **não é importado por ninguém** | **Quem administra a loja não consegue reimprimir um cupom.** O PDV reimprime (F12); o Admin, não | **P0** | Montar o componente órfão em `VendasTable` |
| **Financeiro** | AR e AP usam conjuntos de forma de pagamento **diferentes e hardcoded**; `formas_pagamento` 100 % ociosa | No Bling é um cadastro único. Duas listas irmãs com vocabulários incompatíveis confundem quem concilia | **P0** | Ler `formas_pagamento`; unificar o conjunto |
| **Compras** | Nenhuma impressão do pedido | O Bling imprime o pedido de compra — e por isso distingue "observação interna" de "observação impressa" | **P1** | Layout de impressão + separar as duas observações |
| **Financeiro** | Nenhum recibo de pagamento/recebimento | O PDV imprime tudo; o back-office não imprime nada. O Bling gera recibo na baixa | **P1** | Reusar os modais de recibo do PDV |
| **Transversal** | Exportar em 4 de 11 listas | O Bling exporta planilha no painel lateral de toda lista | **P1** | Estender o `downloadCsv` já existente |
| **Transversal** | Listas abrem em "todos" (`sp.status ?? 'todos'`) | O Bling abre cada lista **no que precisa de ação** (Notas = "Com pendência"; Orçamentos = "Em aberto") | **P1** | Filtro padrão por lista, removível |
| **Clientes / Fornecedores** | Zero leitura de `searchParams` | Voltar do detalhe perde o filtro. É o padrão que o resto do sistema já segue | **P1** | Levar filtros à URL |
| **Fornecedores** | Tabela com **6 colunas** (`id, cnpj, nome, created_at, updated_at, loja_id`) contra 13 de `clientes` | **Não dá para mandar um pedido de compra por e-mail a um fornecedor que não tem e-mail.** No Bling é o mesmo cadastro de cliente | **P1** | Enriquecer `fornecedores` (aditivo) — **não** fundir com `clientes` |
| **Recebimento** | Lista sem detalhe de remessa recebida | Não dá para abrir uma remessa e ver o que entrou | **P1** | Detalhe + retorno |
| **Entrada / NF-e** | Tela é "importar", não "gerenciar" | O Bling tem `Estoque > Notas fiscais de entrada` como **lista de trabalho** com situação e filtro | **P1** | Lista de notas com filtros |
| **Entrada / NF-e** | Vínculo OC ↔ NF-e **irreversível pela interface** | O Bling tem "remover o vínculo" como ação de primeira classe | **P1** | Proposta com migration — **não** improvisar |
| **PDV** | Atalhos existem e ficam escondidos atrás do F1 | O Bling **escreve o atalho no rótulo** (`Finalizar venda (Alt+E)`). O operador aprende o teclado usando o mouse | **P1** | i18n puro nos rótulos principais |
| **PDV** | Cabeçalho da coluna sem agregado | O Bling mostra `Qtde (6,00)` no próprio cabeçalho — confere o cupom sem somar de cabeça | **P2** | UI |
| **Transversal** | `atualizado_por`/`updated_at` existem e não aparecem | O Bling mostra *"Alterado em <data>, por <usuário>"* no cabeçalho do registro | **P2** | Duas linhas por tela |
| **Transversal** | Histórico dentro do registro só em AP, AR e preços | O Bling põe o histórico **dentro** do registro; a Auditoria do Jinlong é global | **P2** | Estender o padrão já criado |
| **Navegação** | "Ir para PDV" é o **último item do último grupo** | É o destino mais usado da loja | **P2** | Mover para o topo |
| **Estoque** | Etiqueta e transferência não são ação de linha | Etiquetar N produtos exige abrir N formulários | **P2** | Ação de linha |
| **Higiene** | 1.053 LOC de navegação sobre rotas só-redirect | Armadilha: alterar ali não muda nada | **P2** | Remover a cadeia inteira |
| **Transversal** | Colunas fixas em todas as listas | No Bling o operador escolhe colunas e ordem, com "Aplicar" | **P3** | UI |

---

## 4. TOP 10 — por impacto operacional para quem vem do Bling

1. **Um só gesto de ação de linha em todas as listas.** Hoje são quatro padrões. É a primeira
   coisa que um usuário de Bling procura em qualquer tela, e a que mais o desorienta.
2. **Devolver "Reimprimir cupom" ao Admin.** Não é paridade, é buraco funcional: o gerente não
   consegue reimprimir uma venda. O componente já existe, órfão.
3. **Formas de pagamento vindas do cadastro, iguais nas duas telas.** Duas listas irmãs hoje
   discordam; a tabela com taxa de cartão e prazo de compensação está parada.
4. **Imprimir o pedido de compra e os recibos financeiros.** O Bling imprime tudo; o back-office
   do Jinlong não imprime nada. Fornecedor pede pedido impresso.
5. **Exportar nas listas que faltam — a começar por Contas a Receber**, que é a irmã assimétrica
   da única lista financeira que já exporta.
6. **Filtro padrão útil por lista.** Abrir a lista no que precisa de ação economiza um clique por
   acesso, todo dia, em toda lista. Custo mínimo.
7. **Enriquecer o cadastro de fornecedor.** Seis colunas não sustentam a operação de compra —
   sem e-mail não há pedido enviado.
8. **Atalho escrito no rótulo do PDV.** i18n puro, sem tocar regra, e ensina o teclado ao
   operador — o achado de maior retorno da foto do PDV do Bling.
9. **Contexto na URL em Clientes e Fornecedores.** São as duas últimas listas que perdem filtro ao
   voltar; o resto do sistema já resolveu isso.
10. **"Alterado em, por" no cabeçalho do registro.** Os campos já existem no banco. É a menor
    mudança da lista com efeito direto na confiança de quem audita.

---

## 5. Componentes e padrões reutilizáveis

**Já existem e devem ser aplicados, não recriados:**

| Componente | Onde vive | Onde estender |
|---|---|---|
| `RowActionsMenu` | `components/ui/admin-v2/` | Todas as listas sem kebab |
| `ConsequenciaOperacao` | idem | Cancelar venda, ajuste de estoque, transferência, liquidação |
| `MotivoOperacaoModal` | idem | Qualquer captura de motivo futura |
| `SituacaoTituloBadge` + policy `situacaoTitulo` | idem + `shared-core` | Já cobre AP e AR |
| `DataTable` | `components/ui/` | Base de colunas customizáveis (P3) |
| Modais de recibo do PDV | `app/caixa/Caixa*ReciboModal.tsx` | Referência para recibo financeiro e OC |
| `downloadCsv` | Catálogo / Relatórios | Listas sem exportação |
| SSOT de rotas (`shared-core/navigation/routes.ts`) | — | Todo link novo entra aqui |

**Padrão a consolidar:** hoje "ação de linha" tem quatro implementações. Antes de estender, a
decisão é *uma* — `RowActionsMenu` — e `FuncionarioRowActions` é absorvido, não mantido em paralelo.

---

## 6. Pendência separada — Configurações / Novo Funcionário

Registrada **fora do escopo da Onda 2**, como pedido. Reproduzida na tela e diagnosticada:

**Sintoma:** ao abrir *Novo funcionário*, **duas barras atravessam o formulário** — é o cabeçalho
da tabela de funcionários pintando **por cima** do modal.

**Causa, medida no navegador:**

| Elemento | `position` | `z-index` |
|---|---|---|
| `thead` da lista | `sticky` | **1020** |
| Modal | `fixed` | **50** |

`1020 > 50` — o cabeçalho fixo ganha do modal. A origem é
`components/ui/DataTable.tsx:147`: `z-[var(--z-sticky)]` no `thead`, contra o `z-index: 50` do
modal em `app/globals.css:138`. **Escala de z-index inconsistente**, não um bug da tela de
funcionários.

**Alcance hoje:** apenas Funcionários — é a **única** lista que liga `stickyHeader`. Mas é
armadilha latente: qualquer lista que ligar a flag herda o defeito.

**Não corrigido agora**, conforme instrução. É ajuste de token de z-index, não implementação de
usuários/permissões — e não deve puxar a sprint para esse assunto.

> Sobre *"Configurações aparentemente não funciona"*: **não reproduzi**. A tela
> `/admin/configuracoes` existe; sem um sintoma específico não classifico. Precisa de um relato do
> que foi tentado.

---

## 7. Sequência de implementação proposta

Ondas pequenas, cada uma fechável e verificável. **Nenhuma exige migration**, exceto onde marcado.

| Onda | Conteúdo | Custo | Migration |
|---|---|---|---|
| **2.1 — o gesto único** | `RowActionsMenu` nas listas restantes; absorver `FuncionarioRowActions`; montar `VendaActionsMenu` e devolver a reimpressão | UI | não |
| **2.2 — tirar o trabalho de dentro do sistema** | Exportar nas listas que faltam; imprimir OC; recibo de pagamento e de recebimento | UI + action | não |
| **2.3 — atrito diário** | Filtro padrão útil; contexto na URL em Clientes/Fornecedores; "alterado em/por"; "Ir para PDV" ao topo | UI | não |
| **2.4 — cadastro de apoio** | Formas de pagamento vindas de `formas_pagamento`, unificadas AP/AR; enriquecer `fornecedores` | UI + action | **sim** (colunas de fornecedor, aditivas) |
| **2.5 — PDV** | Atalho no rótulo; agregado no cabeçalho da coluna; limpar desconto | UI (i18n) | não |
| **2.6 — higiene** | Remover os 1.053 LOC de navegação só-redirect e o `estoqueHubNav` órfão | — | não |

**Propostas formais, fora de implementação até decisão:** desvincular OC ↔ NF-e (NF-1),
parcelamento na compra (CO-1), vínculo por item (NF-2), lista de notas de entrada (NF-3).

---

## 8. O que este diagnóstico deixou de fora, de propósito

- **Tudo marcado `[NÃO OBSERVADO]`** nas auditorias do Bling — sem gabarito, não há paridade a
  perseguir.
- **Cadastro de produto em abas** — divergência deliberada e documentada, com Recovery Guard.
- **Fundir clientes e fornecedores** — a recomendação registrada é enriquecer, não fundir; é a
  única decisão que cabe ao dono.
- **Preço unitário editável no PDV** — copiá-lo derrubaria o controle de desconto por token.
- **Multi-depósito, grade/kit, listas de preço, DF-e SEFAZ** — mudanças de modelo, não de UX.
- **Qualquer coisa da Onda 1** — não há evidência de regressão; a base está congelada em
  `27f35cdb`.

---

---

## 9. Resultado da implementação — 2026-09-12

Autorizados e implementados **quatro** itens. O restante do TOP 10 **não foi tocado**.

### 9.1 Ações de linha padronizadas

`RowActionsMenu` passou de 3 para **7 listas**: Compras · Contas a Pagar · Contas a Receber ·
**Vendas** · **Estoque** · **Funcionários** · **Fornecedores**.

O quarto padrão paralelo acabou: `FuncionarioRowActions` deixou de ser uma dupla de botões com
rótulo e virou casca fina sobre o componente padrão. **A autorização não mudou** —
`motivoBloqueioEditar` / `motivoBloqueioToggle` seguem a única fonte do que pode ou não. Mudou para
melhor: quem não tinha permissão via só o texto *"somente leitura"*; agora vê a ação desabilitada
**com o motivo** (*"Contas Dono e Admin não são editadas nesta tela"*, *"Você não pode desativar a
própria conta"*), confirmado na tela.

`VendaActionsMenu` (107 LOC órfãs) foi **removido**: o cabeçalho do `RowActionsMenu` já declarava
que o substituía, e seu "imprimir" era link para `/gerente/vendas/{id}` — hoje rota de redirect,
ou seja, não imprimia nada.

**Não convertido:** Catálogo. Suas ações delegam a `CatalogoPublicacaoActions`, um controle com
máquina de estado de publicação — entrar nessa lógica seria redesenho, não padronização.

### 9.2 Reimpressão de cupom no Admin

`Vendas → ⋮ → Reimprimir cupom` abre `CupomVendaModal`, que monta o cupom a partir do detalhe que
a tela já carregava e imprime pelo **mesmo mecanismo do PDV** — iframe oculto mais a folha de
estilo do cupom —, extraído para `lib/print/printNode.ts`. Nenhum segundo sistema de impressão.

Três decisões deliberadas:

- **Sem impressora térmica.** A térmica pertence ao terminal de caixa (`useThermalPrinter` fala com
  o hardware daquela estação). Oferecer o botão no Admin prometeria o que não se cumpre.
- **Sai marcado como 2ª via**, e venda cancelada leva o aviso no papel: cupom reimpresso não pode
  passar por comprovante original de venda que não existe mais.
- **Venda cancelada continua reimprimível** — é o papel que acompanha a devolução.

Os três modais de recibo do PDV **seguem com a cópia local deles**: unificá-los exige QA de
impressora térmica, e não se mexe no caixa de passagem. Registrado em §9.6.

### 9.3 Formas de pagamento — fonte única

> **CORRIGIDO NA §10.** A premissa desta seção — de que o `CARTAO` do Contas a Pagar era
> divergência a alinhar — estava **errada**. Era diferença legítima de domínio, e a tentativa de
> alinhamento fez a tela oferecer formas que a RPC do AP recusa. Leia a §10 antes desta.

A divergência era **do banco**, não só da tela. O vocabulário canônico já era
`DINHEIRO | PIX | CARTAO_DEBITO | CARTAO_CREDITO` (`vendas`, `vendas_pagamentos`, `devolucoes`,
`liquidacoes_receber`); quem destoava era `contas_pagar_pagamentos`, com `CARTAO | BOLETO | TRANSF`.

`formas_pagamento` virou o catálogo único, com uma coluna `escopo`. **Unificar a fonte não é
achatar a oferta:** `BOLETO` e `TRANSF` estão em uso real no AP e são formas legítimas de pagar
fornecedor — ninguém recebe venda de balcão em boleto.

| | Antes | Depois (do catálogo) |
|---|---|---|
| **A Receber** | Dinheiro · PIX · Cartão de débito · Cartão de crédito · Outros | **iguais** |
| **A Pagar** | Dinheiro · PIX · **Cartão** · Boleto · Transferência | Dinheiro · PIX · **Cartão de débito · Cartão de crédito** · Boleto · Transferência |

As quatro formas do piloto aparecem **idênticas e na mesma ordem** nos dois lados.

**Migration `20260912120000`, toda aditiva:** coluna com default, linhas para formas que já eram
usadas, e o CHECK do AP **alargado** — `CARTAO` continua válido porque há histórico gravado.
Nenhuma RPC alterada. **PDV intacto**: escreve em `vendas`/`vendas_pagamentos`, cujos CHECKs não
foram tocados; verificado na tela, com os atalhos `Dinheiro 1 · PIX 2 · Crédito 3 · Débito 4`
preservados.

O leitor tem **fallback para o conjunto canônico**: catálogo indisponível não pode impedir alguém
de registrar um pagamento, e o CHECK do banco segue sendo a autoridade sobre o que entra.

### 9.4 O cabeçalho que atravessava o modal

A causa raiz era **dupla**, e a §6 acertou metade: o `thead` usava `--z-sticky` (1020), mas o modal
**não** estava em `globals.css:138` — aquilo é o skip-link. O modal é `DragonModal.tsx:157`, com
`z-50` do Tailwind: número solto, fora da escala.

A escala de tokens (`styles/tokens/z-index.css`) já existia e estava correta — ninguém a usava.
Duas linhas:

| Elemento | Antes | Depois |
|---|---|---|
| `thead` sticky (`DataTable`) | `--z-sticky` (1020) | **`--z-raised` (10)** — cabeçalho de tabela só precisa cobrir as próprias linhas |
| Overlay (`DragonModal`) | `z-50` | **`--z-modal` (1050)** |

Com o `thead` em 10, as outras 14 superfícies que ainda usam `z-50` passaram a vencê-lo sem que eu
precisasse tocar em nenhuma delas — correção mínima, classe inteira resolvida.

Verificado na tela, desktop e 375 px: `elementFromPoint` na área de sobreposição devolve elemento
**dentro do modal**; dropdown idem; 0 px de overflow.

### 9.5 Validação

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | **0 erros** |
| ESLint (`app`, `components`, `lib`) | **0 erros** |
| Vitest — suíte completa | **1.394 passando**, 1 skip, **0 falhas** (231 arquivos) |
| Testes novos | 4 (ações de linha + reimpressão) · 2 (camada do `DataTable`) · 1 (camada do `DragonModal`) · 6 critérios SQL da migration |
| Paridade i18n pt × zh | **0 assimetrias**, 3.061 chaves em cada |
| QA desktop | ações de linha, reimpressão, formas nos dois lados, modal e dropdown sobre `DataTable` |
| QA 375 px | modal dentro da tela, dropdown alcançável, **0 px de overflow** |
| Console | limpo, exceto um aviso pré-existente (§9.6) |

**Três falhas encontradas e atribuídas por bissecção** (`git stash` sobre o estado da Onda 1):

- Duas **já vinham quebradas da Onda 1** — `consolidacao-post-audit` e `p0-roteiro-operacional`
  liam `FinanceiroReceberExtras.tsx`, arquivo que a própria Onda 1 apagou. Ao fechá-la rodei só as
  suítes do escopo, não `tests/`, e não peguei. Asserções atualizadas para os dois modais que
  herdaram a capacidade; o contrato é o mesmo.
- Uma **era minha**: `admin-v2-ui-hardening` recusa cor sólida em `app/admin`, e a prévia do cupom
  usava fundo branco fixo. Corrigido para tokens do tema — papel branco quem garante é a folha de
  impressão.

> Os testes de integração de produtos falham quando apontados ao Supabase **remoto** do
> `.env.local` e passam contra o banco local. É o mesmo achado de ambiente da Onda 1 — segue sem o
> script `dev:local`.

### 9.6 Registrado, não corrigido — sem abrir frente

| Achado | Onde |
|---|---|
| `ConfirmActionButton` usa `globalThis.confirm` nativo — mesma classe do `window.prompt` que a Onda 1 removeu. O gesto foi padronizado; o mecanismo de confirmação foi **preservado como estava** | `components/gerente/ConfirmActionButton.tsx` |
| Aviso React *"unique key prop"* em `FinanceiroContent` — **pré-existente**, anterior a esta frente | `app/admin/financeiro/_components/FinanceiroContent.tsx` |
| Os 3 modais de recibo do PDV duplicam o mecanismo agora extraído em `printNode` | `app/caixa/Caixa*ReciboModal.tsx` |
| 14 superfícies ainda com `z-50` solto em vez dos tokens | vários |
| **QA ao vivo da reimpressão não rodou contra venda real**: o banco de seed tem **zero vendas**, e a RPC canônica recusou a venda sintética com `VENDA_TOTAIS_PRECO_INVALIDO` — o motor de preços funcionando como deve. **Não burlei a RPC para fabricar dado.** A ligação está coberta por 4 testes de comportamento; falta ver o papel sair de uma venda de verdade | — |

**Não iniciado** (fora da autorização): itens 4 a 10 do TOP 10 — imprimir OC e recibos financeiros,
exportar nas listas que faltam, filtro padrão útil, contexto na URL em Clientes/Fornecedores,
enriquecer o cadastro de fornecedor, atalho no rótulo do PDV, "alterado em/por".
---

## 10. Correção — o AP não era divergência, era domínio (2026-09-12)

Auditoria independente do Codex sobre `b6aca9ce` encontrou um **P1** que eu introduzi. Está certo,
e a causa é um erro de julgamento meu, não um detalhe de implementação.

### 10.1 O que eu errei

A §9.3 acima diz que `CARTAO`, no Contas a Pagar, "destoava" do vocabulário canônico. **Está
errado.** Não era divergência: é diferença legítima de domínio.

- Em **venda**, débito × crédito importa: define taxa de adquirente e prazo de compensação do
  dinheiro que **entra**.
- Em **pagamento a fornecedor**, o dinheiro **sai**. Não há adquirente nem compensação a receber.
  `CARTAO` basta — e é o que a operação usa.

Procurei regra documentada autorizando débito/crédito para quitar obrigação de fornecedor: **não
existe nenhuma**, em código ou documentação. A única origem da ideia era o meu próprio diagnóstico.
Uniformizar catálogo não é uniformizar domínio.

### 10.2 O estrago, em duas direções

| # | Efeito |
|---|---|
| 1 | A tela passou a oferecer `CARTAO_DEBITO`/`CARTAO_CREDITO`, que a RPC `registrar_pagamento_contas_pagar` **recusa** com `PAGAMENTO_FORMA_INVALIDA` — ela valida o próprio conjunto, independente do CHECK da tabela |
| 2 | **`CARTAO` sumiu da oferta** — forma legítima e anterior — porque o catálogo nunca teve essa linha |

### 10.3 Por que os testes não pegaram

O teste SQL que escrevi fazia `INSERT` direto em `contas_pagar_pagamentos` e passava **enquanto a
tela quebrava**. Testei a camada errada: alarguei o CHECK da tabela e tratei isso como prova, sem
exercitar a RPC — que é o caminho real de escrita e tem guarda própria. A falha é de método, e é a
mesma classe do que aconteceu ao fechar a Onda 1 (rodar só o escopo, não a suíte inteira).

O teste agora passa **pela RPC**.

### 10.4 O que foi corrigido

**Migration `20260912140000`**, corretiva:

1. **Desfaz o alargamento** do CHECK de `contas_pagar_pagamentos`, de volta a
   `DINHEIRO · PIX · CARTAO · BOLETO · TRANSF`. Estreitar é seguro aqui e só aqui: verificado que
   **zero linhas** usam os dois valores abertos, e a migration **aborta com mensagem** se isso
   deixar de ser verdade, em vez de destruir histórico.
2. **Devolve `CARTAO`** ao catálogo, escopo `PAGAR`.
3. Move débito e crédito de `AMBOS` para **`RECEBER`**, onde a RPC de fato os aceita.

**Código:** `FormaPagamentoPagar` volta às 5 formas; o `as FormaPagamento` que mascarava a
incompatibilidade saiu, trocado por `isFormaPagamentoPagar` + `flatMap` (o `filter().map()` não
propaga o estreitamento); o fallback do leitor volta ao conjunto do AP; as duas chaves de i18n que
ficaram órfãs foram removidas.

**A RPC não foi tocada.** Ela estava certa desde o começo — quem estava errada era a UI.

### 10.5 `escopo` fica ou vai embora?

**Fica**, e agora faz o trabalho certo. Sem ele, um catálogo compartilhado não serve dois contratos
legitimamente diferentes: ou o AP passa a oferecer `OUTROS`, ou o AR passa a oferecer `BOLETO`. A
coluna não ficou sem uso depois da correção — ela é justamente o que mantém cada tela dentro do seu
próprio contrato. O catálogo hoje espelha as duas RPCs, e o teste falha se deixar de espelhar.

| Escopo | Formas | Contrato espelhado |
|---|---|---|
| `AMBOS` | DINHEIRO · PIX | ambas |
| `PAGAR` | CARTAO · BOLETO · TRANSF | `registrar_pagamento_contas_pagar` |
| `RECEBER` | CARTAO_DEBITO · CARTAO_CREDITO · OUTROS | `registrar_liquidacao_receber` |

### 10.6 O que o AP oferece agora

**Dinheiro · PIX · Cartão · Boleto · Transferência** — exatamente o de antes da Onda 2, conferido
na tela.

### 10.7 Sobre o visual "parecido com PDV"

Apurado antes de mexer: a grade de blocos com glifo (`grid-cols-5`, ícone acima do rótulo) e o
ícone `CreditCard` do modal **são anteriores à Onda 2** — idênticos em `27f35cdb`. Esta frente não
criou nenhum elemento visual de PDV, nem campo algum para acomodar débito/crédito.

O que a Onda 2 de fato acrescentou de "cara de maquininha" foi ter **duas bandeiras de cartão** na
fileira. Isso saiu com a correção: voltou a ser um bloco só, `Cartão`.

Redesenhar a grade pré-existente seria mudança de UX fora do que esta correção pede — e na direção
oposta à instrução de não refatorar. **Fica como decisão sua**, com o custo declarado: trocar os
blocos por um `select` financeiro é mudança pequena e contida, se você quiser.

### 10.8 Validação

| Verificação | Resultado |
|---|---|
| Teste SQL **pela RPC do AP** | `DINHEIRO`* · `PIX` · `CARTAO` · `BOLETO` · `TRANSF` aceitos; `CARTAO_DEBITO` e `CARTAO_CREDITO` **recusados** com `PAGAMENTO_FORMA_INVALIDA` |
| Histórico | `BOLETO`, `PIX`, `TRANSF` gravados continuam válidos sob o CHECK restaurado |
| Catálogo × RPCs | espelho exato, asserção no teste |
| Cast mascarando tipo | **nenhum** no caminho do AP |
| `tsc --noEmit` · ESLint | **0 erros** |
| Suíte completa | **1.396 passando**, 3 skips, 0 falhas |
| i18n pt × zh | **0 assimetrias**, 3.059 chaves |
| PDV | intacto — nenhum arquivo de `app/caixa` tocado; `vendas`/`vendas_pagamentos` sem alteração |

\* `DINHEIRO` é sangria: o dinheiro sai do caixa físico. No seed ele para em
`MOV_CAIXA_SALDO_INSUFICIENTE` — regra de caixa funcionando. O teste afirma o que importa aqui:
**nenhuma forma oferecida pela tela é recusada por ser a forma**.

### 10.9 Fechamento — a mesma guarda no Contas a Receber

Ao revalidar o P1 apareceu a **irmã do mesmo defeito**, e ela foi introduzida pela Onda 2:

- **antes:** o AR tinha `const FORMAS = [...] as const` — lista fechada, incapaz de divergir da RPC;
- **depois:** passou a ler o catálogo (mutável) e a confiar num `as FormaPagamentoReceber`.

Hoje o catálogo casa com a RPC, então nada quebrava — mas era exatamente o buraco que no AP virou
o P1. Fechado com a guarda simétrica (`isFormaPagamentoReceber` + `flatMap`). **Não há mais
nenhum cast de forma de pagamento no financeiro**, dos dois lados.

Verificado que a propagação do clique não regrediu nas listas convertidas: `RowActionsMenu` já
para o evento no gatilho e no menu, e nenhuma linha abre por engano ao usar o kebab.

### 10.10 Pendente da auditoria do Codex

Os **P2** não foram tocados, conforme instruído. Seguem para uma próxima passagem.
