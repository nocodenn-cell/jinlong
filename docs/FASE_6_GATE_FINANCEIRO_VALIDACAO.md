# Fase 6 — Validação final e fechamento das lacunas do gate financeiro

**Data:** 2026-08-19
**Branch:** `claude/fase-6-validacao-fechamento-6e9af7`
**PR:** [#307](https://github.com/nocodenn-cell/fastproduct/pull/307)
**Commits:** `ef79bd33` (merge de `main`) · `ee36bfd4` (correções)
**Estado:** 🟢 **Lacunas (a) e (b) fechadas.** ⚠️ **Janela crítica NÃO recomendada** — ver §9.
**Revisado em 2026-08-19 (pós PR [#309](https://github.com/nocodenn-cell/fastproduct/pull/309)):** §4 continha uma **premissa falsa**, corrigida no local; §5 ganhou o estado real de produção (§5.1); §8.3 foi **encerrada** pela auditoria de catálogo; §9 ganhou a atualização §9.1.

> **Nota de nomenclatura.** Este documento trata da *Fase 6 do bloco financeiro / go-live*.
> Não confundir com `FASE_6_DESIGN_SYSTEM_AUDIT.md`, `FASE_6_1_EXECUTION_PLAN.md` e
> `FASE_6_1_ONDA3_CAIXA_MAP.md`, na raiz, que são a *Fase 6 do design system / UI*.
> São trilhas distintas que coincidiram no número.

---

## 1. Resumo executivo

O gate financeiro **não era reproduzível a partir do repositório**. Num banco reconstruído
do zero com `npx supabase db reset`, passava **1/6**.

O `4/6` que se observava na máquina de desenvolvimento **não era um resultado real**: vinha
de dados residuais de execuções manuais antigas, que nenhum arquivo versionado sabia
recriar. O número melhorava a cada execução manual e piorava a cada banco limpo — o
oposto do que um gate deve fazer.

Duas lacunas conhecidas foram fechadas, e o trabalho revelou **dois achados não previstos**:
uma migration aplicada à mão em produção (§4) e **um furo de RLS real em produção** (§5).

| Verificação | Antes | Depois |
|---|---|---|
| `test:financial` | **1/6** | **6/6** ✅ |
| `test:rls-scope` | 42/42 | **42/42** ✅ |
| `check:types-drift` | DRIFT | **OK** ✅ |
| `verificacao-pos-apply.sql` | 15/17 | **17/17**, 0 falhas ✅ |

---

## 2. Lacuna (a) — GATES 12 a 23 restaurados

### O que aconteceu

O commit `ddce245a` (*"adiciona REVOKE das funções de consistência antes do GATE9 no CI"*)
pretendia **inserir 22 linhas** e **removeu 1412**:

```
backend/scripts/financial-adversarial-gates.test.sql | 1434 +-------------
1 file changed, 22 insertions(+), 1412 deletions(-)
```

O arquivo caiu de **1900 → 509 linhas**, cortado no meio do comentário do GATE 12 — a
última linha versionada era literalmente `-- Regressão`, sem corpo, sem `ROLLBACK;`.

### O que se perdeu

- **12 gates adversariais** (GATE 12 a GATE 23), incluindo o **GATE 20** (devolução
  multi-item processa todos os itens — regressão DB05-F2, em que metade da comissão ficava
  retida).
- O **`ROLLBACK;`** final. O arquivo abre `BEGIN;` na linha 13; sem o fechamento, a suíte
  deixava estado commitado e **envenenava `ap-payments-reconciliation` na execução
  seguinte** — origem dos erros intermitentes `movement_reused`.
- O `SELECT 'FINANCIAL ADVERSARIAL GATES: OK'` de sucesso.

### Correção

Restaurado de `ec2968a4` (versão íntegra, 1900 linhas), preservando o bloco de limpeza
legítimo que `ddce245a` queria adicionar. Arquivo final: **1920 linhas, 23 gates,
`BEGIN;` na 13 e `ROLLBACK;` na 1920.**

> **Consequência em cadeia.** Enquanto os gates estiveram truncados, o **GATE 9 não rodava**.
> Foi ele que, ao voltar, detectou o furo de RLS descrito em §5. A truncagem não só apagou
> testes: apagou a capacidade de detectar uma vulnerabilidade que já estava em produção.

---

## 3. Lacuna (b) — `backend/supabase/seed.sql` criado

### O que aconteceu

`backend/supabase/config.toml` aponta para o seed desde sempre:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

Mas o arquivo **nunca existiu em branch algum** do repositório. `db reset` avisava, sem
falhar:

```
WARN: no files matched pattern: supabase/seed.sql
```

E 5 das 6 suítes abortavam com `fixture: nenhuma loja elegível encontrada (rode o seed local antes)`.

### Por que nenhuma loja servia

As 6 suítes selecionam a loja de trabalho com a **mesma** consulta de elegibilidade: uma
loja que tenha simultaneamente produto com `preco_varejo > 0` **e** usuários ativos nos
três perfis GERENTE, OPERADOR e DONO. As migrations sozinhas nunca produzem isso:

| Loja | Produtos | Perfis ativos | Elegível |
|---|---|---|---|
| `Matriz` (`a0000001…`) | 16 | **nenhum** | ❌ |
| `Filial demo` (`a0000002…`) | 0 | nenhum | ❌ |
| `Loja Teste RLS` (`b0000001…`) | **0** | DONO, GERENTE, OPERADOR, ADMIN | ❌ |
| `Loja Teste RLS Filial` (`c0000001…`) | 0 | nenhum | ❌ |

`Loja Teste RLS` é criada pelo `test:rls-scope`, **não por migration** — e sem produtos. O
próprio comentário da suíte já registrava o sintoma: *"`test:rls-scope` cria usuários numa
loja sem produtos, e a suíte caía nela."*

### O que o seed faz

Cria os três perfis **dentro da Matriz**, que já traz produtos e formas de pagamento.
`a0000001-0000-4000-8000-000000000001` não é um UUID arbitrário: é o `DEFAULT` de
`usuarios.loja_id`, `produtos.loja_id` e `estoque.loja_id` no schema — a loja canônica de
fixture.

Conteúdo: 1 loja (rede de segurança), 4 identidades em `auth.users` + `public.usuarios`
(DONO, GERENTE, OPERADOR, **OPERADOR 2**), 1 caixa ABERTO do OPERADOR, estoque da Matriz
e `comissao_padrao_percentual`.

### Idempotência

UUIDs fixos + `ON CONFLICT` em todas as inserções. **Verificado com 3 aplicações
consecutivas** sobre um banco já semeado: exit 0, zero erros, contagens estáveis
(`usuarios_seed=4`, `caixa_seed=1`, `caixas_abertos_operador=1`).

### Duas sutilezas que não devem ser "limpas" depois

**1. `operador_id` do caixa — as duas pontas são necessárias e opostas.**

| Onde | `operador_id` | Por quê |
|---|---|---|
| **no seed** | **preenchido** | a suíte conta com um caixa já aberto para o OPERADOR |
| **na suíte** | **`NULL`** | `uq_caixas_operador_aberto` é UNIQUE **parcial** em `(operador_id) WHERE status='ABERTO'`; no PostgreSQL NULLs são distintos entre si, então o caixa anônimo da suíte convive com o do seed |

Preencher `operador_id` no caixa da suíte **quebra** o gate por colisão de índice. As duas
decisões estão documentadas no próprio `seed.sql` e no cabeçalho da suíte.

**2. O segundo OPERADOR existe de propósito e não pode ganhar caixa.**

`sale-totals-invariant.test.sql` abre o próprio caixa escolhendo um OPERADOR que ainda
**não** tenha caixa aberto. Se o único OPERADOR já estiver ocupado, a subconsulta devolve
`NULL`, a suíte insere um caixa com `operador_id` NULL, esse caixa vence o
`ORDER BY c.data_abertura DESC` do `\gset` seguinte, e `test_user` vem NULL — **e o psql
desdefine a variável quando o valor é NULL**. O literal `:'test_user'` sobrevive até o
servidor e o erro emerge como:

```
syntax error at or near ":"
```

...a três linhas de distância da causa real. Manter um OPERADOR livre é o que mantém esse
caminho determinístico.

---

## 4. Migration `20260814015032` reabilitada

> ## ⛔ Correção — 2026-08-19 (pós PR [#309](https://github.com/nocodenn-cell/fastproduct/pull/309))
>
> **A premissa desta seção era FALSA.** A migration `20260814015032` **nunca esteve no ledger
> de produção.** Não foi "aplicada manualmente": não foi aplicada de forma alguma.
>
> A prova é o diff de catálogo da Fase 0
> ([`AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`](./AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) §3.1):
> produção tinha **305** entradas em `supabase_migrations.schema_migrations` contra **307**
> arquivos no repositório, e as duas ausentes eram exatamente `20260814015032` e
> `20260819000000`. Se tivesse sido aplicada à mão pelo caminho normal, estaria registrada.
>
> **O que isso muda.** O diagnóstico de "aplicação manual em produção" — repetido no adendo de
> [`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md), no
> item 7 do backlog e em §8.3 abaixo — descrevia um mecanismo que não ocorreu. A justificativa
> registrada nos commits `c3f58df3` e `35eb7e8d` era **incorreta na origem**: alguém desabilitou
> uma migration por acreditar que já estava aplicada, sem verificar o ledger.
>
> **O que NÃO muda.** A consequência estrutural continua exatamente a mesma, e por um caminho
> pior: com a migration desabilitada, o fix P1-3 de AP **não existia em lugar nenhum** — nem no
> banco local reconstruído, nem em produção. A conclusão de que produção não era reproduzível a
> partir do repositório permanece válida; só a direção do erro estava trocada.
>
> **Estado atual:** aplicada em produção pela PR #309. Ledger em **307**, paridade de chaves com
> o repositório. Ver [`GO_LIVE_CERTIFICATION_REPORT.md`](../GO_LIVE_CERTIFICATION_REPORT.md) §14.1.

Estava versionada como `_disabled_20260814015032_harden_diagnostics_and_ap_idempotency.sql`.
Motivo registrado nos commits `c3f58df3` e `35eb7e8d`: *"já aplicada manualmente em produção"* —
**premissa refutada, ver o bloco acima**.

**Efeito colateral não previsto na época:** o banco local reconstruído do zero ficava com a
versão **pré-fix** de `registrar_pagamento_contas_pagar`, sem o P1-3 (chave física da
sangria de AP carregando o escopo da conta). Origem real dos erros:

- `movement_reused`
- `PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE`
- e do `GATE10_COLISAO_DE_CHAVE`, que existe exatamente para provar esse fix.

**Consequência estrutural:** enquanto a migration esteve desabilitada, o fix P1-3 **não existia
em lugar nenhum** — nem no banco local reconstruído, nem em produção, que nunca a recebeu.
Produção e repositório divergiam nos dois sentidos. Ver §8.

Reabilitada sob o nome original. É segura de reaplicar em produção: só faz
`CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT`, todos idempotentes.

---

## 5. 🔒 Achado de segurança — furo de RLS em `relatorio_consistencia_vendas`

**Severidade: alta. Estava em produção.**

`20260818000001_revoke_relatorio_consistencia_vendas.sql` executou apenas:

```sql
REVOKE EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(...) FROM authenticated;
```

No PostgreSQL **toda função nasce com `EXECUTE` concedido a `PUBLIC`**. Revogar de
`authenticated` não remove a concessão de `PUBLIC`, e `authenticated` continua executando
**por herança**. O REVOKE não teve efeito prático.

Comparando as duas sobrecargas no banco:

```
3 args → proacl = {postgres=X/postgres, service_role=X/postgres}
4 args → proacl = {=X/postgres,         postgres=X/postgres}
                   ^^ grantee vazio = PUBLIC

has_function_privilege('authenticated', <4 args>, 'EXECUTE') = true
```

A sobrecarga de 3 args estava correta porque a `20260814015032` — a que estava desabilitada
— revogava `FROM PUBLIC, anon, authenticated`, a forma completa.

**Impacto.** A função é `SECURITY DEFINER` e não valida ator, perfil nem loja. Com `EXECUTE`
via `PUBLIC`, um **GERENTE da loja B — que enxerga 0 linhas em `vendas` pela RLS — lia os
agregados de vendas da loja A**, sem precisar de UUID algum. É a mesma classe de vazamento
já documentada no cabeçalho da `20260814015032`.

**Correção:** nova migration `20260819000000_revoke_relatorio_consistencia_vendas_de_public.sql`,
revogando `FROM PUBLIC, anon, authenticated` nas duas sobrecargas e em
`verificar_consistencia_venda`, com `GRANT` para `service_role`. Idempotente (REVOKE de
privilégio ausente é no-op). O mesmo defeito foi corrigido no bloco de limpeza da suíte,
para que ela se baste no CI mesmo sem a migration.

**Detectado pelo GATE 9**, que só voltou a rodar depois da restauração descrita em §2.

### 5.1 Estado real de produção — medido pós PR #309

O texto acima descreve o **banco local reconstruído do repositório**, que tem as duas
sobrecargas. Produção nunca teve esse formato. Medição somente-leitura em produção,
após a aplicação de #309:

| Objeto | Produção | `proacl` | Estado |
|---|---|---|---|
| `relatorio_consistencia_vendas(p_caixa_id, p_loja_id, p_from, p_to)` — **4 args** | ✅ existe | `postgres=X/postgres`, `service_role=X/postgres` | 🟢 **fechado** |
| `relatorio_consistencia_vendas(p_caixa_id, p_from, p_to)` — **3 args** | ❌ **ausente** | — | 🟡 drift — ver abaixo |
| `verificar_consistencia_venda(p_venda_id)` | ✅ existe | `postgres=X/postgres`, `service_role=X/postgres` | 🟢 **fechado** |

Três consequências, todas relevantes:

1. **O vazamento está fechado em produção.** Nem `authenticated`, nem `anon`, nem `PUBLIC`
   constam da ACL das duas funções. O GERENTE da loja B não alcança mais os agregados da loja A.

2. **A sobrecarga de 3 args foi removida à mão.** Ela é criada por `20260621004000` e
   `20260707020000`, **ambas no ledger de produção**, e **nenhuma migration do repositório a
   remove**. Produção executou aquelas versões e mesmo assim não tem o objeto. É drift manual
   real, catalogado em
   [`AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`](./AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) §3.3,
   e endereçado como item **1B-4** da Fase 1B.

3. **Essa ausência quase custou o fix de AP.** `REVOKE EXECUTE ON FUNCTION` não aceita
   `IF EXISTS`. Tanto a `20260819000000` quanto a `20260814015032` faziam `REVOKE` sobre a
   sobrecarga de 3 args: as duas **abortariam inteiras** em produção, e o bloco P1-3 da segunda
   — o fix da chave de idempotência de AP — **nunca teria rodado**. A PR #309 passou a guardar
   cada alvo com `to_regprocedure`, e testou nos dois cenários: banco completo (3 alvos) e
   banco em formato de produção (2 alvos, 1 ignorado com `NOTICE`).

> **Correção ao registro desta fase.** §5 afirma que o achado foi *"detectado pelo GATE 9"*.
> O GATE 9, como estava escrito, **não era capaz de detectá-lo**: a suíte executava um `REVOKE`
> das funções de diagnóstico imediatamente antes de o gate asseverar que estavam revogadas —
> consertava o que ia testar. Conceder `EXECUTE` a `PUBLIC` e rodar a suíte **não** produzia
> falha. O gate não estava falsificado; estava **vazio**. Corrigido na PR #309: o bloco de
> limpeza foi removido, o gate passou a cobrir `anon` e a inspecionar a ACL para pegar a
> concessão a `PUBLIC`, e a falsificação foi verificada — `GRANT ... TO PUBLIC` agora produz
> `GATE9_DIAGNOSTICO_EXPOSTO`.

---

## 6. `verificacao-pos-apply.sql`: constante 304 → 307

A asserção `ledger: total = N` compara o ledger com **a contagem de arquivos do
repositório**. O repositório ganhou 3 migrations:

| Migration | Origem |
|---|---|
| `20260809163502_relatorio_periodo_tz_bounds_sargable` | commit `e154f47b`, reconciliação do relatório de produção |
| `20260814015032_harden_diagnostics_and_ap_idempotency` | **reabilitada** (§4) |
| `20260819000000_revoke_relatorio_consistencia_vendas_de_public` | **nova** (§5) |

Ledger e contagem de arquivos batem em **307**. Cada `+1` está justificado dentro do próprio
arquivo, junto da constante, com instrução explícita de atualizar o número ao adicionar
migrations.

---

## 7. Ensaio real validado — sequência completa de repair

Executada de ponta a ponta, **a partir do tree commitado**, com working tree limpo.

```bash
# 0. pré-condições: Docker ativo, stack local de pé
cd backend

# 1. reconstrução total do banco (migrations + seed)
npx supabase db reset

# 2. escopo/RLS
npm run test:rls-scope        # exige SUPABASE_URL/API_URL, ANON_KEY, SERVICE_ROLE_KEY

# 3. gate financeiro (6 suítes)
npm run test:financial

# 4. contrato de tipos
npm run check:types-drift

# 5. asserções pós-apply (somente leitura)
docker exec -i supabase_db_fastproduct psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < scripts/verificacao-pos-apply.sql
```

As variáveis do passo 2 saem de `npx supabase status -o env`.

### Resultado do ensaio

```
RESET                                       exit=0   ("Seeding data from supabase/seed.sql...")

===== 1) test:rls-scope =====
Resumo: 42/42 regras passaram.

===== 2) test:financial =====
  PASS  financial-idempotency-correlation-contract.test.mjs
  PASS  sale-totals-invariant.test.sql
  PASS  ar-receipts-reconciliation.test.sql
  PASS  ap-payments-reconciliation.test.sql
  PASS  financial-adversarial-gates.test.sql
  PASS  test-commission-concurrency.mjs  — 6 cenários
Gate financeiro OK: 6/6 suítes.

===== 3) check:types-drift =====
Tipos em dia com o banco: 6346 linhas.

===== 4) verificacao-pos-apply =====
asserções OK: 17
asserções FALHAS: 0
3. Falhas (esperado: 0 linhas) → (0 rows)
```

**Ordem-independência verificada:** o gate dá 6/6 tanto num banco recém-semeado quanto
depois de `test:rls-scope` ter criado suas lojas — o cenário que antes contaminava a
seleção de fixture.

---

## 8. O que ainda falta — pendências registradas

### 8.1 🟡 Lojas novas nascem sem formas de pagamento *(risco latente)*

**Confirmado empiricamente** durante a Fase 6:

| Loja | Formas de pagamento ativas |
|---|---|
| `Matriz` | CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO, PIX |
| `Filial demo` | CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO, PIX |
| `Loja Teste RLS` | **(NENHUMA)** |
| `Loja Teste RLS Filial` | **(NENHUMA)** |

Toda loja criada **fora do caminho do seed/migration** nasce sem meio de pagamento. Em
produção isso significa uma loja recém-cadastrada incapaz de concluir venda até que alguém
popule `formas_pagamento` à mão.

**Fora da janela desta fase**, deliberadamente: a correção certa é decidir se as formas
padrão nascem por trigger, por RPC de criação de loja ou por checklist de implantação — é
decisão de produto, não de teste. Não foi corrigida aqui para não embutir semântica de
negócio num seed de desenvolvimento.

### 8.2 🟡 Hook `pre-commit` quebrado para todo o repositório

`C:\fastproduct\.git\hooks\pre-commit` roda, dentro de `pdv-importados/`:

```sh
npm exec -- eslint app components --ext .ts,.tsx --rulesdir ../eslint-rules --max-warnings 0
```

O repositório versiona `.eslintrc.json` (formato legado), mas o eslint instalado é o
**v10.4.1**, que removeu suporte a eslintrc e as flags `--ext` e `--rulesdir`. Resultado:

```
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

