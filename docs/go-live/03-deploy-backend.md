# 03 — Deploy do backend (Supabase)

Voltar ao [plano](00-README.md). Complementa — não substitui —
[`docs/CHECKLIST_DEPLOY_SUPABASE.md`](../CHECKLIST_DEPLOY_SUPABASE.md).

---

## 1. Estado atual: 30 migrations pendentes

Comparação feita em **2026-08-17** entre os 304 arquivos de
`backend/supabase/migrations/` e o ledger `supabase_migrations.schema_migrations` do projeto `jinlong`:

| Métrica | Valor |
|---|---|
| Arquivos no repositório | **304** |
| Rastreados em produção (por timestamp **ou** id numérico) | **274** |
| **Pendentes reais** | **30** |

> **Por que "por timestamp ou id numérico".** Uma comparação ingênua por nome de arquivo aponta 107
> divergências. A maioria é artefato de renomeação: os blocos `20260621*` e `20260731200300–202200`
> são *backports* com timestamp de migrations que produção rastreia sob id numérico (`205`–`289`).
> Elas **estão aplicadas**. Só 30 são genuinamente novas.

### 1.1 As 30 pendentes, em ordem de aplicação

**Grupo A — tombstone (1).** No-op em produção; os objetos nunca existiram lá.

```
20260810222702_retire_obsolete_venda_finance_context.sql
```

**Grupo B — remediação financeira AR/AP + comissões DB-05 (24).** 🔴 **Este é o bloco crítico.**

```
20260813231034_financial_idempotency_correlation_expand.sql
20260813232133_sale_totals_invariant.sql
20260813234233_ar_receipts_reconciliation.sql
20260814000154_ap_payments_reconciliation.sql
20260814012644_protect_cash_balance_authority.sql
20260814013015_drop_recalcular_saldo_caixa.sql
20260814013215_reconcile_offline_cash_sales.sql
20260814013447_enforce_store_scoped_receivables.sql
20260814013845_unify_online_offline_price_invariant.sql
20260814014205_offline_resolve_tipo_preco.sql
20260814015032_harden_diagnostics_and_ap_idempotency.sql
20260814090345_validate_offline_replay_payload.sql
20260814095445_auditable_ar_ap_reversals.sql
20260814105031_require_store_context_for_offline_sales.sql
20260814105520_price_band_by_actual_quantity.sql
20260814110028_commission_on_completed_sale_event.sql
20260814111243_revoke_truncate_and_cash_delete.sql
20260814114654_commission_post_sale_adjustments.sql
20260814142254_commission_net_settlement.sql
20260814142814_commission_adjustment_after_full_operation.sql
20260814151030_commission_item_snapshot.sql
20260814161500_commission_cancellation_order_independence.sql
20260814171500_commission_ledger_immutability_audit.sql
20260814180000_commission_frontend_reporting_reconciliation.sql
```

**Grupo C — catálogo de produtos (5).**

```
20260816135000_reconcilia_produtos_codigo_interno.sql
20260816140000_rls_produtos_historico_isolamento_por_loja.sql
20260816141000_criar_produto_autoria_atomica.sql
20260816142000_indices_fks_autoria_produtos.sql
20260816143000_atualizar_produto_com_faixa_atacado.sql
```

### 1.2 O que a ausência do Grupo B significa hoje

Produção roda **sem** as correções dos P0 da Issue #298. Concretamente, na produção de hoje:

- `registrar_liquidacao_receber` atualiza contas a receber **sem** efeito em caixa/fluxo (FIN-298-01);
- pagamento de contas a pagar **não** gera saída de caixa (FIN-298-02);
- comissão depende de `AFTER UPDATE OF status` e **pode não nascer** no fluxo canônico (FIN-298-03);
- cancelamento após recebimento parcial **não** estorna o já recebido (FIN-298-04).

A certificação `DB-05 CERTIFICADO` do §12 é sobre o **código da branch**. Não descreve o banco de produção.

## 2. Ordem de aplicação

A ordem é a **lexicográfica dos timestamps** — o Supabase CLI aplica assim, e a sequência já foi
validada pelo guard. Não reordenar manualmente.

```bash
npm run guard:migrations
```

## 3. Ensaio obrigatório antes de tocar produção

