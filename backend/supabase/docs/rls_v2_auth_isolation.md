# RLS v2 — Autoridade única em `auth.uid()` + isolamento de tenant por JWT

Migration: `20260702000000_254_rls_v2_tenant_isolation_jwt.sql`
Config: `[auth.hook.custom_access_token]` habilitado em `config.toml`.

> **Escopo por fase.** Esta migration é **Fase 1 (infra de segurança / tenant)**:
> injeta e usa **apenas** o claim de tenant `app_metadata.loja_id` e o isolamento
> por loja. O claim de **papel** (`perfil`) e toda a autorização por cargo são
> **Fase 2** — não fazem parte deste PR. As linhas abaixo que citam `perfil`/papel
> descrevem o problema v1 ou o alvo final de Fase 2, marcados como tal.

## Problema (modelo v1)

No modelo atual, **toda** policy (~93, ver `224_rls_initplan_wrap_auth_select.sql`)
executa um subquery `EXISTS (... FROM public.usuarios u WHERE u.id = auth.uid() ...)`
que acumula três autoridades no mesmo lugar:

1. **Identidade** — `u.id = auth.uid()`
2. **Tenant** — `u.loja_id = <tabela>.loja_id`
3. **Papel** — `u.perfil IN ('GERENTE','DONO','ADMIN')`

Consequências:

- **Inconsistência de autoridade.** `usuarios` é fonte de identidade, de tenant e
  de papel — além de existir uma segunda tabela de papéis (`perfis`). Regras de
  perfil ficam espalhadas em policies, em funções `SECURITY DEFINER` e no app.
- **Recursão.** Ler `usuarios` dentro de policy de `usuarios` exigiu o helper
  `auth_usuario_eh_dono()` `SECURITY DEFINER` (068) para não recair em RLS.
- **Custo de query.** O `EXISTS`-em-`usuarios` é reavaliado a cada leitura sob RLS
  em tabelas grandes (`vendas`, `itens_venda`, `documentos_fiscais_*`).

## Modelo novo (v2)

| Camada | Antes (v1) | Depois (v2) |
|--------|-----------|-------------|
| Identidade | `auth.uid()` (via subquery em usuarios) | `auth.uid()` (claim assinado do JWT) |
| Tenant `loja_id` | `SELECT loja_id FROM usuarios ...` em cada policy | `app_metadata.loja_id` no JWT, lido por `public.auth_loja_id()` |
| Papel (GERENTE/DONO/ADMIN) _(Fase 2, não neste PR)_ | policies + RPCs + app | **fora do RLS**; app + RPCs lendo o claim `perfil` |
| `public.usuarios` | identidade + tenant + papel | **apenas metadado de domínio** (nome, idioma, ativo) |

Invariante de policy v2, por categoria de tabela:

- **Tem `loja_id`**: `FOR ALL TO authenticated USING (loja_id = (select public.auth_loja_id()))`.
- **Alcança tenant por join** (`vendas→caixas`, `contas_*`, `ordens_compra`, `remessas`…):
  `EXISTS (SELECT 1 FROM <pai> WHERE <fk> AND <pai>.loja_id = (select public.auth_loja_id()))`
  — subquery permitida (não é em `usuarios`).
- **Registro do próprio usuário** (`transferencias_idempotencia`, telemetria): `user_id = (select auth.uid())`.
- **Identidade** (`usuarios`, `perfis`): apenas o próprio registro.
- **Catálogo global** (`categorias`, `marcas`, `fornecedores`, `regras_preco`…): `authenticated`.
- **Config/admin global** (`lojas`, `feature_flags`, `configuracoes_gerais`, `tipos_movimento_estoque`):
  leitura `authenticated`, escrita só `service_role` (bypass de RLS).

`public.auth_loja_id()` é `STABLE` e **não acessa tabela** — o planner a promove a
InitPlan (uma avaliação por query). O claim é injetado pelo
`custom_access_token_hook`, que lê `usuarios` uma vez por emissão de token.

## Impacto de segurança

**Ganhos**
- Autoridade única: o token assinado é a fonte de identidade **e** de tenant. Não
  há como um subquery divergir do que o app acredita.
- Superfície menor: elimina o vetor de recursão e o acoplamento das policies ao
  schema de `usuarios`/`perfis`.
- `loja_id` num claim assinado não é forjável pelo cliente (GoTrue assina o JWT).

**Perdas / tradeoffs (explícitos, exigidos pelo pedido)**
- **RLS deixa de autorizar por papel.** Um OPERADOR autenticado passa, no nível de
  RLS, a poder ler/gravar dados da **sua loja** que antes eram restritos a
  GERENTE/DONO (ex.: `descontos_venda`, catálogo global). A restrição por papel
  **precisa** existir na camada de aplicação e nas RPCs `SECURITY DEFINER`.
- **DONO perde a visão macro (todas as lojas) via RLS.** Passa a ver só a loja do
  seu claim. Relatórios multi-loja devem ir para RPC `SECURITY DEFINER`.
- **Janela de cutover:** sessões com token antigo (sem `loja_id`) veem
  `auth_loja_id() = NULL` → policies de tenant negam tudo até o refresh do token
  (≤ `jwt_expiry` = 3600 s) ou novo login. Não há fallback para `usuarios`
  (violaria a premissa). Planeje forçar re-login.

### Fase 2 (recomendada, fora desta migration)
Mover os checks `perfil IN (...)` das RPCs `SECURITY DEFINER` para lerem o claim
`perfil` do JWT (`auth.jwt()->'app_metadata'->>'perfil'`) em vez de subquery em
`usuarios`. Isso mantém a **autorização server-side** (não é um downgrade) e
remove a última dependência de `usuarios` como autoridade. Não delete os checks
das RPCs sem substituí-los pela leitura do claim.

## Impacto de performance

- Elimina o `EXISTS`-em-`usuarios` de ~90 policies. Onde havia `JOIN usuarios`,
  agora há no máximo um `EXISTS` numa tabela do próprio domínio (`caixas`,
  `contas_*`) já indexada por PK/FK.
- `auth_loja_id()` (InitPlan) resolve o tenant uma vez por query, em vez de um
  lookup em `usuarios` por linha — ganho concentrado nas tabelas de alto volume.
- Mantém o padrão `(select auth.*)` de `224/252` (advisor `auth_rls_initplan`).

## Rollout

1. Aplicar a migration (instala `auth_loja_id`, o hook, backfill de
   `raw_app_meta_data`, e reescreve as policies).
2. Habilitar o hook (já em `config.toml`; em projeto hospedado: Authentication →
   Hooks → Custom Access Token → `public.custom_access_token_hook`).
3. Forçar refresh/re-login (ou aguardar ≤1h) para os tokens carregarem `loja_id`.
4. Verificar:
   ```sql
   SELECT count(*) FROM pg_policies
   WHERE schemaname='public'
     AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~* '\musuarios\M|perfil';
   -- esperado: 0
   ```
5. Garantir na aplicação/RPCs a autorização por papel (Fase 2).

## Rollback
Reaplicar a última migration de RLS v1 (224/252 + 225/226/217), dropar as policies
v2 (`tenant_isolado`/`self_isolado`/`usuarios_self_*`/`perfis_self`/`auth_*`), e
`DROP FUNCTION` `custom_access_token_hook` e `auth_loja_id`. O backfill em
`raw_app_meta_data` é inócuo para o v1.