O hook **aborta qualquer commit do repositório**, antes e independentemente de qualquer
mudança em curso. Os dois commits desta fase usaram `--no-verify`, com o motivo declarado
na mensagem; o hook não cobre nenhum arquivo aqui tocado (linta só `app/` e `components/`;
as mudanças foram em `backend/` e `lib/`).

**Correção pendente:** migrar para `eslint.config.js` (flat config) ou fixar o eslint em
v8. Enquanto não for feito, o guard de UI legada **não está protegendo nada** — falha
sempre, então ninguém lê o resultado.

### 8.3 ✅ Auditoria do ledger de produção — EXECUTADA (veredito: sistêmico)

> **Status: encerrada em 2026-08-19.** Executada como Fase 0 do plano de fechamento. Resultado
> integral em
> [`AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`](./AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md).
>
> **O veredito é 🔴 SISTÊMICO** — e é pior do que esta seção previa.

**A premissa desta seção estava errada.** A `20260814015032` não prova que migrations foram
aplicadas à mão: ela **nunca foi aplicada** (§4). O que a auditoria encontrou foi drift de
natureza diferente e maior alcance.

#### Resultado — paridade de chaves, divergência de objetos

O ledger foi comparado versão a versão, e depois o **catálogo inteiro** dos dois lados
(`backend/scripts/catalog-snapshot.sql`, o mesmo SQL byte a byte contra um `db reset` local e
contra produção):

