# SPRINT UX-01 — Matriz

Cada linha foi conferida no código em 2026-10-11.

## UX-01 — Limpar filtros do catálogo incompleto

- Rota: `/admin/catalogo`
- Arquivo: `app/admin/catalogo/_components/CatalogoFiltrosBar.tsx`, `components/ui/FilterBar.tsx`
- Evidência: dois `FilterBar`; o avançado usa `clearable={false}`; `clearAll` só apaga as chaves da instância.
- Causa: barras separadas sem limpar compartilhado.
- Impacto: o operador acredita ter limpado a lista e continua vendo categoria, marca, fornecedor, estoque ou imagem.
- Solução: o Limpar do catálogo remove todas as chaves de filtro e `page`.
- Risco: médio. Precisa preservar o reset de página.
- Aceite: com filtro avançado na URL, Limpar deixa a rota sem essas chaves.

## UX-02 — Busca de compras promete produto

- Rota: `/admin/compras`
- Arquivo: `app/gerente/compras/ocBusca.ts`, `src/lib/i18n/pt.json`, `zh.json`, `ComprasContent.tsx`
- Evidência: placeholder “Fornecedor, produto ou ID…”. `montarFiltroBuscaOc` usa `fornecedor_nome` e prefixo hexadecimal do UUID.
- Causa: cópia à frente da consulta.
- Impacto: busca por produto volta vazia sem explicar o motivo.
- Solução: placeholder “Fornecedor ou ID…” nos dois idiomas. `aria-label` no campo.
- Risco: baixo.
- Aceite: o texto não menciona produto. O campo tem nome acessível.

## UX-03 — Busca de fornecedores promete campos inexistentes

- Rota: `/admin/fornecedores`
- Arquivo: `app/gerente/fornecedores/actions.ts`, `fornecedorContrato.ts`
- Evidência: query `nome` e `cnpj`. `email`, `contato_pessoa` e `categoria` estão em `FORNECEDOR_COLUNAS_FANTASMA`.
- Causa: placeholder de um cadastro que o schema não tem.
- Impacto: busca por e-mail parece falha do sistema.
- Solução: placeholder “Nome ou CNPJ” em português e chinês. Sem migration.
- Risco: baixo.
- Aceite: o texto cita só nome e CNPJ.

## UX-04 — Vazio de clientes com busca oferece cadastro

- Rota: `/admin/clientes`
- Arquivo: `app/gerente/clientes/ClientesListClient.tsx`
- Evidência: `buscando` usa `actionLabel={m.clientes.novo}`. Fornecedores, no mesmo caso, oferece limpar.
- Causa: estado vazio único para lista vazia e busca sem hit.
- Impacto: risco de cadastrar cliente duplicado.
- Solução: com busca ativa, CTA limpa o termo. Sem busca, CTA continua “Novo cliente”.
- Risco: baixo.
- Aceite: busca sem resultado não abre o cadastro.

## UX-05 — Dashboard com dois atalhos iguais

- Rota: `/admin/dashboard`
- Arquivo: `app/admin/dashboard/_components/ExecutiveVisaoGeralStub.tsx`, `lib/i18n/execTexts.ts`
- Evidência: primário `view.vendas-caixas` e secundário `dash.ir_vendas` usam `executiveRelatoriosHref('vendas-caixas')`.
- Causa: atalho duplicado no menu “Mais ações”.
- Impacto: chrome repetido na visão geral.
- Solução: remover só o item secundário.
- Risco: baixo.
- Aceite: um único controle visível para essa visão. O botão primário permanece.

## UX-06 — Etiquetas e CTAs demais no catálogo

