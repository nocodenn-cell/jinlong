# Pós-OPS-02 — fases B, C e D (repo / local)

**Data:** 2026-10-08  
**Branch:** `cursor/pos-ops02-bcd-integridade-93a3`  
**Base:** `main` (`ea917430`). PR independente. Não altera o PR #485 nem os PRs #484, #448 e #446.  
**Escopo:** só repositório e Postgres local descartável. Nenhum `apply_migration`, `db push`, deploy ou workflow manual. Nenhuma conexão ao Supabase remoto.

Plano de origem: `docs/piloto-d0/PLANO_POS_OPS02_INTEGRIDADE_FINANCEIRA.md` no branch `cursor/p0-estabilizacao-jit-1966` (lido via `git show`; o arquivo não está na `main`).

---

## B — bloqueio permanente de `20261006120000`

A migration `backend/supabase/migrations/20261006120000_financeiro_contas_formas_e_painel.sql` continua no Git. O cabeçalho agora é:

```text
-- FORBIDDEN_APPLY: superseded by 20261006180000 / remote 20261006195837
```

O modelo sucessor já está no remoto como `20261006195837` (arquivo `20261006180000`). Reaplicar o `CREATE OR REPLACE` de `internal.financeiro_capturar_venda` desta versão obsoleta regride a liquidação automática de PIX e as contas operacionais.

Bloqueio:

| Peça | Onde |
|---|---|
| Deny-list | `FORBIDDEN_APPLY_DENYLIST` em `backend/scripts/forbidden-migration-apply.mjs` |
| Registro | `forbiddenApply` em `backend/supabase/migration-human-gates.json` |
| CI sem remoto | job `forbidden-migration-apply` em `.github/workflows/ci-backend-supabase.yml` |
| Guard local | `npm run guard:forbidden-migrations` (também dentro de `guard:all`) |
| Drift | `p0-migration-status.mjs` imprime `FORBIDDEN_APPLY` e sai 1 se a versão está pendente de apply, mesmo com `--warn-only` |
| Par HUMAN_GATE | recusado se `gitOnlyVersion` ou `remoteOnlyVersion` for `20261006120000` |

O arquivo não foi apagado. O `remote_ausente` dela continua drift bloqueante. Este PR não tenta fazer o check `migration-remote-drift` passar.

## C — INSERT fiscal

No Git, `20261007161220` e `20261007163200` fazem `REVOKE INSERT` em `documentos_fiscais_pendentes`. O app enfileira só por `fiscal_enfileirar_documento_venda`.

Migration nova, criada com `supabase migration new`:

`backend/supabase/migrations/20261008013613_ssot_004_drop_policy_insert_fiscal.sql`

- `DROP POLICY IF EXISTS doc_fiscal_pendentes_insert_loja`
- prova que `authenticated`/`anon` não têm `INSERT`
- não contém `GRANT INSERT`
- cabeçalho `NAO_APLICADA_REMOTAMENTE`: o replay local (`db reset`) aplica; este PR não aplica no remoto. Apply remoto só com GO da fase C3.

Isso acrescenta mais um `remote_ausente` ao drift já vermelho. Não é deny-list: a policy é defesa segura, ao contrário da `120000`.

Teste PGlite `backend/scripts/ssot-004-insert-fiscal-negativo.test.mjs` carrega a RPC real (`20260819220100`), o `REVOKE` real (`20261007163200`) e o `DROP POLICY`, e prova:

- `authenticated` e `anon` não inserem direto (`42501`)
- `anon` não executa a RPC
- `authenticated` (operador da venda) e `service_role` enfileiram

Suíte SQL `backend/scripts/ssot-004-insert-fiscal-negativo.test.sql` está no gate `test:financial` para o Postgres do Supabase local. Neste ambiente o container não subiu (ver tabela).

## D — integridade financeira (fixtures sintéticas)

`backend/scripts/integridade-financeira-pos-ops02.test.mjs` executa os corpos reais de:

- `20261001100100` (`internal.valor_sistema_dinheiro`, `sincronizar_saldo_cache`)
- `20261007180000` (valor por forma)
- `20261007190000` (`fechar_caixa_atomico` + snapshot)
- `20261007171000` (`cancelar_venda_transacional`, guard antes de `devolucoes`)

Cenários (UUIDs sintéticos, sem PII):

| Cenário | Resultado observado |
|---|---|
| Cache | abertura 50 com `saldo_atual` 999; após sync, saldo = E(c) = 50. Caixa `FECHADO` permanece 7 |
| Por forma | E(c) = 115 (50+40+20+10−5). PIX registrado = 75. DINHEIRO = E(c), métrica `E_C_AUTORIDADE`. PIX não entra no E(c) |
| Guard | OPERADOR → `CANCELAR_VENDA_SEM_PERMISSAO`. Gaveta insuficiente → `CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE`, zero linhas em `devolucoes`, venda segue `CONCLUIDA` |
| Snapshot | após cancelamento com saldo, cache = E(c) = 100. Fechamento grava DINHEIRO informado 100 e PIX informado `NULL` |