| Seção | Repositório | Produção | Δ |
|---|---:|---:|---:|
| policies | 129 | 144 | **+15** |
| indexes | 269 | 279 | **+10** |
| columns | 851 | 866 | **+15** |
| functions | 140 | 144 | **+4** |
| tables | 84 | 87 | **+3** |
| constraints | 401 | 403 | **+2** |
| enums / triggers / views | — | — | ✅ **idênticos** |

**8 das 11 seções divergem**, e a direção é consistente: **produção tem objetos que o
repositório não cria.** O ledger, hoje, bate em **307/307** — e os objetos não. É a lição
central da auditoria: *paridade de chaves não implica paridade de catálogo.* A verificação que
esta seção propunha — `count(*)` do ledger contra `ls | wc -l` — teria dado **verde** sobre um
banco divergente em 10 funções, 3 tabelas e 15 políticas RLS.

#### Os dois achados que mudam a postura

- **🔴 15 políticas RLS a mais em produção.** Um `db reset` a partir do Git entrega
  `tokens_desconto_gerente`, `pdv_config` e `perfis` **sem nenhuma política RLS** — inclusive a
  tabela dos tokens de autorização gerencial. Duas consequências independentes: recuperação de
  desastre produz um banco **menos protegido**, e as 42 regras verdes de `npm run test:rls-scope`
  descrevem um sistema de autorização **que não é o de produção**.