- Rota: `/admin/catalogo`
- Arquivo: `app/admin/catalogo/page.tsx`, `CatalogoHeaderActions.tsx`, `CatalogoTable.tsx`
- Evidência: link do header e aba do hub vão para `estoqueImprimirEtiquetas`. Importar, NF-e, Exportar e Cadastro rápido ficam todos visíveis. `PageActions.secondary` não é usado.
- Causa: ações secundárias renderizadas como filhas do `PageActions`.
- Impacto: cinco destinos competem com a busca.
- Solução: tirar o link solto de etiquetas. Manter Importar e Cadastro rápido. Mover NF-e e CSV para “Mais ações”. Duplicar e Excluir da linha vão para menu; Editar, etiqueta da linha e publicação ficam.
- Risco: médio. Memória muscular do botão de etiquetas no header. A aba e a linha cobrem o caminho.
- Aceite: header sem o link solto. NF-e e CSV continuam alcançáveis. Excluir ainda confirma.

## UX-07 — Entradas duplicadas no estoque

- Rota: `/admin/estoque`
- Arquivo: `app/admin/estoque/page.tsx`, `EstoqueAcoesRapidas.tsx`, `lib/navigation/hubNavLabels.ts`
- Evidência: `PageActions` aponta para `estoqueRecebimento`, igual à aba do hub.
- Causa: atalho de header depois que o hub passou a existir.
- Impacto: dois controles iguais antes da tabela.
- Solução: remover o botão do header. Aba e faixa rápida permanecem. O modal da faixa continua oferecendo NF-e e recebimento manual.
- Risco: baixo para quem usa a aba. Médio para quem usava só o botão.
- Aceite: header sem “Entradas”. A aba Recebimento/Entradas segue no hub.

## UX-08 — Visão geral no menu de relatórios

- Rota: `/admin/relatorios`
- Arquivo: `app/admin/relatorios/_components/RelatoriosContent.tsx`
- Evidência: secundário `hdr.visao_geral` aponta para o dashboard. A sidebar já tem Início.
- Causa: atalho de retorno duplicado.
- Impacto: item extra em “Mais ações”.
- Solução: remover o item. Imprimir permanece.
- Risco: baixo.
- Aceite: menu secundário sem “Visão geral”.

## UX-09 — PDV: preço da linha e foco depois do recibo

- Rota: `/caixa`
- Arquivo: `app/caixa/CaixaCartList.tsx`, `CaixaPageClient.tsx`, `CaixaSearchBar.tsx`
- Evidência: unitário e subtotal usam `text-sm`. Após `res.ok`, `setReimprimirModalAberto(true)`. O total já é `text-4xl`.
- Causa: densidade da grade. O modal é o passo de impressão (janela e térmica).
- Impacto: preço da linha difícil à distância. Depois de fechar o recibo, a próxima leitura precisa do campo de busca em foco.
- Solução: `text-base` no preço da linha. Ao fechar o recibo, foco volta à busca. O modal continua abrindo. Atalhos intactos. Crédito e débito deixam de usar o mesmo ícone. Emoji da impressora vira Lucide.
- Risco: médio no foco. Alto se o modal deixasse de abrir — isso não será feito.
- Aceite: venda concluída ainda abre o recibo. Fechar devolve o foco à busca. Preço da linha maior. Atalhos iguais.

## UX-10 — Vendas sem busca textual

- Rota: `/admin/vendas`
- Arquivo: `app/gerente/vendas/actions.ts`, `app/admin/vendas/page.tsx`, `VendasTable.tsx`
- Evidência: `VendasFiltro` só tem início, fim, status e forma. A action chama `listar_vendas_gerente`. Cancelar é botão `h-7 w-7` com ícone `Ban`. `FilterBar` está `clearable={false}`.
- Causa: filtro nasceu em período e status. A busca textual exigiria migration da RPC.
- Impacto: achar uma venda por cliente exige paginar. Cancelar depende de tooltip.
- Solução nesta sprint: limpar status e pagamento sem mexer no período. Rótulo visível em Cancelar. Estado vazio explica período, status e pagamento. Sem campo de texto.
- Risco: baixo no limpar se o período ficar de fora.
- Aceite: não existe input de busca novo. Limpar não apaga o período. Cancelar tem texto visível.

## UX-11 — Chip sem nome acessível

