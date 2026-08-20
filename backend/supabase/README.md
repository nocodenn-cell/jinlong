# Supabase (migrations + Edge Functions)

As migrations e Edge Functions do projeto ficam em `**backend/supabase/**` (pasta central de backend do monorepo), não em `pdv-local`.

**Checklist única (migrations → deploy das Edges → secrets → alinhamento web/desktop):** [../../docs/CHECKLIST_DEPLOY_SUPABASE.md](../../docs/CHECKLIST_DEPLOY_SUPABASE.md).

**Kardex (auditoria de estoque):** view `public.v_kardex_unificado` (migration `060_v_kardex_unificado.sql`) — eventos agregados a partir de `movimentos_estoque_log`, `estoque_baixas` e `estoque_reposicoes_cancelamento`.

**Baixa na venda:** usar **`decrementar_estoque_seguro`** (e RPCs de finalizar venda). Migrations **070**/**071**: a RPC legada `decrementar_estoque_idempotente` delega a `seguro` e deixa de ter `EXECUTE` para `authenticated` (mantém-se para `service_role`).

## Stack local vs projeto linkado (uma máquina)

- **`npx supabase link`:** liga o CLI ao projeto **remoto** (Reference ID). Use na pasta **`backend`** para `db push` e deploy de functions. Não substitui o Docker local.
- **`npx supabase start`:** sobe **uma** stack local (portas fixas no `config.toml`; `project_id` = `fastproduct`). Não rode dois stacks no mesmo mapa de portas — pare com `npx supabase stop --project-id fastproduct` antes de subir outro projeto, ou altere portas em **um** dos `config.toml` (incomum).
- Detalhes, tabela de portas e troubleshooting de conflito: [../README.md](../README.md) (seção *Fluxo único: stack local × projeto linkado × portas*).

## `db push` (aplicar migrations no projeto remoto)

1. Abra o terminal na pasta `**backend**` (raiz do repositório: `fastproduct/backend`).
2. **Uma vez por máquina**, vincule o projeto. O *project ref* aparece em
  Supabase Dashboard → Project Settings → General → Reference ID (~20 caracteres).  
   **Não** use o texto `SEU_PROJECT_REF` — substitua pelo valor real.

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase link --project-ref abcdefghijklmnopqrst
```

Informe a **senha do banco** quando o CLI pedir (Database password no dashboard).

1. Envie as migrations:

```powershell
npx supabase db push
```

## Erro: "Cannot find project ref. Have you run supabase link?"

- Você está na pasta errada → use `**backend**`, ou  
- Ainda não rodou `supabase link` → passo 2 acima.

## Migrations aplicadas via MCP (`apply_migration`) — versão ≠ nome do arquivo

Quando uma migration é aplicada via ferramenta MCP do Supabase (`apply_migration`, usado por agentes/Claude
em vez do CLI), o `schema_migrations.version` gravado é o **timestamp real da aplicação**, não o timestamp
que está no nome do arquivo local. O nome do arquivo passado na chamada vai para `schema_migrations.name`,
então dá pra saber qual arquivo corresponde — mas o `version` não bate.

Exemplo real (20/08/2026): os arquivos `20260820120000_devolver_ou_trocar_venda_retorna_itens.sql` e
`20260820120100_fix_anon_grant_drift_devolver_ou_trocar_venda.sql` foram aplicados via MCP e ficaram
rastreados como `20260820102925` e `20260820103048` respectivamente (`name` bate, `version` não).

**Consequência prática:** um `supabase db push` futuro pode não reconhecer esses arquivos como já
aplicados (porque o CLI casa por `version` = timestamp do nome do arquivo) e tentar reaplicá-los. Isso só é
seguro se a migration em questão for idempotente (`DROP ... IF EXISTS` + `CREATE`, `REVOKE`, `ON CONFLICT`
etc. — nunca `INSERT` sem guarda ou `ALTER` destrutivo). Antes de aplicar uma migration em produção via MCP,
confirme que ela é idempotente por esse motivo, além dos motivos já óbvios de não quebrar em reexecução.

Se isso causar confusão futura, o caminho de correção é `supabase migration repair --status applied
<version-do-arquivo>` — **não fazer isso sem entender o estado atual do tracking**, ver
`MIGRATIONS_DRIFT_CLASSIFICATION.md` para o histórico de drift já mapeado neste projeto.

## Edge Function `sync-outbox`

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy sync-outbox
```

Configure os secrets da function (`SYNC_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) no Dashboard ou via CLI (veja `../pdv-importados/scripts/supabase-edge-secrets.example.ps1` a partir da pasta `backend`).

> **Enfileiramento automático para PDV desktop (opcional)**  
> Após a migration 069, a Edge Function `sync-outbox` pode opcionalmente enfileirar documentos fiscais para vendas realizadas no desktop. A ativação é controlada pelo secret `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE`. O script de smoke `smoke_fiscal_enqueue_069_service_role.sql` (em `scripts/`) valida que a RPC `fiscal_enfileirar_documento_venda` aceita a role `service_role` sem quebrar permissões existentes.

Opcional — fila fiscal após venda sincronizada pelo desktop: secret `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true` e, na mesma Edge, opcionalmente `FISCAL_DEFAULT_DOC_TYPE` (lido por `sync-outbox`; alinhe com o Next se quiser o mesmo tipo que o caixa web). **Predefinição:** desligado (ausente ou `false`); não chama API fiscal externa, só a RPC interna de enfileiramento. Com o enqueue ligado, aplique antes a migration **069** e, em homologação, rode o smoke `supabase/scripts/smoke_fiscal_enqueue_069_service_role.sql`.

## Edge Function `fiscal-worker`

Emissão fiscal assíncrona (stub/mock ou HTTP provider). Deploy na pasta **`backend`**:

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy fiscal-worker
```

Type-check local (igual ao CI): `deno check --config supabase/functions/fiscal-worker/deno.json supabase/functions/fiscal-worker/index.ts` — ou `npm run check:edge` na pasta `backend`, que inclui as três functions.

## CI — smoke de migrations

No GitHub Actions, o workflow **CI backend Supabase** aplica todas as migrations em ordem sobre PostgreSQL 15 com um stub mínimo de `auth` (`backend/supabase/scripts/ci_stub_supabase_auth.sql`). Isso **não** substitui `supabase db push` no projeto real; só pega erros de SQL/ordem cedo.

## CI — diagnóstico anti-replay (opcional, contra ambiente real)

No mesmo workflow há o job `anti-replay-diagnostic-gate` (runner Windows + PowerShell). Configure **somente no GitHub** (Settings → Secrets and variables → Actions) os secrets **`SYNC_ENDPOINT`** (URL da função `sync-outbox`) e **`SYNC_KEY`** (igual ao secret da Edge). Com eles definidos, o CI executa `scripts/sync-outbox-anti-replay-diagnostic.ps1`; em **PR interno** que altera `sync-outbox` ou esse script, a ausência dos secrets faz o gate falhar (forks não recebem esses secrets — comportamento esperado).

## Smoke operacional completo (SQL)

Para simular o ciclo de operação (compra/entrada de estoque, vendas por forma de pagamento, desconto, cancelamento, sangria/suprimento e fechamento de caixa), execute no SQL Editor:

- `backend/supabase/scripts/smoke_operacao_fluxo_completo.sql`

Outros smokes pontuais (homologação):

- `smoke_fiscal_enqueue_069_service_role.sql` – valida a permissão `service_role` na RPC fiscal e simula o enfileiramento de um documento de teste.

> **Limitação do smoke via SQL puro**  
> O script acima usa `set_config('request.jwt.claim.role', 'service_role', true)` para simular a role dentro do SQL Editor do Supabase. Em uma conexão psql direta, `auth.role()` pode não refletir esse claim dinâmico. Nesse caso, a validação da definição da função (`pg_get_functiondef`) ainda é suficiente para confirmar que a migration 069 foi aplicada.

O script operacional completo é de teste, cria dados fictícios e valida automaticamente os resultados (lança erro se algum passo falhar).

## Segurança (obrigatório)

- **Nunca** commite `.env.local`, `.env` com chaves reais, nem scripts com JWTs.
- `SUPABASE_SERVICE_ROLE_KEY` e `SYNC_KEY` vazaram se estiveram no Git: **gere nova service role** (Dashboard → Settings → API → *rotate*) e **troque o `SYNC_KEY`** nas secrets da Edge Function e no PDV local.
- Edge secrets ≠ variáveis do Next: use `npx supabase secrets set ...` ou o painel **Edge Functions → Secrets**, não misture com `.env.local` do Next.