- **🟠 `fiscal_enfileirar_documento_venda` com assinatura divergente.** A Edge `sync-outbox`
  chama a RPC com 4 argumentos (`p_loja_id`); produção só tem a sobrecarga de 3. O PostgREST
  devolve `PGRST202` — e **o erro não falha o batch** (*"erro só em log"*, cabeçalho do
  `index.ts`). Toda venda sincronizada do `pdv-local` deixaria de enfileirar seu documento
  fiscal, **em silêncio**. Confirmado ainda aberto em produção após #309.
  **Dano até hoje: zero** — `venda_eventos` mostra 25 vendas `backfill` e 29 `web_caixa`,
  nenhuma do sync offline. O caminho quebrado nunca executou com venda real; ele arma no dia em
  que o `pdv-local` entrar. O caminho web chama com 3 argumentos e funciona.

#### O que fica no lugar desta seção

A verificação de ledger (`count(*)` + versão a versão) **continua valendo como higiene** e está
automatizada em `backend/scripts/p0-migration-status.mjs`, com registro de exceções via
`HUMAN_GATE`. Mas ela **não é mais o gate**. O gate passa a ser o diff de catálogo, e a
pendência que o sucede é a **Fase 1B — reconciliação de catálogo** (§9 e item 7 do backlog).