- Rotas: `/admin/vendas`, `/admin/caixas`, `/admin/financeiro`
- Arquivo: páginas correspondentes. O catálogo já tem `aria-label` com `catalogo_chip_remover`.
- Evidência: o “✕” é `aria-hidden` e o link não tem `aria-label`.
- Causa: padrão copiado sem o rótulo do catálogo.
- Impacto: leitor de tela não anuncia a remoção.
- Solução: `aria-label` no link, no formato do catálogo.
- Risco: baixo.
- Aceite: cada chip anuncia a remoção daquele filtro.

## UX-12 — FilterBar anuncia português no chinês

- Rota: todas que usam `FilterBar`
- Arquivo: `components/ui/FilterBar.tsx`
- Evidência: `aria-label="Filtros de busca"` e `"Limpar todos os filtros"`.
- Causa: primitivo sem props de i18n.
- Impacto: interface em chinês ainda anuncia português.
- Solução: props opcionais `ariaLabel` e `clearAriaLabel`. Default atual permanece.
- Risco: baixo.
- Aceite: chamadas antigas não mudam. Telas com idioma chinês passam as strings.

## UX-13 — Fila fiscal com emoji

- Rota: `/admin/financeiro` aba fiscal
- Arquivo: `app/admin/financeiro/_components/FinanceiroContent.tsx`, `components/ui/feedback/EmptyState.tsx`
- Evidência: `<span>🧾</span>`. `EmptyState` proíbe glifo ad hoc.
- Causa: vazio anterior ao componente canônico.
- Impacto: vazio inconsistente.
- Solução: `EmptyState` com os textos já existentes.
- Risco: baixo.
- Aceite: a aba vazia não renderiza emoji.

## UX-14 — Espaçamento do header de clientes

- Rota: `/admin/clientes`
- Arquivo: `app/admin/clientes/page.tsx`, `components/ui/admin-v2/PageHeader.tsx`
- Evidência: a página soma `mb-3 … pb-3` em cima de `mb-5 … pb-5`.
- Causa: override local.
- Impacto: ritmo diferente do fornecedor.
- Solução: remover o `className`.
- Risco: baixo.
- Aceite: o header usa só o espaçamento do componente.

## UX-15 — Dois StatusBadge

- Arquivo: `components/ui/badges.tsx` e `components/ui/admin-v2/StatusBadge.tsx`
- Evidência: um recebe `status` de venda. O outro recebe `tone` e children. O detalhe da venda importa o primeiro. Relatórios importam o segundo.
- Causa: duas migrações do design system.
- Impacto: import trocado quebra o tipo.
- Solução: renomear o de venda para `VendaStatusBadge`. O de tom permanece `StatusBadge`.
- Risco: médio, só de import.
- Aceite: `VendaDetailSheet` usa `VendaStatusBadge`. Painéis executivos continuam com `tone`.

## UX-16 — Movimentações fora do shell

- Rota: `/admin/estoque/movimentacoes`
- Arquivo: `app/admin/estoque/movimentacoes/page.tsx`
- Evidência: página compacta, links sublinhados, strings locais. Saldos usam `CrudListShell`.
- Causa: a página não migrou com o hub.
- Impacto: a aba parece outro produto.
- Solução: `PageHeader` + `CrudListShell` e chaves de i18n. Mesmos filtros de URL. Sem mudar a consulta.
- Risco: médio na cópia em chinês.
- Aceite: a rota e os query params continuam os mesmos.

## UX-17 — Status de compras com cor solta

- Rota: `/admin/compras`
- Arquivo: `app/admin/compras/_components/ComprasContent.tsx`
- Evidência: classes `bg-blue-500/20`, âmbar, esmeralda e vermelho.
- Causa: pills anteriores aos tokens de badge.
- Impacto: status que não seguem o tema.
- Solução: tokens de badge já existentes. O significado de cada status não muda.
- Risco: baixo, visual.
- Aceite: o status continua distinguível sem cor Tailwind crua.

## Preservar

- Hubs de etiquetas nos dois módulos.
- Repor, Ajuste e Kardex com rótulo na linha de estoque.
- Abertura do recibo após venda.
- `OperationalQuickActions` sem consumidor: não apagar nesta sprint.
- Atalhos do caixa, permissões, RPCs e migrations.
