# PDV_PERFORMANCE_UX_AUDIT — Performance e UX do Caixa

> Fase 6 da missão Go-Live Jinlong. Data: 2026-07-12.
> Avaliação estática. **Sem mudança de design** e sem alteração de código nesta
> fase. Prioridade: PDV. Recomendações são para decisão posterior.

## Sinais medidos (código)

| Sinal | Observação | Veredito |
|---|---|---|
| **Polling / timers** | Nenhum `setInterval` de polling. Só um `setTimeout(focarCampoBusca, 3000)` (refoco do campo) e o timeout de finalização (`FINALIZACAO_TIMEOUT_MS`). | ✅ sem chamadas em loop desperdiçando rede |
| **`useEffect` em `CaixaPageClient`** | Apenas 4 efeitos. Cargas sob demanda (status do caixa, em espera), não em intervalo. | ✅ enxuto |
| **Chamadas duplicadas** | Histórico rebusca lista ao abrir e detalhe ao selecionar (correto). `recarregarStatusCaixa` chamado após cada ação de caixa (abrir/fechar/movimentação) — coerente, não duplicado. | ✅ |
| **Preço autoritativo** | Recalculado no servidor na finalização — 1 ida extra ao servidor, mas necessária por segurança. | ✅ trade-off correto |
| **Tamanho do componente** | `CaixaPageClient.tsx` = **1641 linhas**, client component monolítico. | ⚠️ manutenção/bundle |
| **Code-splitting de modais** | `CaixaHistoricoSheet`, `CaixaReciboModal`, `CaixaGerenteModal`, `CaixaMovimentacaoModal` são **importados estaticamente** (sem `next/dynamic`). | ⚠️ JS inicial maior que o necessário |
| **Latência de troca de página** | Navegação gerente/admin usa Server Components com fetch por rota; sem prefetch agressivo observado. | ⚠️ avaliar em produção |

## Achados por critério da missão

- **Delay na troca de páginas:** não mensurável estaticamente. As telas do gestor
  são Server Components com consultas por rota (`dashboard_gerente_resumo`,
  relatórios). Recomenda-se medir com dados reais (ver "Como medir").
- **Loading excessivo:** o caixa mostra estados de carregamento pontuais
  (`m.comum.carregando`) no histórico e status — adequado, não excessivo.
- **Chamadas duplicadas:** não encontradas no fluxo de venda. As recargas de status
  são disparadas por ação do usuário, não em background.
- **Queries lentas:** fora de escopo estático. Existem migrations de índices e
  análise de custo (`ANALISE_INDICES_COSTO_BENEFICIO.md`) — sinal de que o tema já
  foi tratado no backend. `get_advisors` do Supabase pode confirmar índices
  faltantes em produção.
- **Componentes pesados:** `CaixaPageClient` (1641 linhas) concentra estado de
  carrinho, pagamento, caixa, histórico e modais. Não é bug de runtime, mas é o
  maior candidato a otimização de bundle e manutenção.

## Recomendações (não executadas — exigem mudança de código/decisão)

Prioridade **PDV primeiro**, todas de baixo risco e reversíveis:

1. **Lazy-load dos modais** com `next/dynamic` (`CaixaHistoricoSheet`,
   `CaixaReciboModal`, `CaixaGerenteModal`, `CaixaMovimentacaoModal`). Reduz o JS
   do primeiro paint da tela de venda sem mudar o design. **Maior ganho/menor risco.**
2. **Extrair hooks** de `CaixaPageClient` (carrinho, pagamento, caixa) para reduzir
   o tamanho do componente — ganho de manutenção; neutro em runtime.
3. **Medir em produção** com dados reais antes de otimizar queries: rodar
   `get_advisors` (Supabase) e observar `dashboard_gerente_resumo` e relatórios.
4. **Prefetch** de rotas do gestor mais usadas (Next `<Link prefetch>`), se a
   troca de página se mostrar lenta na medição.

> Nenhuma dessas recomendações foi aplicada: a Fase 6 é diagnóstica e a missão
> proíbe mudança de design e feature nova. São candidatas a um PR separado
> pós-go-live.

## Como medir (runbook rápido)

- **Bundle:** `npm run build` em `pdv-importados` e inspecionar o tamanho das rotas
  `/caixa` no output do Next.
- **Runtime:** DevTools → Performance ao adicionar item e finalizar venda; observar
  long tasks.
- **DB:** Supabase `get_advisors` (índices/segurança) e `get_logs` para queries
  lentas.

## Conclusão da Fase 6

Nenhum problema de performance **bloqueante** para o go-live. O fluxo de venda não
faz polling nem chamadas duplicadas. As oportunidades são de **otimização de bundle**
(lazy-load de modais) e **manutenção** (quebrar o componente monolítico) — ambas
seguras, porém fora do escopo de mudança desta missão.