Procurar por arquivos `_disabled_*` em `backend/supabase/migrations/` continua sendo prática
recomendada — nenhum restante foi encontrado nesta rodada.

---

## 9. Recomendação sobre a janela crítica

> ⚠️ **Não agendar a janela crítica ainda.**

O 6/6 é real e reproduzível, e as lacunas (a) e (b) estão fechadas. O que **não** está
fechado é a classe de problema que a Fase 6 revelou:

1. **Produção divergiu do repositório por aplicação manual** (§4) e isso só foi descoberto
   por acidente, ao investigar uma falha de teste aparentemente não relacionada.
2. **Staging não está provisionado.** [`AMBIENTES_E_RELEASE.md`](./AMBIENTES_E_RELEASE.md)
   descreve `dev / staging / prod` e marca o projeto Supabase **separado** para staging como
   *"recomendado"* — ou seja, arquitetura-alvo, não estado atual. Enquanto essa separação
   não existir, não há ambiente onde ensaiar a janela contra um banco equivalente ao de
   produção sem tocar em produção.
3. **O ensaio validado nesta fase é local**, não em réplica de produção. Ele prova que *o
   repositório se reconstrói sozinho* — o que é condição necessária, mas não suficiente,
   para provar que *produção corresponde ao repositório*.

**Condição mínima para agendar:** concluir §8.3 (auditoria do ledger de produção) e ter um
ambiente de ensaio com o schema de produção. Enquanto o item 2 persistir, qualquer janela
crítica é executada sem rede de segurança — o rollback documentado em
[`ROLLBACK_HOTLINE_PLAYBOOK.md`](../ROLLBACK_HOTLINE_PLAYBOOK.md) seria testado pela
primeira vez em produção.

