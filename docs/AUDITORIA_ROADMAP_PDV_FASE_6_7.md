# Auditoria — Roadmap "Implementação do PDV (Pós Fase 5)" vs. estado real do repositório

**Data:** 2026-07-02 (revisada)
**Escopo:** verificar se a arquitetura-base que o roadmap declara como Fases 0–5 congeladas (State Machine, `PDVViewState`, `OperatorView`, Command Runtime, `useSaleState`, Event Log) existe no repositório, onde, e em que estado.

> **Correção em relação à primeira versão deste documento:** a primeira auditoria concluiu, erradamente, que nenhum desses componentes existia. O erro veio de uma causa raiz identificável, não de má-fé do roadmap: o clone local usado nessa auditoria só tinha as refs de `main` e da branch de trabalho buscadas — `git log --all` não encontrava nada porque não havia mais nada buscado, não porque o trabalho não existisse. Depois de um `git fetch origin --prune` completo (~130 branches remotas antes ausentes), a arquitetura apareceu, íntegra, na branch `claude/pdv-phase-3-design-spec-hpfrr7`. Esta versão do documento substitui a anterior.

---

## 1. Onde a arquitetura das Fases 0–5 está

**Branch:** `claude/pdv-phase-3-design-spec-hpfrr7` (remota, `origin/claude/pdv-phase-3-design-spec-hpfrr7`)
**PR:** [#128](https://github.com/nocodenn-cell/fastproduct/pull/128) — aberto, em modo draft no momento desta auditoria
**Divergência de `main`:** 10 commits à frente, a partir do merge-base `c45e17e`; **ainda não mergeada em `main`**
**Diretório da implementação:** `pdv-importados/app/caixa/operator-view/`

Commits relevantes (mais antigo → mais novo):

| Commit | Conteúdo |
|---|---|
| `ef9513e` | `docs/PDV_FASE3_STATE_MACHINE_SPEC.md` — spec formal de `PDVSaleState`/`PDVViewState`/COMMAND→STATE |
| `525ce20` | Remove `SALE_SUSPENDED` da máquina executável (mantém só o que o sistema real suporta hoje) |
| `68ac5f3` | `docs/PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md` — auditoria das RPCs reais contra o contrato-alvo + definição desse contrato |
| `542baf6` | `docs/PDV_FASE2_FRONTEND_SHELL_SPEC.md` — arquitetura do shell de UI (sem código) |
| `449e870` | Implementa `OperatorView` — shell de UI 1:1 com `PDVViewState` |
| `44f5db3` | Trava "atacado" como regra de domínio do backend, nunca modo de UI |
| `99c07f6` | Implementa `SaleStateMachine` + `useSaleState` |
| `0a9edb4` | Auditoria de vazamento da regra de atacado no frontend |
| `bc0fb20` | Implementa `CommandRuntime` — Fase 5, orquestração e efeitos |
| `c423b24` | Corrige 4 achados críticos/altos da auditoria da própria Fase 5 |

---

## 2. Revalidação de integridade — cada componente

Feita por leitura direta do conteúdo em `origin/claude/pdv-phase-3-design-spec-hpfrr7` (via `git show`) e, após o rebase desta branch sobre aquela, por execução real de `vitest` e `tsc --noEmit`.

| Componente | Arquivo | Íntegro? | Evidência |
|---|---|---|---|
| `PDVViewState` | `pdv-importados/app/caixa/operator-view/pdvViewState.ts` | ✅ | Tipo único: `saleState`, `caixaStatus`, `suspensaoGlobal`, `items`, `total`, `lastCompletedSale`, `activeError`, `allowedActions`, `primaryAction`, `lastCommand`. Não há campo calculado no frontend — tudo é dado que o backend deveria devolver. |
| `SaleStateMachine` | `.../operator-view/SaleStateMachine.ts` | ✅ | `interpretBackendSnapshot` valida o `saleState` contra o enum e congela (`Object.freeze`) o snapshot; `createSaleStateMachine` só substitui o estado inteiro em `applySnapshot`, nunca faz merge parcial. Nenhum cálculo de negócio. |
| `OperatorView` | `.../operator-view/OperatorView.tsx` | ✅ | Componente `memo`, mapeamento puro `saleState → quais dos 4 filhos (`InputScanner`/`SaleList`/`TotalPanel`/`PaymentButton`) renderizar`, sem `useState` de negócio, sem lógica de fluxo além do mapeamento documentado em `PDV_FASE2_FRONTEND_SHELL_SPEC.md` §3. |
| `CommandRuntime` | `.../operator-view/CommandRuntime.ts` | ✅ | Único ponto de execução de comando: serializa via fila lógica (`tail` promise chain), deduplica comandos idempotentes por `contextId`/payload estável, mantém `CommandLogEntry[]` (`CommandIssued`/`CommandAccepted`/`CommandRejected`/`StateTransition`) — o Event Log do roadmap, só que no lugar certo (efêmero, do lado do runtime, não recriando o que já é persistido no backend). |
| `useSaleState` | `.../operator-view/useSaleState.ts` | ✅ | Único hook: `useSyncExternalStore(machine.subscribe, machine.getState, machine.getState)` + `dispatch` que só repassa para `runtime.execute`. Sem `useState` de venda, sem inferência local. |
| Componentes-filho (`InputScanner`, `SaleList`, `TotalPanel`, `PaymentButton`) | mesma pasta | ✅ | Cada um só emite `onCommand("CMD_*", payload)` — nenhum calcula preço, desconto ou decide elegibilidade. |

**Testes:** `npx vitest run app/caixa/operator-view/` → **32/32 passando** (`SaleStateMachine.test.ts` 7, `CommandRuntime.test.ts` 13, `OperatorView.behavior.test.tsx` 9, `useSaleState.behavior.test.tsx` 3).
**Typecheck:** `npx tsc --noEmit -p tsconfig.typecheck.json` → nenhum erro em `operator-view/`.

Conclusão da revalidação: os cinco componentes citados no roadmap **existem, são coerentes entre si, obedecem às restrições do próprio roadmap** (nenhuma lógica de preço/fiscal/estoque/desconto no frontend, nenhum modo de UI paralelo) **e passam em teste e typecheck reais**.

---

## 3. O que ainda falta — por que "Fase 6" é um trabalho real, não redundante

O próprio `CommandRuntime.ts` documenta a lacuna em comentário:

> *"Adapter fornecido pelo chamador (fora do escopo desta fase — a ligação real com RPCs de Fase 1 ainda não existe)."*

Ou seja: `CommandRuntime` já foi construído para receber um `SendCommand` (`(command, payload) => Promise<PDVBackendSnapshot>`) — mas **nenhum adapter real que fale com Supabase existe ainda**, e `OperatorView`/`useSaleState`/`CommandRuntime` não estão hoje conectados a `CaixaPageClient.tsx` (o fluxo web em produção continua rodando por fora, via `actions.ts` + `supabase.rpc()` direto, como documentado em `docs/venda-golden-flow.md`).

Além disso, `docs/PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md` (já auditado nesta branch) documenta, com evidência `arquivo:linha`, que **as RPCs reais hoje não satisfazem o contrato-alvo que `SendCommand`/`PDVBackendSnapshot` presumem**:

- Abertura de caixa não tem RPC dedicada (é `INSERT` direto, com race condition TOCTOU).
- `finalizar_venda_transacional_canonica_v4`, `cancelar_venda_transacional`, `aprovar_movimentacao`, `cancelar_movimentacao` fazem `UPDATE`/`INSERT` sem `RETURNING` — não devolvem o estado final que um `PDVBackendSnapshot` exigiria.
- Convenções de erro divergentes (`MODULO_CODIGO` vs. campo sentinela lowercase vs. frase livre) — incompatível com o formato único de erro que o contrato-alvo da Fase 1 define (§4.4 daquele documento).
- Duas famílias de idempotência coexistindo (replay-sucesso vs. erro-em-replay).

Isso significa que a Fase 6 do roadmap avaliado **não é** "trocar mocks por RPCs reais" (não há mocks) — é **escrever o adapter `SendCommand` real** e, no processo, fechar (ou explicitamente contornar, documentando o desvio) os gaps que a própria Fase 1 desta branch já catalogou.

---

## 4. Conclusão

| Item do roadmap | Status confirmado |
|---|---|
| Fases 0–5 (State Machine, `PDVViewState`, `OperatorView`, `CommandRuntime`, `useSaleState`, Event Log) | **Implementadas e íntegras**, na branch `claude/pdv-phase-3-design-spec-hpfrr7` (PR #128, ainda não mergeada em `main`) |
| Fase 6 (Runtime ↔ Backend) | **Trabalho real e não trivial**: escrever o adapter `SendCommand`, fechar os gaps de contrato documentados em `PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md`, e conectar `OperatorView`/`useSaleState` ao `CaixaPageClient.tsx` real (hoje desconectados) |

A partir desta auditoria, `claude/pdv-phase-3-design-spec-hpfrr7` passa a ser tratada como a baseline arquitetural para todo o trabalho subsequente deste roadmap — nenhum componente das Fases 0–5 será recriado; o plano da Fase 6 (documento separado) parte exatamente do estado descrito aqui.
