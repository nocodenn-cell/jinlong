## Resumo

<!-- Descreva o que mudou e por quê. -->

## Checklist

- [ ] **Segredos:** não inclui `.env`, `.env.local` nem chaves reais; apenas `.env.example` com placeholders quando aplicável.
- [ ] **Supabase:** migrations e Edge revisadas se o PR tocar `backend/supabase/`.
- [ ] **Testes:** `npm test` / `npm run lint` nos pacotes alterados quando fizer sentido.

### Migração de UI para o tema Clássico

Marque e cumpra **se** o PR migrar/criar uma tela no tema Clássico (contrato em
[`pdv-importados/docs/THEME_SYSTEM.md`](../../pdv-importados/docs/THEME_SYSTEM.md)).
Este checklist é **critério de aceite** — PR de migração não é aceito incompleto.

- [ ] Rota adicionada ao registry (`CLASSICO_ROUTES`/`MODULES` em `lib/theme/themeRegistry.ts`) e diretório incluído no `POLICED` de `scripts/theme-tokens-guard.mjs`.
- [ ] `data-theme` aplicado corretamente (via `AdminThemeScope`; verificado no DOM da rota).
- [ ] Uso exclusivo de tokens — sem hardcode de cor (`npm run guard:theme` verde).
- [ ] Charts/canvas resolvem tokens via elemento escopado `[data-theme]` (nunca `:root`).
- [ ] Validação visual contra o baseline oficial (`/admin/dashboard`).
- [ ] Nenhum acoplamento direto a valores fixos de cor.

### Pipeline operacional / caixa

Marque e cumpra **se** o PR alterar retry, replay, ACK visual, `flush`/`shutdown`, timeout, `stale_cupom`, telemetria de scan ou ownership de cupom:

- [ ] Atualizei `docs/RECONNECT_REPLAY_POLICY.md` (e o changelog §11 quando aplicável).
- [ ] Se mudou o que o operador vê ou estados de UX: atualizei `docs/VISUAL_TRANSACTION_STATES.md`.
- [ ] Se mudou fila/mutex/`ScanState`/`QueuedScan` ou `scan-pipeline-transitions.ts`: revisei `docs/CONTRATO_PIPELINE_BIP.md` e `docs/SCAN_PIPELINE_STATE_MACHINE.md`.
- [ ] Se o PR adiciona `await` / RPC / I/O no handler do bip: confirmei [`docs/SCAN_HANDLER_ASYNC_CONTRACT.md`](../../docs/SCAN_HANDLER_ASYNC_CONTRACT.md) (AbortSignal, race, sem efeitos tardios após abort).
- [ ] Adicionei ou ajustei cenário em `shared-core/src/pdv/scan-pipeline-golden.spec.ts`, `shared-core/src/pdv/scan-pipeline-invariants.spec.ts`, `shared-core/src/pdv/scan-pipeline-transitions.spec.ts` e/ou `pdv-importados/app/caixa/scan-pipeline/webCaixaScanProcess.test.ts` quando o comportamento semântico mudou.

<!-- Hook opcional: `git config core.hooksPath .githooks` na raiz do repo para bloquear commit acidental de `.env`. -->
