# PR #411 — reversão cirúrgica da pré-carga do Caixa

Data: 2026-09-13. Branch: `perf/auth-navegacao-autenticada`.

## Escopo e inspeção anterior à intervenção

Inspecionados integralmente os diffs de `998dacbc01a24380431207d1820d5ef160f762a9` e `e9eaf5d0891c77006b416242204d12a78a790dcf`.
Na retomada, Claude já havia criado localmente os reverts `8209c321` (e9eaf5d0) e `3a2572d5` (998dacbc), ainda não enviados. Codex validou e enviou esses commits; não duplicou a reversão.

Arquivos da pré-carga, todos relativos a `pdv-importados/app/caixa/`:

| Arquivo | Resultado |
|---|---|
| `CaixaPageClient.tsx` | Retirada a prop de pré-carga e seu repasse aos hooks |
| `actions.ts` | Retirada apenas a action agregadora `carregarBootstrapCaixa` |
| `caixaBootstrapTypes.ts` | Removido o contrato exclusivo da pré-carga |
| `server/caixaBootstrap.ts` | Removida a agregação das cargas no servidor |
| `page.tsx` | Restaurada a página anterior, inclusive sua leitura de sessão/idioma |
| `hooks/useCaixaBootstrapData.ts` | Restauradas as actions pós-hidratação |
| `hooks/useCaixaStatusMovimentacoes.ts` | Restaurada a leitura inicial de status pela action |
| `hooks/useCaixaVendasEmEspera.ts` | Restaurada a carga de vendas em espera pela action |
| `hooks/useCaixaStatusMovimentacoes.preCarga.behavior.test.tsx` | Removido como parte do revert de e9eaf5d0: exercitava a API de pré-carga retirada |

Nenhum E2E, seletor, timeout, retry ou expectativa dos testes anteriores foi alterado. O teste exclusivo da implementação revertida não foi adaptado para mascarar falhas.

## Provas de isolamento

- `git diff 998dacbc^ 3a2572d5 -- pdv-importados/app/caixa`: vazio. O Caixa coincide integralmente com o pai da otimização.
- `git diff e9eaf5d0 3a2572d5`: somente os nove arquivos acima.
- Nenhuma referência a `CaixaBootstrapInicial`, `carregarBootstrapCaixa` ou `vendasEmEsperaInicial` permanece no código do aplicativo.
- Auth (`6ef407c4`), Relatórios (`03dd4c7c`), Cadastros (`3a921b6d`) e Dashboard (`ac3926f0`) não importam a pré-carga e permanecem sem alterações pelos reverts.
- Diff vazio em `backend`, `lib`, `app/admin`, `app/gerente` e `idioma` em relação a e9eaf5d0. Nenhuma migration foi editada ou aplicada manualmente, nenhum banco remoto foi alterado.

## Validação local pelo Codex

| Verificação | Resultado |
|---|---|
| TypeScript: `tsc --noEmit --incremental false -p tsconfig.typecheck.json` | PASS, exit 0 |
| ESLint: `eslint app components lib --ext .ts,.tsx` | PASS, exit 0 |
| Vitest: diretórios `app/caixa/hooks`, `app/caixa/server`, testes `sessionConsistency.test.ts` e `sessionConsistency.parallel.test.ts` | 19 arquivos, 114 testes PASS |
| Vitest: `contagemProdutosEmbutida.test.ts`, actions de categorias e marcas | 3 arquivos, 12 testes PASS |

Total: 22 arquivos, 126 testes PASS. Os testes emitiram avisos existentes de `act` em scanner/reprecificação; não houve falha. Este recorte não é a suíte completa nem prova de E2E.

## E2E e comparação

Baseline com pré-carga: [run 34731296270, e9eaf5d0](https://github.com/nocodenn-cell/fastproduct/actions/runs/34731296270).
Codex consultou os logs: build-and-test e E2E crítico passaram; e2e-playwright falhou por timeout global de 50 minutos. Há falhas em `caixa-fluxos-criticos.spec.ts` (sangria) e `caixa-pagamento-atalhos.spec.ts` (espera pelo Caixa), ocorrências de `ECONNRESET` e três reinícios por limite de memória. Uma mesma falha de conexão pode produzir várias linhas de log; contagem de linhas não representa quantidade de conexões distintas.

Comparação estrutural anterior à pré-carga: `998dacbc^` (`6ef407c4`), com diff vazio no Caixa após reversão. Isso comprova restauração de código, não estabilidade operacional.

Baseline de CI anterior à pré-carga: [PR #409, run 34465832308, cf4e67d0](https://github.com/nocodenn-cell/fastproduct/actions/runs/34465832308). Build-and-test e E2E crítico passaram; e2e-playwright já falhava. A extração dos logs de falha não encontrou falhas nas specs `caixa-*.spec.ts`, mas encontrou `ECONNRESET` e quatro reinícios por limite de memória. Portanto os resets e a instabilidade global do runner não surgiram exclusivamente com 998dacbc; não serão tratados como prova causal nem corrigidos nesta intervenção.

Reexecução da reversão: [run 34753108470, 3a2572d5](https://github.com/nocodenn-cell/fastproduct/actions/runs/34753108470), com os E2E existentes e banco efêmero do próprio CI. Concluída; não houve execução contra produção.

| Evidência | Antes: e9eaf5d0 | Depois: 3a2572d5 |
|---|---|---|
| build-and-test | PASS | PASS (6m47s), incluindo build, lint/typecheck e suíte unitária do CI |
| E2E crítico | PASS | PASS (8m53s) |
| e2e-playwright | FAIL, timeout de 50 min | FAIL, timeout de 50 min |
| Falhas registradas em `caixa-fluxos-criticos.spec.ts` e `caixa-pagamento-atalhos.spec.ts` | Sangria e espera pelo Caixa | Nenhuma ocorrência dessas specs no log de falhas |
| Erros de conexão | Múltiplos registros de ECONNRESET | Uma linha de ECONNRESET no log completo |
| Reinícios por limite de memória | 3 | 4 |

O job anunciou 110 testes com 1 worker. O timeout impediu o resumo final de testes aprovados/pulados: ausência de uma falha no log não autoriza certificar toda a suíte do Caixa. O resultado sustenta **restauração exata do caminho anterior e não reprodução das falhas de sangria/loading registradas no baseline**, mas não prova eliminação universal de regressões ou segurança operacional de todo o PR.

Persistem falhas fora do escopo em idioma/mobile, devolução/troca no Admin, transferências, importação de produtos, login e checklist de provisionamento; o log também registra interrupção de navegação no WebKit. Não foram corrigidas nem atribuídas automaticamente a Auth/Relatórios/Cadastros/Dashboard. O artefato `e2e-playwright-test-results` do run preserva o diagnóstico. Os resets e a instabilidade global já existiam no baseline pré-pré-carga.

**Decisão:** reversão cirúrgica entregue; PR permanece aberto, sem merge e sem certificação global de E2E. Interrompida qualquer ampliação de implementação. Investigar as falhas restantes exige uma etapa separada; nenhum teste, timeout ou regra de negócio foi alterado para obter aprovação.

Os erros de infraestrutura do baseline impedem atribuir todos os resets exclusivamente à pré-carga sem comparar a nova execução. Caso persistam falhas do Caixa, a investigação deve ser reportada antes de qualquer ampliação do escopo. Nenhuma alteração adicional de produto, infraestrutura ou teste faz parte desta intervenção.
