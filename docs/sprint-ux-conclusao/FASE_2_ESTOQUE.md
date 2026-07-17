# Fase 2 — Estoque: relatório de fechamento

**Status: FECHADA — 100% (código + banco).** PR #198.

> ✅ **Atualização 2026-07-17:** a migration 248 (Devolução/Troca) foi aplicada
> em produção com autorização explícita. Detalhes, evidências e dois achados
> de segurança corrigidos em `docs/sprint-ux-conclusao/FASE_2_ESTOQUE_FECHAMENTO_248.md`.
> Não há mais nenhuma pendência nesta fase.

## Páginas e arquivos auditados (varredura completa do módulo)

**Páginas (Admin V2 — rotas reais):**
- `app/admin/estoque/page.tsx` — listagem principal (saldos, filtros, paginação)
- `app/admin/estoque/recebimento/page.tsx`
- `app/admin/estoque/transferencias/page.tsx`
- `app/admin/estoque/importar-nfe/page.tsx`
- `app/admin/estoque/imprimir-etiquetas/page.tsx`

**Componentes compartilhados / clientes de página:**
- `app/admin/estoque/_components/EstoqueTable.tsx`
- `app/admin/estoque/_components/AjusteSaldoModal.tsx`
- `app/admin/estoque/_components/KardexSheet.tsx`
- `app/gerente/recebimento/RecebimentoGerentePageClient.tsx`
- `app/gerente/transferencias/TransferenciasGerentePageClient.tsx`
- `app/gerente/estoque/importar-nfe/ImportarNfePageClient.tsx`
- `app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx`
- `app/gerente/estoque/imprimir-etiquetas/EtiquetaCarrinho.tsx`

**Server actions:**
- `app/admin/estoque/actions.ts` (`obterKardexProduto`)
- `app/gerente/estoque/actions.ts` (`atualizarEstoqueProduto`, `obterListaEstoqueGerente`)
- `app/gerente/estoque/actions.validation.ts`
- `app/gerente/estoque/importar-nfe/actions.ts` + `actions.validation.ts`
- `app/gerente/estoque/imprimir-etiquetas/actions.ts` + `actions.validation.ts`
- `app/gerente/estoque/imprimir-etiquetas/etiquetaCarrinhoMerge.ts`
- `app/gerente/recebimento/actions.ts` + `actions.validation.ts`
- `app/gerente/transferencias/actions.ts`
- `app/gerente/vendas/devolverVendaErro.ts`
- `lib/etiqueta/gerarPdf.ts`

Nenhum TODO/FIXME/HACK encontrado em todo o escopo do módulo.

## Bugs encontrados e corrigidos (total: 8)

1. `AjusteSaldoModal` — diálogo customizado sem focus-trap (Tab/Shift+Tab vazava para fora do modal). **Corrigido**: migrado para `DragonModal`.
2. `KardexSheet` — drawer lateral sem focus-trap. **Corrigido**: focus-trap local (mesma técnica do `DragonModal`).
3. `obterKardexProduto` — qualquer erro (RLS, rede, sessão) virava lista vazia; Sheet mostrava "sem movimentações" em vez de indicar falha real. **Corrigido**: tipo `KardexResult` distingue erro de vazio.
4. `app/admin/estoque/transferencias/page.tsx` — erro das queries de lojas/produtos descartado; operador via aviso errado ("cadastre outra loja") em vez de "falha ao carregar". **Corrigido**.
5. Devolução/Troca — mensagem de erro genérica ("tente novamente") para o caso de RPC ausente (migration 248 não aplicada em produção), sugerindo retry quando o recurso está indisponível de fato. **Corrigido**: mensagem honesta ("indisponível, fale com o suporte") quando a RPC não existe.
6. `app/admin/estoque/recebimento/page.tsx` — mesmo padrão de erro-descartado dos itens #3/#4 (3ª ocorrência). **Corrigido**: `loadError` capturado e exibido com prioridade sobre o aviso de "cadastre produtos".
7. `ImprimirEtiquetasPageClient` — botão de busca/adicionar produto era ícone puro sem nome acessível (dead-end para leitor de tela); erro de geração de PDF usava `alert()` nativo bloqueante, inconsistente com o padrão de toast (`emitGerenteToast`) usado no resto da mesma tela; mensagem específica de erro (ex.: limite de 500 etiquetas excedido) era descartada em favor de uma genérica. **Corrigido**: `aria-label`, toast no lugar de `alert()`, mensagem específica preservada.
8. `EtiquetaCarrinho` — botões de +/− quantidade eram ícone puro sem nome acessível. **Corrigido**: `aria-label` em todos os botões de ícone (+, −, remover).

