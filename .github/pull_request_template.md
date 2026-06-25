## Resumo

<!-- Descreva o que mudou e por quê. -->

## Checklist

- [ ] **Segredos:** não inclui `.env`, `.env.local` nem chaves reais; apenas `.env.example` com placeholders quando aplicável.
- [ ] **Supabase:** migrations e Edge revisadas se o PR tocar `backend/supabase/`.
- [ ] **Testes:** `npm test` / `npm run lint` nos pacotes alterados quando fizer sentido.

### Gate de validação (Fase 1 — não dependa do CI GitHub)

> O CI do GitHub Actions está instável por infra (runner não atribuído). Até
> ser restaurado, valide **localmente + Vercel preview**. PR de `pdv-importados`
> só entra com estes 3 itens marcados:

- [ ] **`npm run verify -w pdv-importados`** verde (= `guard:ui` + `typecheck`).
- [ ] **Build:** Vercel preview deste PR está **Ready** (verde). Vercel compila o `next build` de forma independente dos runners do Actions.
- [ ] **Design System:** UI nova entra só via `@/ui`; sem cor Tailwind hardcoded (`bg-[#...]`, `text-[#...]`) fora de `src/ui/**` — caso contrário `guard:ui` falha.

### Pipeline operacional / caixa

Marque e cumpra **se** o PR alterar retry, replay, ACK visual, `flush`/`shutdown`, timeout, `stale_cupom`, telemetria de scan ou ownership de cupom:

- [ ] Atualizei `docs/RECONNECT_REPLAY_POLICY.md` (e o changelog §11 quando aplicável).
- [ ] Se mudou o que o operador vê ou estados de UX: atualizei `docs/VISUAL_TRANSACTION_STATES.md`.
- [ ] Se mudou fila/mutex/`ScanState`/`QueuedScan` ou `scan-pipeline-transitions.ts`: revisei `docs/CONTRATO_PIPELINE_BIP.md` e `docs/SCAN_PIPELINE_STATE_MACHINE.md`.
- [ ] Se o PR adiciona `await` / RPC / I/O no handler do bip: confirmei [`docs/SCAN_HANDLER_ASYNC_CONTRACT.md`](../../docs/SCAN_HANDLER_ASYNC_CONTRACT.md) (AbortSignal, race, sem efeitos tardios após abort).
- [ ] Adicionei ou ajustei cenário em `shared-core/src/pdv/scan-pipeline-golden.spec.ts`, `shared-core/src/pdv/scan-pipeline-invariants.spec.ts`, `shared-core/src/pdv/scan-pipeline-transitions.spec.ts` e/ou `pdv-importados/app/caixa/scan-pipeline/webCaixaScanProcess.test.ts` quando o comportamento semântico mudou.

<!-- Hook opcional: `git config core.hooksPath .githooks` na raiz do repo para bloquear commit acidental de `.env`. -->
