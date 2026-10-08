## Resumo

<!-- Descreva o que mudou e por quê. -->

## Checklist

- [ ] **Segredos:** não inclui `.env`, `.env.local` nem chaves reais; apenas `.env.example` com placeholders quando aplicável.
- [ ] **Supabase:** migrations e Edge revisadas se o PR tocar `backend/supabase/`.
- [ ] **Testes:** `npm test` / `npm run lint` nos pacotes alterados quando fizer sentido.

### Governança de domínio (obrigatório se criar/alterar regra de negócio ou dado crítico)

Ref: `docs/regras-negocio/GOVERNANCA_REGRAS_NEGOCIO.md` · mapa `docs/regras-negocio/MAPA_DOMINIOS_REGRAS_NEGOCIO.md` · checklist `docs/regras-negocio/CHECKLIST_FEATURE_DOMINIO.md`

- [ ] Checklist das 13 perguntas preenchido (ou N/A: só docs/chore/UI sem regra)
- [ ] Domínio dono e fonte de verdade identificados
- [ ] Não cria segunda fonte de verdade nem regra duplicada
- [ ] Não altera outro domínio sem contrato/RPC explícito
- [ ] Consequências financeiro / fiscal / estoque tratadas no dono canônico
- [ ] Número crítico explicável (origem + regra + status) quando aplicável
- [ ] Auditoria (quem/quando/antes/depois/origem/motivo) quando mutação crítica
- [ ] Confrontado com o mapa de domínios; entity-ssot respeitado

### Design System (obrigatório se tocar UI)

Ref: `docs/architecture/DS_MIGRATION_GOVERNANCE.md`

- [ ] Usa apenas componentes do DS
- [ ] Não adiciona CSS novo em telas
- [ ] Não adiciona cores hardcoded
- [ ] Não altera regras de negócio / auth / fluxos
- [ ] Antes/depois (screenshot) anexado — telas migradas
- [ ] `tsc --noEmit` / `npm run typecheck` OK
- [ ] Smoke da tela OK
- [ ] `npm run check:ds-burndown` **passou** (dívida visual ≤ baseline — nunca sobe)
- [ ] `npm run check:ds-coverage` executado (telas % / imports DS / exclusivos por módulo → 0)

### Pipeline operacional / caixa

Marque e cumpra **se** o PR alterar retry, replay, ACK visual, `flush`/`shutdown`, timeout, `stale_cupom`, telemetria de scan ou ownership de cupom:

- [ ] Atualizei `docs/RECONNECT_REPLAY_POLICY.md` (e o changelog §11 quando aplicável).
- [ ] Se mudou o que o operador vê ou estados de UX: atualizei `docs/VISUAL_TRANSACTION_STATES.md`.
- [ ] Se mudou fila/mutex/`ScanState`/`QueuedScan` ou `scan-pipeline-transitions.ts`: revisei `docs/CONTRATO_PIPELINE_BIP.md` e `docs/SCAN_PIPELINE_STATE_MACHINE.md`.
- [ ] Se o PR adiciona `await` / RPC / I/O no handler do bip: confirmei [`docs/SCAN_HANDLER_ASYNC_CONTRACT.md`](../../docs/SCAN_HANDLER_ASYNC_CONTRACT.md) (AbortSignal, race, sem efeitos tardios após abort).
- [ ] Adicionei ou ajustei cenário em `shared-core/src/pdv/scan-pipeline-golden.spec.ts`, `shared-core/src/pdv/scan-pipeline-invariants.spec.ts`, `shared-core/src/pdv/scan-pipeline-transitions.spec.ts` e/ou `pdv-importados/app/caixa/scan-pipeline/webCaixaScanProcess.test.ts` quando o comportamento semântico mudou.

<!-- Hook opcional: `git config core.hooksPath .githooks` na raiz do repo para bloquear commit acidental de `.env`. -->