Como **não há staging** ([02](02-ambiente-producao.md) §1), o ensaio é local e descartável:

Todos os comandos `npx supabase` rodam a partir de **`backend/`** — é lá que está
`supabase/config.toml`. A pasta `supabase/` da raiz do monorepo não tem config e o CLI falha nela.

> ⚠️ `npx supabase db reset` **não** garante replay do zero. Se existir backup local (o
> `supabase stop` grava um por padrão), o reset **restaura o dump e aplica só o delta** — verificado
> em 2026-08-17: 30 migrations aplicadas em vez de 304. Para o ensaio valer, descartar o volume:

```bash
cd backend
npx supabase stop --no-backup
npx supabase start
```

Isso aplica as 304 migrations do zero. É a prova de que a cadeia inteira é replayável.
Conferir o ledger local:

```bash
docker exec supabase_db_fastproduct psql -U postgres -d postgres -c \
  "select count(*) from supabase_migrations.schema_migrations;"   # → 304
```

Em seguida, as suítes que rodam contra o banco local. Elas exigem as credenciais do stack local no
ambiente — sem isso falham com `Env obrigatório ausente`. Exportar a partir do `supabase status`:

```bash
eval "$(npx supabase status -o env | sed 's/^/export /')"
export SUPABASE_URL="$API_URL" POSTGRES_URL="$DB_URL"
npm run test:rls-scope             -w fastproduct-backend
npm run test:financial             -w fastproduct-backend
npm run test:financial-concurrency -w fastproduct-backend
npm run check:types-drift          -w fastproduct-backend
```

Referência: `test:rls-scope` **42/42** — reproduzido em 2026-08-17.

> 🟠 **`test:financial` 6/6 não é reproduzível a partir de um `db reset` limpo.**
> `backend/supabase/config.toml` aponta `db.seed.sql_paths = ["./seed.sql"]`, mas
> **`supabase/seed.sql` não existe no repositório** — o reset avisa `no files matched pattern`.
> As fixtures financeiras exigem uma loja que tenha, ao mesmo tempo, produto precificado com
> `preco_custo` e margem 50–100%, estoque positivo, caixa aberto, formas de pagamento
> parametrizadas (migration `302_f1_05`) e usuários ativos de perfil GERENTE + OPERADOR + DONO.
> Nenhuma loja satisfaz isso após `db reset` + `test:rls-scope`: os produtos demo ficam na
> **Matriz** e o `test:rls-scope` cria usuários e caixas numa **"Loja Teste RLS" sem produtos**.
>
> Com fixture mínima semeada à mão, 4 das 6 suítes passam — incluindo
> `ar-receipts-reconciliation`, `ap-payments-reconciliation` (os P0 FIN-298-01/02) e
> `test-commission-concurrency` (6 cenários). As 2 restantes continuam bloqueadas por fixture:
> `sale-totals-invariant` (`FORMA_PAGAMENTO_INVALIDA`) e `financial-adversarial-gates` (`GATE19`).
>
> **Enquanto `supabase/seed.sql` não existir, este gate não pode ser tratado como verde.**
> Ou o seed é criado, ou o critério de saída registra explicitamente o que ficou sem cobertura.

## 4. Validação do HUMAN_GATE

O arquivo de gates humanos existe e está **vazio**:

```bash
cat backend/supabase/migration-human-gates.json
# → { "gates": [] }
```

`gates: []` significa **nenhuma migration exige aprovação humana explícita** neste momento. Se o
arquivo tiver qualquer entrada, **pare** e resolva antes de aplicar.

Status geral de migrations:

```bash
npm run test:migration-status -w fastproduct-backend
```

## 5. Verificação da tombstone `venda_finance_context`

Existe verificação dedicada no workspace do backend:

```bash
npm run check:venda-finance-context-retirement -w fastproduct-backend
npm run test:venda-finance-context-retirement  -w fastproduct-backend
```

Confirmação de que o repositório está no estado correto:

```bash
# deve retornar VAZIO — a reaplicação foi aposentada
ls backend/supabase/migrations/ | grep 20260808130200

# deve retornar o arquivo — a tombstone é a convergência oficial
ls backend/supabase/migrations/ | grep 20260810222702
```