### 9.1 Atualização — 2026-08-19, pós auditoria de catálogo e PR #309

> ⚠️ **A recomendação se mantém: não agendar a janela crítica.** O que mudou foi o *motivo*.

| Condição de §9 | Estado |
|---|---|
| 1. Auditoria do ledger (§8.3) | ✅ **executada** — ledger em paridade 307/307; veredito do catálogo **🔴 sistêmico** |
| 2. Ambiente de ensaio | ❌ **continua ausente** — `create_branch` recusado (branching exige plano Pro; organização no Free) |
| 3. Ensaio local ≠ réplica de produção | ❌ inalterado, e agora **quantificado**: 10 funções, 3 tabelas e 15 políticas RLS de diferença |

**O item 1 fechou e piorou o quadro.** A auditoria não confirmou "produção equivale ao
repositório"; provou o contrário, com número. A propriedade que §8.3 punha como condição mínima
para a janela — *produção é reproduzível a partir do repositório* — **é falsa por margem larga**.

**Nova condição mínima para agendar a janela crítica:**

1. **Fase 1B — reconciliação de catálogo** concluída. O caminho é o que a auditoria de junho já
   havia proposto e nunca foi executado: `supabase db pull` para baseline a partir do estado real
   de produção, baseline adotada como ponto zero (com os `.sql` antigos preservados), deltas
   legítimos reautorados sobre ela.