PIX automático com taxa 0 e cartão 100 com taxa 3 (líquido 97) seguem cobertos pelos testes PGlite já existentes, reexecutados nesta sessão.

Suíte SQL `backend/scripts/integridade-financeira-pos-ops02.test.sql` espelha cache, por forma, guard e snapshot no schema completo. Não rodou aqui.

## Pendência comercial `163100`

`20261007163100_ssot_003_nfe_obrigacao_duplicata.sql` permanece **INVESTIGAR / NO-GO**. Este PR não a aplica e não responde as três perguntas do plano:

1. NF-e XML sem parcelas: bloquear o confirm ou permitir entrada só física via OC/remessa?
2. Nota à vista: o operador consegue lançar 1 parcela na UI de import hoje?
3. Há volume histórico de NF-e confirmada sem AP que precise de relatório (sem backfill silencioso)?

## Testes

| Comando | Resultado | Evidência |
|---|---|---|
| `node --test scripts/forbidden-migration-apply.test.mjs scripts/p0-migration-status.test.mjs` | **PASS** 18/18 | `pass 18`, `fail 0` |
| `node scripts/forbidden-migration-apply.mjs --check-static` | **PASS** | `FORBIDDEN_APPLY OK 20261006120000 — arquivo preservado, apply/push negado.` |
| `node --test scripts/ssot-004-insert-fiscal-negativo.test.mjs` | **PASS** 4/4 | INSERT autenticado/anon negado; RPC operador e `service_role` ok |
| `node --test scripts/integridade-financeira-pos-ops02.test.mjs` | **PASS** 4/4 | E(c)=115, guard sem devolução, snapshot PIX `NULL` |
| `npx vitest run` matriz SSOT + fechamento pr-a/b + cancel perfil/valor | **PASS** 45/45 | 5 arquivos |
| `node scripts/test-financeiro-loja.mjs` | **PASS** 16/16 | inclui taxa 3% → depósito 97 |
| `node scripts/financeiro-contas-operacionais.test.mjs` | **PASS** 4/4 | PIX liquida no banco, `taxa = 0` |
| `npm run guard:all` | **PASS** | inclui `guard:forbidden-migrations` e `check:entity-ssot` OK |
| `npx tsc --noEmit -p tsconfig.typecheck.json` (`pdv-importados`) | **PASS** | exit 0 |
| `deno check` sync-outbox e validar-gerente (deno 2.2.2) | **PASS** | sem erro de tipo |
| `deno check --no-lock` fiscal-worker | **PASS** | `Check .../fiscal-worker/index.ts` |
| `npm run check:edge` (script exato, com lockfile) | **NÃO VALIDADO** | deno 2.2.2 do pacote não lê `deno.lock` v5 (`Unsupported lockfile version '5'`) |
| `deno test --no-lock --no-check --allow-net supabase/functions/_shared/` | **PASS** 3/3 | bcrypt gerente |
| `npx supabase start` e `npx supabase db start` | **NÃO VALIDADO** | overlayfs: `operation not permitted` (whiteout) e `mount ... invalid argument`. Imagens kong/studio/realtime/storage/postgres-meta não extraem neste VM |
| `backend/scripts/*.test.sql` no schema completo, inclusive as duas suítes novas | **NÃO VALIDADO** | dependem do Postgres do Supabase local, que não subiu. Não houve fallback para o remoto |
| `npm run test:financial` inteiro | **NÃO VALIDADO** | a metade SQL do runner usa o container; a metade Node nova foi executada à parte e passou |
| check `migration-remote-drift` | **NÃO VALIDADO** (e continua vermelho por drift pré-existente) | não conectei no projeto remoto. Não tentei corrigir o gate |

## Riscos que só o remoto (ou um Supabase local saudável) fecha

- `GRANT INSERT` e a policy `doc_fiscal_pendentes_insert_loja` podem ainda estar vivos em produção. O REVOKE e o `DROP POLICY` estão no Git; não foram aplicados no remoto.
- A migration `20261008013613` passa a contar como `remote_ausente` até um GO humano de apply. Não está na deny-list.
- `20261006120000` continua `remote_ausente`. Aplicá-la para “zerar” o drift é proibido e o CI agora falha com `FORBIDDEN_APPLY` mesmo em `--warn-only`.
- `163100` segue sem decisão comercial.
- As suítes `*.test.sql` novas podem falhar no job de Supabase local do CI por detalhe de fixture (sangria, `finalizar_venda`, `SET ROLE`). Não houve execução local delas.
- Operação contínua da loja segue NO-GO até backup com artifact, restore drill e smoke — fora deste PR.