> ⛔ **Não reaplicar `20260808130200` manualmente, em nenhum ambiente.** Decisão formalizada em
> [ADR-012](../adr/ADR-012-aposentadoria-venda-finance-context.md); histórico completo em
> [`RECONCILIACAO_venda_finance_context_2026-08-13.md`](../RECONCILIACAO_venda_finance_context_2026-08-13.md).
> A linha `252` do ledger **não deve ser reparada**.

## 6. Aplicação em produção

> 🔴 **Só executar dentro da janela coordenada** de [07-go-live-day.md](07-go-live-day.md).
> Aplicar o Grupo B com a aplicação antiga no ar coloca AR/AP em **falha fechada** (§11.6 do
> relatório): as chamadas antigas passam a ser rejeitadas e nada é gravado.

### 6.1 🔴 `db push` sozinho NÃO funciona — o ledger precisa ser reconciliado antes

Verificado em 2026-08-17 contra o projeto `jinlong` com `npx supabase db push --linked --dry-run`:

```text
LegacyDbPushMissingLocalError: Remote migration versions not found in local migrations directory.
```

O comando **aborta e não aplica nada**. Motivo: as 30 pendentes do §1.1 são o resultado de uma
comparação *semântica* (timestamp **ou** id numérico). O CLI compara apenas a **string da versão**,
e para ele o estado é outro:

| Visão | Pendentes | Como conta |
|---|---|---|
| Semântica (§1, `p0-migration-status.mjs`) | **30** | timestamp **ou** id numérico equivalente |
| Mecânica (Supabase CLI) | **107** | string exata da versão |

A diferença são **77 backports** (`20260621*`, `202607102123[123]0`, `20260731200300–202200`) que
produção rastreia sob os ids numéricos `205–289` / `24701–24703`. O repositório os renomeou para
timestamp; o ledger de produção não acompanhou. Sobram **73 versões numéricas órfãs** no ledger sem
arquivo local — e é exatamente isso que o CLI recusa.

> ⛔ **Não seguir a sugestão que o próprio CLI imprime.** Ele sugere
> `migration repair --status reverted 205 … 289` **seguido de `supabase db pull`**. Aplicar só a
> primeira metade apaga 73 linhas de histórico e faz o `db push` seguinte tentar **reexecutar os 77
> backports**, incluindo `20260621005000` (ex-`252`), que **recria `venda_finance_context`** —
> violação direta da [ADR-012](../adr/ADR-012-aposentadoria-venda-finance-context.md).

### 6.2 Sequência correta

**Passo 0 — backup do banco de produção.** Sem backup, não prosseguir: os passos 1 e 2 mutam
`supabase_migrations.schema_migrations`.

**Passo 1 — retirar as 73 versões numéricas órfãs do ledger.** Elas não somem do banco: os objetos
que criaram continuam lá. Some apenas o *registro* sob o id antigo, que é substituído no passo 2.

```bash
npx supabase migration repair --linked --status reverted 205 206 207 208 209 210 211 212 213 214 215 216 217 218 219 220 221 222 223 224 225 226 227 229 230 232 233 234 235 236 237 238 239 240 241 242 243 245 246 24701 24702 24703 249 250 251 252 253 254 255 256 258 268 269 270 271 272 273 274 275 276 277 278 279 280 281 282 283 284 285 286 287 288 289
```

**Passo 2 — registrar os 77 backports sob o timestamp canônico**, marcando-os como aplicados **sem
executar SQL** (eles já estão aplicados desde antes; só mudam de identificador):

```bash
npx supabase migration repair --linked --status applied 20260621000100 20260621000200 20260621000300 20260621000400 20260621000500 20260621000600 20260621000700 20260621000800 20260621000900 20260621001000 20260621001100 20260621001200 20260621001300 20260621001400 20260621001500 20260621001600 20260621001700 20260621001800 20260621001900 20260621002000 20260621002100 20260621002200 20260621002300 20260621002400 20260621002500 20260621002600 20260621002700 20260621002800 20260621002900 20260621003000 20260621003100 20260621003200 20260621003300 20260621003400 20260621003500 20260621003600 20260621003700 20260621003800 20260621003900 20260621004000 20260621004100 20260621004200 20260621004500 20260621004600 20260621004700 20260621004800 20260621004900 20260621005000 20260621005100 20260621005200 20260621005300 20260621005400 20260621005500 20260621005700 20260710212310 20260710212320 20260710212330 20260731200300 20260731200400 20260731200500 20260731200600 20260731200700 20260731200800 20260731200900 20260731201000 20260731201100 20260731201200 20260731201300 20260731201400 20260731201500 20260731201600 20260731201700 20260731201800 20260731201900 20260731202000 20260731202100 20260731202200
```