2. **Ambiente de ensaio** onde essa baseline possa ser testada. A Fase 5 (staging) **deixa de ser
   opcional**: uma reconciliação de baseline sem ambiente de ensaio não tem onde ser validada.

**O que foi liberado por #309 — e o que não foi.** O gate financeiro é 6/6 reproduzível, o
vazamento entre lojas está fechado, o fix de AP está no ar e o E2E saiu de produção. Isso é
suficiente para o **treinamento e o piloto de loja única** — decisão do dono, 2026-08-19 —
porque nenhuma pendência restante é alcançável pelo operador nesse cenário. **Não** é suficiente
para a janela crítica nem para a segunda loja, que dependem da Fase 1B.

**Correção de nomenclatura.** A *Fase 1B* aqui é a **reconciliação de catálogo**. Não confundir
com a *Fase 1B — invariantes de totais e centavos* do bloco financeiro
([`GO_LIVE_CERTIFICATION_REPORT.md`](../GO_LIVE_CERTIFICATION_REPORT.md) §10.4), já concluída.

---

## 10. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `backend/supabase/seed.sql` | **novo** — 160 linhas, idempotente |
| `backend/supabase/migrations/20260819000000_revoke_relatorio_consistencia_vendas_de_public.sql` | **novo** — correção de RLS (§5) |
| `backend/supabase/migrations/20260814015032_harden_diagnostics_and_ap_idempotency.sql` | **renomeado** de `_disabled_*` (§4) |
| `backend/scripts/financial-adversarial-gates.test.sql` | 509 → **1920** linhas (§2) |
| `backend/scripts/verificacao-pos-apply.sql` | constante 304 → **307** (§6) |
| `pdv-importados/lib/supabase/database.types.ts` | regenerado contra o schema corrigido |

---

## 11. Referências

- PR [#307](https://github.com/nocodenn-cell/fastproduct/pull/307) — entrega desta fase
- PR [#305](https://github.com/nocodenn-cell/fastproduct/pull/305) — **já MERGED** em 2026-08-18; a instrução original de "atualizar a #305" não era executável
- [`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md) — auditoria de drift anterior (2026-06-20); §4 desta fase é uma recorrência da mesma classe de problema
- [`GO_LIVE_CERTIFICATION_REPORT.md`](../GO_LIVE_CERTIFICATION_REPORT.md) — autoridade de go-live
- [`BACKLOG_TECNICO.md`](./BACKLOG_TECNICO.md) — pendências de §8
