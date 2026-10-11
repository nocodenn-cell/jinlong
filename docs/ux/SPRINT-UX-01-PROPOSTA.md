# SPRINT UX-01 — Proposta aplicada

A proposta abaixo é a sequência executada. Não cria biblioteca paralela.

## Catálogo

Antes: header com Etiquetas, Importar, NF-e, Exportar e Cadastro rápido. Limpar só da barra primária. Linha com publicar, editar, etiqueta, duplicar e excluir.

Depois: header com Importar e Cadastro rápido. NF-e e Exportar em “Mais ações”. Etiquetas só na aba do hub e na linha do produto. Limpar apaga busca, status, origem e filtros avançados. Duplicar e Excluir no menu da linha. Editar, etiqueta e publicação continuam visíveis.

## Estoque

Antes: botão Entradas no header e a mesma rota na aba.

Depois: só a aba e a faixa rápida. A faixa continua abrindo o modal NF-e ou recebimento manual. Repor, Ajuste e Kardex permanecem com rótulo.

Movimentações passam a usar o mesmo `PageHeader` e `CrudListShell` dos saldos, com os mesmos parâmetros de URL.

## Dashboard e relatórios

Antes: dois controles para Vendas & Caixas. Relatórios com “Visão geral” no menu.

Depois: um botão no dashboard. Relatórios ficam com Imprimir. Início da sidebar volta à visão geral.

## Compras e fornecedores

Antes: placeholders prometiam produto, contato, e-mail e categoria.

Depois: compras diz “Fornecedor ou ID”. Fornecedores diz “Nome ou CNPJ”. A consulta não muda. Status de compras usa token de badge.

## Clientes

Antes: busca sem resultado oferecia novo cadastro. Header com espaçamento próprio.

Depois: busca sem resultado limpa o termo. Lista realmente vazia continua oferecendo novo cliente. Header no espaçamento padrão.

## Vendas

Antes: sem limpar geral de status e pagamento. Cancelar só com ícone.

Depois: Limpar remove status e pagamento e preserva o período. Cancelar tem rótulo. O vazio explica os filtros existentes.

Não entra campo de busca. Isso depende de migration em `listar_vendas_gerente`.

## PDV

Antes: preço da linha pequeno. Crédito e débito com o mesmo ícone. Emoji na impressora. Recibo abre e o foco seguinte não estava garantido na busca.

Depois: preço da linha em `text-base`. Ícones distintos para crédito e débito. Impressora em Lucide. Recibo continua abrindo. Ao fechar, o foco volta à busca. Atalhos e total `text-4xl` permanecem.

## Design system usado

`FilterBar` ganha rótulos acessíveis opcionais. `PageActions.secondary` passa a ser o lugar de NF-e, CSV, duplicar e excluir. `EmptyState` substitui o emoji fiscal. `StatusBadge` de venda vira `VendaStatusBadge`.

Não foram criados `FilterPopover`, `DataTableToolbar`, `RowActionsMenu`, `PrimaryAction` nem `ConfirmDialog`.