Aritmética esperada: `270 − 73 + 77 = 274` — exatamente os "274 rastreados" do §1.

**Passo 3 — conferir que o CLI agora enxerga 30, e só 30.** Este `--dry-run` é o portão: se ele
listar mais de 30 versões, **abortar** e não seguir para o passo 4.

```bash
npx supabase db push --linked --dry-run
```

**Passo 4 — aplicar.** As 30 pendentes têm timestamp anterior ao maior já rastreado
(`20260816100959`), então o CLI as considera fora de ordem e exige `--include-all`. Após os passos
1–3 isso é seguro: o conjunto foi conferido e contém exatamente as 30.

```bash
npx supabase db push --linked --include-all
```

**Passo 5 — conferência.**

```bash
npx supabase migration list --linked
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/verificacao-pos-apply.sql
```

O ledger deve passar a conter as 30 versões do §1.1, totalizando **304**. O script de verificação
deve terminar com **zero linhas** na seção "Falhas".

## 7. Deploy das Edge Functions

As três funções estão ACTIVE mas com proveniência inconsistente ([02](02-ambiente-producao.md) §2).
Republicar a partir da branch fecha essa incerteza.

Validação local antes:

```bash
npm run check:edge
```

Deploy:

```bash
npx supabase functions deploy sync-outbox     --project-ref kbabmewnahysfvlybiak
npx supabase functions deploy validar-gerente --project-ref kbabmewnahysfvlybiak
npx supabase functions deploy fiscal-worker   --project-ref kbabmewnahysfvlybiak
```

Preservar `verify_jwt`: `validar-gerente` usa `true`; `sync-outbox` e `fiscal-worker` usam `false`
por autenticarem via chave própria.

### 7.1 🟠 `GL-DENO-LOCK` — risco conhecido e aberto

O relatório (§5) registra: com `--frozen`, **`fiscal-worker` passa**, mas **`sync-outbox` e
`validar-gerente` falham**; todas passam com `--no-lock`. Isso significa que o lockfile Deno não
reproduz de forma determinística as dependências dessas duas funções.

Classificado como *"corrigir em tarefa separada antes do Go-Live"* — **e continua aberto**. Com
cliente pagante, o efeito prático é que um redeploy pode resolver dependências diferentes das
testadas. Decidir explicitamente:

- **(a)** corrigir os lockfiles antes do deploy (preferível), ou
- **(b)** publicar com `--no-lock` e registrar o risco aceito por escrito.

## 8. Smoke pós-deploy

```bash
npm run smoke:rls-rest   -w fastproduct-backend
npm run smoke:sync-edge  -w pdv-local
npm run test:cors:validar-gerente -w pdv-importados
```

## 9. Checklist de saída

- [ ] `stop --no-backup` + `start` verde com as 304 migrations (ledger local = 304)
- [ ] `test:rls-scope` 42/42 · `check:types-drift` verde
- [ ] `test:financial` — decisão registrada sobre o gate (ver §3: 6/6 não é reproduzível sem seed)
- [ ] `migration-human-gates.json` com `gates: []`
- [ ] Tombstone presente, `20260808130200` ausente
- [ ] **Backup do banco de produção feito**
- [ ] `migration repair --status reverted` (73 numéricas) executado
- [ ] `migration repair --status applied` (77 backports) executado
- [ ] `db push --dry-run` lista **exatamente 30** versões
- [ ] `db push --linked --include-all` aplicado dentro da janela coordenada
- [ ] `migration list` mostra as 30 versões (total 304)
- [ ] `backend/scripts/verificacao-pos-apply.sql` com **zero** linhas em "Falhas"
- [ ] Decisão registrada sobre `GL-DENO-LOCK`
- [ ] 3 Edge Functions republicadas, `verify_jwt` preservado
- [ ] Smokes verdes

→ Próximo: [04-deploy-frontend.md](04-deploy-frontend.md)
