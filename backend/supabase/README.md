# Supabase (migrations + Edge Functions)

As migrations e Edge Functions do projeto ficam em `**backend/supabase/**` (pasta central de backend do monorepo), não em `pdv-local`.

**Checklist única (migrations → deploy das Edges → secrets → alinhamento web/desktop):** [../../docs/CHECKLIST_DEPLOY_SUPABASE.md](../../docs/CHECKLIST_DEPLOY_SUPABASE.md).

**Kardex (auditoria de estoque):** view `public.v_kardex_unificado` (migration `060_v_kardex_unificado.sql`) — eventos agregados a partir de `movimentos_estoque_log`, `estoque_baixas` e `estoque_reposicoes_cancelamento`.

**Baixa na venda:** usar **`decrementar_estoque_seguro`** (e RPCs de finalizar venda). Migrations **070**/**071**: a RPC legada `decrementar_estoque_idempotente` delega a `seguro` e deixa de ter `EXECUTE` para `authenticated` (mantém-se para `service_role`).

## Stack local vs projeto linkado (uma máquina)

- **`npx supabase link`:** liga o CLI ao projeto **remoto** (Reference ID). Use na pasta **`backend`** para `db push` e deploy de functions. Não substitui o Docker local.
- **`npx supabase start`:** sobe **uma** stack local (portas fixas no `config.toml`; `project_id` = `fastproduct`). Não rode dois stacks no mesmo mapa de portas — pare com `npx supabase stop --project-id fastproduct` antes de subir outro projeto, ou altere portas em **um** dos `config.toml` (incomum).
- Detalhes, tabela de portas e troubleshooting de conflito: [../README.md](../README.md) (seção *Fluxo único: stack local × projeto linkado × portas*).

## `seed.sql` — fixture local determinística

`supabase/seed.sql` é carregado automaticamente a cada `npx supabase db reset`, via
`config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

**É só para o stack local. Nunca roda em produção.**

### Por que ele existe

As 6 suítes de `npm run test:financial` escolhem a loja de trabalho com a mesma consulta de
elegibilidade: uma loja que tenha simultaneamente produto com `preco_varejo > 0` **e**
usuários ativos nos perfis GERENTE, OPERADOR e DONO. Nenhuma loja criada por migration
satisfaz isso — `Matriz` tem 16 produtos e zero usuários; `Loja Teste RLS` (criada pelo
`test:rls-scope`, não por migration) tem os perfis e zero produtos.

Sem o seed, 5 das 6 suítes abortam com:

```
fixture: nenhuma loja elegível encontrada (rode o seed local antes)
```

O seed cria os perfis **dentro da Matriz** (`a0000001-0000-4000-8000-000000000001`, que é o
`DEFAULT` de `usuarios.loja_id` / `produtos.loja_id` / `estoque.loja_id` no schema).

### Idempotência

UUIDs fixos + `ON CONFLICT` em tudo. Pode ser reaplicado sobre um banco já semeado sem
duplicar linha:

```powershell
docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/seed.sql
```

### ⚠️ Duas invariantes que parecem bug e não são

**1. `operador_id` do caixa é preenchido no seed e `NULL` na suíte.** As duas pontas são
necessárias e opostas. `uq_caixas_operador_aberto` é UNIQUE **parcial** em
`(operador_id) WHERE status='ABERTO'`; como no PostgreSQL NULLs são distintos entre si, o
caixa anônimo da suíte convive com o do seed. Preencher `operador_id` no caixa **da suíte**
quebra o gate por colisão de índice.

**2. O segundo OPERADOR (`44444444-…`) não pode ganhar caixa.**
`sale-totals-invariant.test.sql` abre o próprio caixa escolhendo um OPERADOR que ainda não
tenha caixa aberto. Se o único OPERADOR já estiver ocupado, a suíte insere um caixa com
`operador_id` NULL, esse caixa vence o `ORDER BY data_abertura DESC` do `\gset` seguinte, e
`test_user` vem NULL — **e o psql desdefine a variável quando o valor é NULL**. O literal
`:'test_user'` chega ao servidor e o erro aparece como `syntax error at or near ":"`, longe
da causa. Manter um OPERADOR livre é o que mantém esse caminho determinístico.

Contexto completo: [`../../docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md`](../../docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md).


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

### Convergência pré-cliente de 31/08/2026

Sob autorização explícita, as migrations `20260830110000`, `20260831100000` e
`20260831110000` foram aplicadas via MCP e registradas respectivamente como
`20260831140530`, `20260831140621` e `20260831140639`. As pós-condições foram
verificadas por leitura no remoto: predicado de margem da confirmação de NF-e,
colunas/índices de busca sem acento e assinatura/grants da criação atômica.

As migrations idempotentes `20260828160000` e `20260829120000` já constavam no
remoto como `20260830172212` e `20260830173839`, mas o gate ainda apresentava as
versões Git como ausentes. Elas foram reaplicadas durante a mesma janela e
receberam `20260831140429` e `20260831140500`. Nenhuma linha de histórico foi
apagada ou reescrita. Os dois registros de cada migration são preservados e
reconciliados como pares HUMAN_GATE auditáveis em `migration-human-gates.json`.

### Reconciliação de drift de 03/10/2026

O gate `migration-remote-drift` acusava 3 versões só no remoto. Nenhuma alteração foi feita em
produção; a reconciliação foi só no repositório, após comparação por leitura de
`schema_migrations.statements`, `pg_proc` e `pg_policies`:

| Remoto | Arquivo | Como foi aplicada | Reconciliação |
|---|---|---|---|
| `20260928201815` | `20260928120000_atualizar_preco_varejo_produto_rpc.sql` (vinha só da branch `claude/hardening-certificacao-operacional-f2e6ce`, commit `e352e76d`) | MCP `apply_migration` | arquivo trazido para a `main` sem alteração + par HUMAN_GATE |
| `20260930090200` | `20260930090200_p03_vendas_lista_kpi_uma_linha_por_venda.sql` (vinha só da branch `claude/jinlong-ux-audit-4ab5be`, commit `20c30283`) | CLI (mesma versão do arquivo, `created_by` nulo) | arquivo trazido para a `main` sem alteração (versão já bate; sem par) |
| `20261002104957` | `20261002100000_pos_venda_operacoes_select_dono_todas_lojas.sql` (já na `main`) | MCP `apply_migration` | par HUMAN_GATE |

Conteúdo idêntico ao remoto em todos os casos (SQL normalizado e md5 dos corpos das funções).
Ponto em aberto, fora desta reconciliação: `20260930120000_vendas_lista_kpis_por_venda.sql` (na `main`,
não aplicada em produção) é outra implementação do mesmo problema de `20260930090200` e cria
`listar_vendas_gerente`/`kpis_vendas_gerente`, já usadas pelo código da `main`.

Quando uma migration é aplicada via ferramenta MCP do Supabase (`apply_migration`, usado por agentes/Claude
em vez do CLI), o `schema_migrations.version` gravado é o **timestamp real da aplicação**, não o timestamp
que está no nome do arquivo local. O nome do arquivo passado na chamada vai para `schema_migrations.name`,
então dá pra saber qual arquivo corresponde — mas o `version` não bate.

Exemplo real (20/08/2026): os arquivos `20260820120000_devolver_ou_trocar_venda_retorna_itens.sql` e
`20260820120100_fix_anon_grant_drift_devolver_ou_trocar_venda.sql` foram aplicados via MCP e ficaram
rastreados como `20260820102925` e `20260820103048` respectivamente (`name` bate, `version` não).

Terceiro par (20/08/2026): `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`
(corrige `cancelar_venda_transacional` para descontar devoluções/trocas já registradas antes de
estornar caixa e repor estoque — achado em `docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md`) foi
aplicado via MCP `apply_migration` diretamente em produção durante a investigação da PR #314 e ficou
rastreado como `20260820233832` (`name` bate — confirmado via `mcp__supabase__list_migrations` —,
`version` não). Equivalência semântica verificada de forma **reproduzível** por
`backend/scripts/verify-cancelar-venda-equivalencia.mjs`: o script extrai o corpo local por âncora de
texto (não número de linha), normaliza explicitamente os dois lados (CRLF→LF, remove o `;` terminador
de instrução SQL que `pg_get_functiondef` nunca inclui, garante 1 newline final) e calcula SHA-256 de
cada lado — os dois batem em `d4f4f7a76d1492079b159bb46e5f22b48a72e23da7ad880568220dbbd549e27e`. A
captura exata do `pg_get_functiondef` remoto está versionada em
`backend/scripts/cancelar-venda-remote-def.json` (sem retranscrição manual). Rode
`node backend/scripts/verify-cancelar-venda-equivalencia.mjs` para reproduzir. Evidência coletada por
leitura apenas (`list_migrations` + `execute_sql` com `SELECT`) — nenhuma alteração no histórico
remoto. A entrada correspondente em `migration-human-gates.json` só é aceita quando **ambos** os lados
do par (`git_only` e `remote_only`) aparecem como divergência no mesmo ambiente avaliado — um ambiente
que nunca recebeu esta migration em nenhum formato continua bloqueado pelo gate.

Quarto par (24/08/2026): `20260811110000_descontos_venda_rls_loja_scope.sql` (corrige vazamento
cross-loja real em `descontos_venda` — policies checavam só o perfil GERENTE/DONO/ADMIN, nunca
`loja_id`, achado durante a preparação do piloto Jinlong, PR #317) foi aplicado via MCP
`apply_migration` e ficou rastreado como `20260824092128` (`name` bate, `version` não). Verificado
por leitura direta (`SELECT` em `pg_policies`) que as 4 policies (select/insert/update/delete) agora
exigem `u.loja_id = c.loja_id` para GERENTE (DONO/ADMIN continuam vendo todas as lojas) — nenhuma
alteração no histórico remoto além da própria migration. Mesma regra do par anterior: só aceito
quando ambos os lados do par aparecem como divergência no ambiente avaliado.

Quinto e sexto par, e uma migration corretiva (24/08/2026, piloto D0, autorização explícita):
`20260823192022_d0_pricing_tiers_ssot.sql` e `20260823192024_d0_remessa_quantidade_positiva_atomica.sql`
foram aplicados via MCP `apply_migration` em produção e ficaram rastreados como `20260824001940` e
`20260824002027` respectivamente. A aplicação da segunda revelou um drift pré-existente e não
relacionado: `remessas.conferido_por`/`conferido_em` (e `origem_tipo`/`origem_ref`/`divergencia_motivo`)
constavam como criados por `20260801120000_recebimento_conferencia_explicita` em
`schema_migrations`, mas nunca existiram fisicamente — o mesmo drift já documentado em
`296_nfe_conferencia.sql` desde 05/08/2026. `criar_confirmar_remessa_entrada` falhava em toda chamada
real com `column "conferido_por" of relation "remessas" does not exist`. Uma migration corretiva mínima
e aditiva, `20260824010000_fix_remessas_conferencia_columns_drift.sql`, restaurou só as colunas e
constraints de schema ausentes (sem recriar `registrar_conferencia_remessa`, deliberadamente removida
em `20260819230000` — recriá-la reabriria a aceitação de `quantidade_conferida = 0` que a D0-03 existe
para fechar) e ficou rastreada como `20260824003815`. Regressão coberta por
`backend/scripts/d0-remessa-conferencia-columns-drift.test.sql` (remove as colunas dentro de uma
transação não commitada, prova que a RPC falha, reaplica a correção, prova que funciona). Validado em
produção pós-correção, dentro de transações com `ROLLBACK`: rejeição de zero/negativo/NaN/Infinity/vazio,
atomicidade, idempotência de replay e gravação de `conferido_por`/`conferido_em` — nenhum dado de teste
persistiu.

Sétimo par (documentado em 30/08/2026, reconciliação do plano de remediação Jīn Lóng —
Engineering Loops 6A–7): `20260821110000_restore_devolver_ou_trocar_venda_kardex_ssot04.sql`
(PR #313, `15c6bcc0` — restaura `INSERT INTO movimentos_estoque_log` em
`devolver_ou_trocar_venda`, SSOT-04) consta no remoto sob a version `20260827130536`, name
`restore_devolver_ou_trocar_venda_kardex_ssot04` (`name` bate com o identificador lógico do
arquivo, `version` não). Já apontado, com hedge equivalente, em
`docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md` ("Migrations desta consolidação"): "sim (RPC
verificada: insert kardex)" — "versão remota pode ser timestamp de apply, não o filename".
Postcondition reverificada nesta reconciliação (leitura apenas, `list_migrations` +
`execute_sql` com `SELECT`): a função `public.devolver_ou_trocar_venda` existe no remoto. **Não
há, nesta reconciliação, registro direto do método de aplicação** (MCP `apply_migration` vs.
outro caminho) para este par — só a divergência de version e a postcondition confirmada. Não
deve ser reaplicada sem antes confirmar se um `db push` a reconheceria como já presente.

Oitavo par (documentado em 30/08/2026, mesma reconciliação):
`20260824120000_fix_remessa_entrada_aceita_produto_draft.sql` (PR #324, `66a19c50` —
recebimento aceita produto DRAFT via `status_publicacao IS DISTINCT FROM 'INATIVO'`) consta no
remoto sob a version `20260827130449`, name `fix_remessa_entrada_aceita_produto_draft`. Mesma
tabela em `CERTIFICACAO_GO_LIVE_E1327E62.md`: "sim (RPC: `status_publicacao`, não `p.ativo`)".
Postcondition reverificada nesta reconciliação: `public.criar_confirmar_remessa_entrada` contém
literalmente `status_publicacao IS DISTINCT FROM 'INATIVO'` no corpo remoto. Mesma ressalva do
par anterior: método de aplicação não registrado diretamente nesta reconciliação, só a
divergência de version e a postcondition.

Nono par (documentado em 30/08/2026, mesma reconciliação):
`20260828110000_fix_v_kardex_unificado_anti_join_devolucao.sql` consta no remoto sob a version
`20260828120238`, name `fix_v_kardex_unificado_anti_join_devolucao`. Evidência de equivalência
particularmente forte, mais forte que os dois pares anteriores: `obj_description` de
`public.v_kardex_unificado` no remoto retorna texto **idêntico**, byte a byte, ao `COMMENT ON
VIEW` do arquivo local — incluindo o próprio timestamp do arquivo (`20260828110000`) embutido
dentro do texto do comentário ("... anti-join SSOT-04 por operacao_id na observação,
20260828110000). DAT-01 (291): NULLIF(eb.quantidade,0)."). Essa correspondência textual exata,
carregando o identificador do próprio arquivo, é evidência direta de que o corpo efetivamente
aplicado é este. Mesma ressalva sobre método de aplicação não witnessed diretamente nesta
reconciliação.

Décimo par — M1 (Fase 1 do plano de remediação Jīn Lóng, hardening de grants residuais,
aplicada via MCP `apply_migration` e verificada em produção antes desta reconciliação):
`20260828120000_fase1_hardening_grants_residuais.sql` consta no remoto sob a version
`20260830004614`, name `20260828120000_fase1_hardening_grants_residuais` (identificador do
arquivo preservado integralmente em `name`, não só o filename base). Postcondition reverificada
nesta reconciliação: `has_function_privilege('anon', 'public.converter_venda_em_espera(uuid)',
'EXECUTE') = false` e `has_function_privilege('authenticated', 'public.converter_venda_em_espera(uuid)',
'EXECUTE') = true` — exatamente o padrão do "Grupo A" descrito no cabeçalho do arquivo (revoga
`anon`, preserva `authenticated`).

Décimo primeiro par — M2 (Fase 3, tenant isolation de transferências/remessas — Padrão A,
mesma reconciliação): `20260828140000_fase3_tenant_isolation_transferencias_remessas.sql`
consta no remoto sob a version `20260830005351`, name preservado integralmente. Postcondition
reverificada: `public.transferir_estoque_seguro` contém `TRANSFERENCIA_LOJA_INVALIDA` e
`public.confirmar_remessa_entrada` contém `REMESSA_LOJA_INVALIDA` no corpo remoto — os dois
guards de isolamento por loja descritos no arquivo.

Décimo segundo par — M3 (Fase 4, idempotência de remessa por `payload_hash`, mesma
reconciliação): `20260828150000_fase4_remessa_idempotencia_payload_hash.sql` consta no remoto
sob a version `20260830005831`, name preservado integralmente. Postcondition reverificada: a
coluna `public.remessas.payload_hash` existe no remoto, conforme o `ALTER TABLE ... ADD COLUMN
IF NOT EXISTS payload_hash text` do arquivo.

Décimo terceiro par — M4 (restaura o fluxo de conferência de NF-e da UI FLX-05, PR #341, mesma
reconciliação): `20260828150100_restaura_registrar_conferencia_nfe_ui_flx05.sql` consta no
remoto sob a version `20260830010624`, name preservado integralmente. Postcondition
reverificada: as funções `public.registrar_conferencia_nfe` e `public.confirmar_importacao_nfe`
existem no remoto.

**Estas sete entradas (sétimo ao décimo terceiro par) reconciliam exclusivamente a divergência
histórica de `version` identificada. Nenhuma delas constitui autorização para alterar ou
reaplicar o SQL das migrations correspondentes** — a evidência acima só sustenta "já presente e
correta no remoto sob outra version", nada além disso. Toda a coleta de evidência foi por
leitura (`list_migrations` + `execute_sql` com `SELECT`/`has_function_privilege`/
`obj_description`) — nenhuma escrita em produção.

**Consequência prática:** um `supabase db push` futuro pode não reconhecer esses arquivos como já
aplicados (porque o CLI casa por `version` = timestamp do nome do arquivo) e tentar reaplicá-los. Isso só é
seguro se a migration em questão for idempotente (`DROP ... IF EXISTS` + `CREATE`, `REVOKE`, `ON CONFLICT`
etc. — nunca `INSERT` sem guarda ou `ALTER` destrutivo). Antes de aplicar uma migration em produção via MCP,
confirme que ela é idempotente por esse motivo, além dos motivos já óbvios de não quebrar em reexecução.

Se isso causar confusão futura, o caminho de correção é `supabase migration repair --status applied
<version-do-arquivo>` — **não fazer isso sem entender o estado atual do tracking**, ver
`MIGRATIONS_DRIFT_CLASSIFICATION.md` para o histórico de drift já mapeado neste projeto.

Décimo quarto, décimo quinto e décimo sexto par (investigados em 02/09/2026, gate de convergência
das Auditorias OpenCode 01–04, PR #363, ao classificar a falha do check `migration-remote-drift`):
`20260901000000_validar_tier_preco_menor_que_varejo.sql`,
`20260901020000_historico_tiers_crud.sql` e
`20260901030000_calcular_preco_produto_retorna_quantidade_minima.sql` constam no remoto sob as
versions `20260901115307`, `20260901115323` e `20260901115338` respectivamente — `name` bate
integralmente com o identificador de cada arquivo (`SELECT version, name FROM
supabase_migrations.schema_migrations WHERE version IN (...)`), `version` não (mesmo padrão de
aplicação via MCP `apply_migration` de todos os pares anteriores). Postcondition reverificada
nesta investigação (leitura apenas): `to_regclass('public.historico_tiers_crud') IS NOT NULL` = true;
`EXISTS(... pg_trigger WHERE tgname='trg_audit_tiers_crud')` = true;
`EXISTS(... pg_trigger WHERE tgname='trg_validar_tier_preco_menor_que_varejo')` = true;
`calcular_preco_produto` contém `quantidade_minima` no corpo remoto. As três migrations foram,
adicionalmente, exercitadas em runtime nesta mesma investigação (não só inspecionadas): a trigger
`trg_validar_tier_preco_menor_que_varejo` rejeitou corretamente a criação de um tier com preço ≥
varejo via chamada real contra produção (`BEGIN...ROLLBACK`, sem persistência). Mesma ressalva das
entradas anteriores: esta reconciliação só sustenta "já presente e correta no remoto sob outra
version" — não é autorização para alterar ou reaplicar o SQL correspondente.

Décimo sétimo ao vigésimo primeiro par (deploy controlado em produção, 02/09/2026, autorizado
explicitamente após o merge do PR #363 em `main` — SHA `4b5a8111dc9fe1262453de4d7c7cf029a0af1098`):
`20260902100000_finalizar_venda_retry_payload_divergente.sql`,
`20260902100100_guard_varejo_menor_que_tier_ativo.sql`,
`20260902100200_fechar_caixa_repeticao_valor_divergente.sql`,
`20260902100300_revoke_execute_trigger_functions_tiers.sql` e
`20260902120000_serializa_invariante_varejo_tier_e_reativacao.sql` foram aplicadas via MCP
`apply_migration` (não CLI, não `db push`) diretamente no projeto `kbabmewnahysfvlybiak`, uma de
cada vez, cada uma com verificação de ausência no histórico remoto imediatamente antes da
aplicação (`SELECT version, name FROM supabase_migrations.schema_migrations WHERE version LIKE
'202609%'`). Constam no remoto sob as versions `20260902190428`, `20260902190512`,
`20260902190555`, `20260902190619` e `20260902190718` respectivamente — mesmo padrão de todos os
pares anteriores (`version` = timestamp real de aplicação, `name` preserva integralmente o
identificador do arquivo). POST determinístico e não-persistente (`BEGIN...ROLLBACK`) reexecutado
nesta mesma sessão de deploy, contra o schema já migrado: idempotência semântica de
`finalizar_venda_transacional_canonica_v4` (replay com payload idêntico silencioso, replay com
payload divergente rejeitado com `FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE`, nenhuma
mutação do estado persistido pela tentativa rejeitada); idempotência de `fechar_caixa_atomico`
(mesmo padrão, `FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE`); invariante tier-ativo-menor-que-varejo
nos dois sentidos de escrita, inclusive o caso multi-step do writer real
`atualizar_produto_com_faixa_atacado` e os 4 cenários de reativação de tier (reativar inválido
rejeitado, reativar válido aceito, criar tier novo inválido rejeitado, desativar funcionando).
Grants reconfirmados por introspecção (`has_function_privilege`): `anon`=false em todas as
funções revisadas nesta convergência (incluindo `internal.lock_invariante_varejo_tier`),
`authenticated`=true somente nas duas RPCs públicas (`finalizar_venda_transacional_canonica_v4`,
`fechar_caixa_atomico`); owner=`postgres` e `search_path` fixo (`public`, ou `pg_catalog, public`
no helper de lock) em todas. Mesma ressalva das entradas anteriores: esta reconciliação só
sustenta "aplicada via MCP, `version` do arquivo diverge do `version` remoto por ser o timestamp
real de aplicação" — não é autorização para alterar ou reaplicar o SQL correspondente sem nova
revisão.

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

