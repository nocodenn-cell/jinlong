# Sprint Estoque — Entradas, segurança e legibilidade

Base: main `069339477cf93af9a3fb5ae48b330c912e540c4c`. Trabalho isolado em `C:/Naturecode/fastproduct-p0`.

## Jornada implementada

Abas: Saldos, Entradas, Movimentações e Transferências. A antiga rota Importar NF-e permanece compatível e destaca Entradas. Etiquetas fica acessível pelo Catálogo e por produto no saldo.

Entradas reúne documento com valores (XML ou nota manual), recebimento vinculado a pedido, entrada sem documento com valores e recebimento físico sem valores. Histórico permite buscar e paginar documentos e entregas, consultar conferências e abrir os itens da entrega. Compras direciona o recebimento para Entradas com o pedido selecionado; a conferência aceita vários produtos e recebimentos parciais. Cancelamento, encerramento com falta e histórico do pedido continuam disponíveis.

| Operação | Estoque | Pedido | Custo | Contas a pagar |
|---|---|---|---|---|
| Recebimento físico sem valores | Credita conferido | Sem vínculo | Não altera | Não gera |
| Recebimento com pedido | Credita conferido | Abate conferido | Não altera | Não gera |
| Documento / entrada com valores | Credita após confirmar | Abate se vinculado | Conforme opção e validação existente | Conforme parcelas |
| Documento associado a entrega anterior | Não credita novamente | Não abate novamente | Conforme opção e validação existente | Conforme parcelas |

## Regra oficial

**Uma entrega física = um único crédito de estoque.**

Quando o documento chega depois, o operador registra a conferência do documento e seleciona a entrega já recebida. Abrir a opção de associação bloqueia a confirmação até persistir o vínculo. O banco compara loja, status, produtos e quantidades, sob locks, na associação e novamente na confirmação. A confirmação processa custo e financeiro, sem segundo crédito nem segundo abatimento do pedido. Reenvios da associação são idempotentes; uma entrega não aceita outro documento associado.

Esta versão cobre **um documento para uma entrega física completa**, com os mesmos produtos e quantidades. Não cobre documentos parciais, várias entregas em um documento, nem nova NF-e para uma entrada manual com valores já concluída. Recebimentos antigos feitos diretamente por Compras sem remessa também não são associáveis por esse seletor. O sistema não identifica automaticamente lançamentos independentes que o operador registre como novas entregas. A tela exige a escolha explícita da entrega existente.

## Consulta e apresentação

Ordenação de saldos ocorre no servidor e preserva filtros, voltando à primeira página. Mudanças de filtro também reiniciam paginação. Movimentações consulta o Kardex unificado com pesquisa por produto/código, direção e páginas de 50 registros. O Kardex individual carrega mais registros até 1000; o link de movimentações permite continuar consultando o produto com paginação.

Falhas de Kardex e históricos aparecem como erro, com recuperação onde disponível. Saldo após cada movimento só aparece quando é comprovado pelos dados. A conferência concluída apresenta custo do documento e custo atual do catálogo; o custo atual não é apresentado como valor histórico da operação.

Em celular/tablet, os saldos usam cartões com ações visíveis. Ações possuem ícones maiores e nomes escritos; textos secundários e bordas ganharam contraste dentro de Estoque. Seletores de Entradas usam o botão padrão com texto branco no estado selecionado. Etiquetas permite digitar a quantidade e informa quando a adição por categoria atingiu o limite existente. Textos da jornada foram ajustados em PT/中文.

## Validação

Testes de componentes e serviços do estoque, recebimento, importação, compras, navegação e ligação financeira. Verificação TypeScript e lint dos arquivos alterados/novos.

As duas migrations foram executadas em PostgreSQL descartável PGlite, com fixtures sintéticas: conflitos de ajuste, mínimo isolado, zero, autorização, idempotência, cadastro inicial; documento posterior, ausência de segundo crédito/abatimento, divergência revalidada, identificação financeira e permissões. Esse ambiente não substitui um ensaio de carga com múltiplas sessões nem homologação com o schema completo de staging.

Inspeção visual em navegador de componentes reais com estilos da aplicação e respostas simuladas, no desktop e em 390px: Entradas, pedido com vários itens, versões PT/中文, cartões e etiquetas. Nenhuma gravação dessa prévia alcança um banco.

## Publicação

Migrations: `20261005224553_estoque_ajuste_concorrente.sql` e `20261005225856_entrada_documento_posterior.sql`. **Aplicadas em produção (jinlong) em 06/10/2026 via MCP** (versions remotas `20261006195639` / `20261006195805`; ver `migration-human-gates.json`). A aplicação depende da nova função de ajuste e da tabela de associação. A função antiga de ajuste rejeita clientes sem snapshot. Não usar fallback inseguro.

Os registros cadastrados pelo usuário são testes fictícios e não foram alterados, excluídos ou usados para afirmar corrupção de dados. Não houve mudança no PDV.