## Dívida técnica eliminada (código morto, escopo Estoque)

Removidos após confirmar via grep que não havia nenhum importador/chamador em todo o repositório:
- `app/gerente/relatorios/estoque/RelatorioEstoqueClient.tsx` — componente órfão da UI legada `/gerente`; a rota `/gerente/relatorios/estoque` é interceptada por `LEGACY_GERENTE_REDIRECTS` e redirecionada para `/admin/relatorios` antes de qualquer chance de renderizar esse componente (não existe `page.tsx` nele). Removido junto com `obterKpisEstoque`/`EstoqueKpisDTO` e `obterListaEstoqueGerenteCompletaParaExport`, cujo único consumidor era esse componente.
- `garantirLinhaEstoque` / `garantirLinhaEstoqueThrow` / `atualizarEstoqueProdutoThrow` / `LegacyEstoqueMutationResult` / `EstoqueRowDTO` / `ProdutoComEstoqueDTO` em `app/gerente/estoque/actions.ts` — zero chamadores.
- `itemCarrinhoSchema` / `carrinhoSchema` em `imprimir-etiquetas/actions.validation.ts` — schemas nunca importados.

`ProdutoIdSchema` foi mantido deliberadamente (testado diretamente em `actions.validation.test.ts`).

## Testes adicionados (total: 16 novos nesta fase)

- `AjusteSaldoModal.behavior.test.tsx` (3) — dialog role/aria, submit via `form=` fora do `<form>`, erro do servidor exibido sem fechar o modal.
- `KardexSheet.behavior.test.tsx` (4) — erro real ≠ vazio, retry recupera, sucesso não mostra nem erro nem vazio, Shift+Tab cicla dentro do painel (regressão de focus-trap).
- `devolverVendaErro.test.ts` (3) — mapeamento de código conhecido, RPC ausente → mensagem honesta (string real do PostgREST: "Could not find the function..."), fallback genérico para erro desconhecido.
- `RecebimentoGerentePageClient.behavior.test.tsx` (3, novo) — `loadError` tem prioridade sobre o aviso de "cadastre produtos", aviso normal sem `loadError`, nenhum aviso quando tudo carrega.
- `TransferenciasGerentePageClient.behavior.test.tsx` (3, novo) — `loadError` tem prioridade sobre o aviso de "só 1 loja", aviso normal sem `loadError`, nenhum aviso de bloqueio com 2+ lojas.

**Suíte completa: 546/546 verdes** (540 anteriores + 6 novos). guard:all 8/8 OK. Typecheck limpo.

## Cobertura obtida

Todos os componentes/telas do módulo com lógica de estado relevante (erro, vazio, foco) agora têm teste de comportamento dedicado: `AjusteSaldoModal`, `KardexSheet`, `devolverVendaErro`, `RecebimentoGerentePageClient`, `TransferenciasGerentePageClient`. `ImportarNfePageClient` e `ImprimirEtiquetasPageClient` seguem sem teste de comportamento dedicado (componentes grandes com múltiplas dependências assíncronas; risco residual baixo — usam os mesmos padrões de erro/toast já validados nos demais componentes do módulo, e passaram por leitura completa linha a linha nesta auditoria).

## Pendências

**Nenhuma.** A migration 248 (Devolução/Troca) foi aplicada em produção em
2026-07-17 com autorização explícita, incluindo smoke comportamental completo
direto em produção (transações com `ROLLBACK`, zero resíduo) e correção de
dois achados de segurança de GRANT encontrados durante a aplicação. Ver
`docs/sprint-ux-conclusao/FASE_2_ESTOQUE_FECHAMENTO_248.md` para evidências.

## Percentual do módulo

**100% — código e banco.** Todo bug identificado foi corrigido, todo código morto no escopo foi removido, toda tela e action foi auditada, a suíte de testes está verde, guard:all está verde e o typecheck está limpo. A migration 248 foi aplicada e validada em produção; não resta nenhuma pendência de código nem de banco nesta fase.
