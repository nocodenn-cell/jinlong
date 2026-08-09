# AUDITORIA UI/UX + PERFORMANCE — JINLONG — PÓS-SPRINTS

**Data:** 2026-08-09
**Commit base:** `639d8815`
**Deploy analisado:** `dpl_4JeNWpvHQ8q85cPP1Wdvr12qgYcy` (production, branch `main`)
**Projeto Supabase:** `jinlong` (região sa-east-1)
**Projeto Vercel:** `pdv-importados` (região `gru1`)

> Este documento é **diagnóstico**. Nenhuma alteração de código ou de banco foi feita.
> Todos os números abaixo foram **medidos em produção**, não estimados.

---

## 0. RESUMO EXECUTIVO — O QUE REALMENTE ESTÁ ACONTECENDO

As sprints anteriores de UI/UX **não estavam erradas no que fizeram** (a consolidação
`/gerente` → `/admin` foi bem executada e é real). Elas estavam erradas **no critério de
pronto**: nenhuma delas mediu o comportamento em produção. O resultado é um painel que
parece completo no código e falha na operação.

Três fatos que derrubam a premissa de "telas concluídas":

1. **`/admin/relatorios` está quebrado em produção, não lento.** Os logs do Postgres de
   produção mostram **5 `canceling statement due to statement timeout` consecutivos,
   espaçados exatamente 8 segundos** (15:29:21 → 15:29:55 UTC). A página gasta ~34 s só
   morrendo, devolve HTTP 200 com todos os dados vazios e mostra a mensagem de timeout.

2. **A causa não é volume de dados, agregação pesada, paginação nem falta de índice.**
   O banco tem **127 vendas, 127 itens de venda, 133 produtos**. A causa é uma função
   auxiliar de fuso horário (`relatorio_tz_validado`) que varre `pg_timezone_names`
   (1.196 linhas vindas do sistema operacional) **uma vez por linha de `vendas`**.
   Medição direta: **57,9 ms por chamada**.

3. **Não é um problema só de Relatórios.** A mesma função alimenta o dashboard, e a
   arquitetura de carregamento (waterfall sequencial + zero cache + 4 idas de auth por
   navegação + N+1 em 3 telas) explica a lentidão generalizada relatada pelo usuário.

**Veredito de score:** de 28 rotas `/admin`, **1 RED, 13 YELLOW, 14 GREEN**. Mas o único
RED é a tela que o dono do negócio usa para decidir — e ela derruba a confiança em todo o
painel.

---

## 1. METODOLOGIA E EVIDÊNCIAS

Medições feitas contra o banco de **produção**, com `SET LOCAL role authenticated` e
`request.jwt.claims` de um usuário real de perfil `DONO` — ou seja, **com RLS ativa, no
mesmo caminho que a aplicação usa**. Rodar como role privilegiada (que ignora RLS) dá
resultados enganosos: a mesma função que leva 11,5 s como `authenticated` leva 60 ms como
role privilegiada.

Fontes de evidência:

| Fonte | O que forneceu |
|---|---|
| `EXPLAIN (ANALYZE, TIMING)` em produção sob RLS | Tempo real de cada RPC de relatório |
| Logs Postgres (Supabase) | 6 `statement timeout` reais, com timestamps |
| Logs Auth (Supabase) | 89 chamadas `/user`, 11 chamadas `/admin/users/<id>` (N+1) |
| Vercel runtime errors | `middleware` parado em 25 s, 10 ocorrências, 4 usuários |
| Vercel runtime logs | Correlação de horário e `cache=MISS` em todas as rotas |
| Leitura de código | Waterfalls, N+1, gates de auth, CSS do divisor |

---

## 2. CAUSAS RAIZ

Sintoma ≠ causa. Abaixo, as quatro causas raiz reais, em ordem de impacto.

### CR-1 — `relatorio_tz_validado()` é avaliada por linha e varre o catálogo de fusos do SO

**Esta é a causa raiz do problema de Relatórios.** Não é a query de negócio.

```sql
CREATE OR REPLACE FUNCTION public.relatorio_tz_validado(p_tz text)
 RETURNS text LANGUAGE sql STABLE
AS $function$
  SELECT CASE
    WHEN p_tz IS NULL OR btrim(p_tz) = '' THEN 'America/Sao_Paulo'::text
    WHEN EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = p_tz) THEN p_tz
    ELSE 'America/Sao_Paulo'::text
  END;
$function$
```

`pg_timezone_names` **não é uma tabela**: é uma view sobre uma função C que lê e faz o
parse dos arquivos de tzdata do sistema operacional a cada varredura. Não tem índice e não
tem estatística.

Medições em produção:

| Operação | Tempo | Linhas |
|---|---:|---:|
| `SELECT count(*) FROM pg_timezone_names` | **54,7 ms** | 1.196 |
| `SELECT relatorio_tz_validado('America/Sao_Paulo')` | **57,9 ms** | 1 |

O problema é **onde** ela é chamada. Nas RPCs de período, a função aparece dentro do
`WHERE`, aplicado linha a linha:

```sql
-- relatorio_margem_por_venda_periodo (migration 241)
WHERE v.status = 'CONCLUIDA'
  AND (v.data AT TIME ZONE public.relatorio_tz_validado(p_tz))::date BETWEEN p_de AND p_ate
```

`STABLE` permite ao planner reutilizar o resultado dentro de um *index scan*, mas **não
garante memoização de um predicado de filtro linha a linha**. Com 127 vendas, isso dá
~127 × 57,9 ms ≈ **7,4 s por passagem de predicado** — consistente com os tempos medidos.

**Prova controlada.** Mesma query, mesma RLS, mesmo usuário, mesmas 16 linhas de
resultado. A única diferença é trocar `relatorio_tz_validado(p_tz)` por uma string
literal:

| Versão | Planning | Execution |
|---|---:|---:|
| Com `relatorio_tz_validado(p_tz)` | 0,1 ms | **11.562 ms** |
| Com `'America/Sao_Paulo'` literal | 11,4 ms | **4,4 ms** |

**Diferença: ~2.600×.** A query de negócio nunca foi o problema.

**Tempos reais das 7 chamadas da página `/admin/relatorios`** (produção, RLS, perfil DONO,
período de 30 dias):

| # | Chamada | Tempo | Linhas | Usa tz? | Sobrevive aos 8 s? |
|---|---|---:|---:|:--:|:--:|
| 1 | `relatorio_vendas_por_dia_periodo` | **16.639 ms** | 4 | sim | ❌ |
| 2 | `relatorio_top_produtos_periodo` | **11.753 ms** | 16 | sim | ❌ |
| 3 | `relatorio_resumo_executivo_periodo` | **12.338 ms** | 1 | sim | ❌ |
| 4 | `v_estoque_baixo` (select) | 2,0 ms | 68 | não | ✅ |
| 5 | `relatorio_margem_por_venda_periodo` | **12.377 ms** | 91 | sim | ❌ |
| 6 | `relatorio_curva_abc_periodo` | **11.562 ms** | 16 | sim | ❌ |
| 7 | `relatorio_cobertura_estoque` | 270 ms | 119 | não | ✅ |

**Exatamente 5 das 7 usam a função de fuso, e exatamente 5 timeouts aparecem nos logs de
produção.** A correspondência é 1:1.

**Escopo do defeito** — funções no banco que dependem de `relatorio_tz_validado`:

- `relatorio_vendas_por_dia_periodo`
- `relatorio_top_produtos_periodo`
- `relatorio_resumo_executivo_periodo`
- `relatorio_margem_por_venda_periodo`
- `relatorio_curva_abc_periodo`
- **`dashboard_gerente_resumo`** ← alimenta `/admin/dashboard`
- `relatorio_settings_normalize_timezone` (trigger, execução pontual — irrelevante)

`dashboard_gerente_resumo` medido: **685 ms**. Sobrevive ao limite de 8 s, mas é ~500×
mais lento do que deveria. O dashboard é a primeira tela após o login — é aqui que nasce a
percepção de "o sistema é lento".

### CR-2 — Carregamento sequencial e zero cache

`carregarDadosRelatoriosGerente` (`app/gerente/relatorios/actions.ts`, linhas 101–151)
executa **8 idas ao banco em série**, sem um único `Promise.all`:

```
createClient → getRelatorioTimezone → RPC 1 → RPC 2 → RPC 3
  → v_estoque_baixo → RPC 4 → RPC 5 → RPC 6
```

Como cada RPC lenta morre em 8 s e elas são sequenciais, os tempos **somam** em vez de se
sobreporem: 5 × 8 s ≈ 34 s antes de a página responder.

Agravante de produto: a página carrega **os 7 conjuntos de dados de uma vez**, mas a
interface só mostra **uma aba por vez** (`visao | produtos | estoque | margem`, em
`RelatoriosContent.tsx`). Curva ABC (limite 500) e margem por venda (limite 200) são
buscadas mesmo quando o usuário nunca abre a aba "Margem". **Hoje ninguém paga só pelo que
vê.**

Cache: o layout admin desabilita tudo explicitamente —

```js
// app/admin/layout.tsx
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
```

Confirmado nos logs Vercel: **`cache=MISS` em 100% das requisições**. A única exceção no
projeto inteiro é `unstable_cache(revalidate: 120)` nas opções de filtro do catálogo.

### CR-3 — Middleware sem timeout, na frente de todas as rotas

`middleware.ts` roda em `/admin/:path*`, `/gerente/:path*` e `/caixa/:path*`, e faz
`fetchRawSession` → `auth.getUser()` + `SELECT … FROM usuarios` **em série, sem
`AbortController`, sem timeout, sem fallback**.

Erro real em produção (Vercel):

```
[Error: Your function was stopped as it did not return an initial response within 25s]
count=10  users=4  routes=/middleware
first=2026-08-09T01:06:34Z  last=2026-08-09T01:51:41Z
```

Medi as duas dependências e **nenhuma explica 25 s**:

- `auth.getUser()` em produção: p50 **10,5 ms**, p95 233 ms, máx 528 ms (89 amostras, 100% HTTP 200)
- `SELECT … FROM usuarios WHERE id = …` sob RLS: **0,156 ms** de execução

Portanto **não afirmo ter provado o gatilho** dos 25 s (indisponibilidade transitória de
rede a partir do Edge é a hipótese mais provável). O que *está* provado é o defeito
estrutural: **qualquer lentidão a montante congela toda a navegação do painel por até 25 s
e depois falha de forma dura**, porque não existe timeout nem caminho degradado. Isso é um
defeito de resiliência independente do gatilho.

Custo fixo por navegação: **4 idas de autenticação** — 2 no Edge (middleware, não
deduplicadas) + 2 no RSC (`getUser` + `usuarios`, essas sim memoizadas por request com
`cache()`). `/admin/vendas` adiciona um 5º `getUser` dentro da própria action.

### CR-4 — N+1 em três telas

| Tela | Padrão | Evidência |
|---|---|---|
| `/admin/funcionarios` | 1 query + **N × `auth.admin.getUserById`** | `actions.ts:110` + logs de produção: **11 chamadas `/admin/users/<id>` em 2 s** (15:28:16–17) |
| `/admin/categorias-produtos` | 1 query + até **50** contagens | `categorias-produtos/actions.ts:63-67` |
| `/admin/marcas-produtos` | 1 query + até **50** contagens | `marcas-produtos/actions.ts:88-95` |

O caso de Funcionários é o mais grave por ser **HTTP contra a API Auth**, não SQL: com o
limite de 100 do código, uma loja com 100 funcionários dispara 100 requisições HTTP para
listar uma tabela. O e-mail poderia vir de um join único com `auth.users`.

---

## 3. RELATÓRIOS — CADEIA CAUSAL COMPLETA

Reconstrução do incidente real de produção (todos os horários em UTC, 2026-08-09):

| Horário | Evento | Fonte |
|---|---|---|
| 15:29:13 | `GET /admin/relatorios` entra no edge-middleware | Vercel |
| 15:29:21 | `canceling statement due to statement timeout` (RPC 1) | Postgres |
| 15:29:29 | timeout (+8 s) | Postgres |
| 15:29:38 | timeout (+9 s) | Postgres |
| 15:29:46 | timeout (+8 s) | Postgres |
| 15:29:55 | timeout (+8 s) | Postgres |
| 15:30:25 | `GET /admin/relatorios 200` serverless, `cache=MISS` | Vercel |

Os intervalos de 8 s **são** o `statement_timeout` do role `authenticated`, confirmado na
configuração do banco:

```
authenticated  → statement_timeout=8s
anon           → statement_timeout=3s
authenticator  → statement_timeout=8s, lock_timeout=8s
```

**Sequência do defeito:**

1. Server Component aguarda `carregarDadosRelatoriosGerente` — bloqueante, sem streaming.
2. 5 RPCs de período chamam `relatorio_tz_validado` por linha → cada uma precisaria de 11–17 s.
3. Postgres mata cada uma aos 8 s (código 57014).
4. Como são sequenciais, o usuário espera a **soma** (~34 s de banco).
5. A action colapsa os erros num único `rpcErro` com `??`, **perdendo qual RPC falhou**.
6. `mensagemErroParaUsuario` casa a substring `timeout` e devolve a mensagem genérica.
7. A página renderiza **HTTP 200** com KPIs zerados, gráficos vazios e o banner de erro.

**Classificação da causa** (conforme solicitado):

| Camada | Culpada? | Justificativa |
|---|:--:|---|
| Frontend | Não | O React não é o gargalo; a página só espera |
| Rede | Não | Vercel `gru1` e Supabase `sa-east-1` são colocalizados |
| Payload | Não | 4 a 119 linhas por chamada |
| Banco (volume/índice) | Não | 127 vendas; `idx_vendas_data` existe |
| **Banco (função auxiliar)** | **SIM** | `relatorio_tz_validado` → `pg_timezone_names` por linha |
| **Arquitetura de carregamento** | **SIM** | 8 chamadas sequenciais, tudo no load, 1 aba visível |
| Timeout | Sintoma | O limite de 8 s está **correto**; ele expôs o defeito |

> **O timeout não deve ser aumentado.** Ele é o mecanismo que impede uma query defeituosa
> de esgotar as conexões do banco. Aumentá-lo trocaria "erro em 34 s" por "painel inteiro
> travado". A correção é fazer a query custar milissegundos — o que a prova controlada
> mostra ser possível (4,4 ms).

**Observação sobre paginação e agregações pesadas** (perguntado no escopo): não há problema
real de paginação nem de agregação. Os limites existem (50 / 200 / 500 / 40) e as
agregações são triviais no volume atual. Esse não é o gargalo — é importante registrar isso
para não gastar esforço no lugar errado.

---

## 4. FUNCIONÁRIOS — PROBLEMAS

### 4.1 A barra atravessando a interface

Localizada. **Não está no modal** — `DragonModal` e `.dragon-elev-2` não têm nenhuma borda
ou divisor (verificado em `components/ui/DragonModal.tsx` e `styles/theme-oriental.css:612`).
Está na **tela de cadastro/listagem**, `/admin/funcionarios`.

Mecanismo:

```tsx
// FuncionariosListClient.tsx:384
className="rounded-none border-x-0 border-b-0"
```

A raiz do `DataTable` já traz `border` (1px nos 4 lados, `DataTable.tsx:128`). As classes
acima zeram esquerda, direita e baixo — **sobra só a borda de cima**. Sem caixa ao redor,
essa borda vira uma **régua horizontal solta atravessando a largura do cartão**.

E na tela de Funcionários isso acontece **duas vezes**, porque ela é a única que renderiza
a lista em dois grupos (`Equipe` e `Acessos protegidos`), cada um com seu próprio
`DataTable`, todos dentro de um único `SectionCard` — que já tem a sua própria borda
inferior sob o título (`SectionCard.tsx:22`). Resultado: até **três linhas horizontais
empilhadas** numa faixa vertical curta, com a do meio parecendo cortar a interface.

O padrão `border-x-0 border-b-0` está em 8 outras telas admin, mas nelas o `DataTable` é o
**único filho** do cartão, então a borda de cima só duplica o divisor do título. Funcionários
é a única com agrupamento — por isso o defeito só foi percebido ali.

> **Ressalva honesta:** este é o mecanismo identificado por leitura de código e CSS. Não
> consegui confirmar visualmente em produção porque não tenho credenciais de login. A
> confirmação visual é o primeiro passo antes da correção.

### 4.2 Excesso de responsabilidades no formulário

O modal mistura, num único passo, quatro naturezas diferentes:

| Natureza | Campos |
|---|---|
| Dados pessoais | `nome` |
| Credenciais | `email`, `senha` |
| Permissões | `perfil` |
| Preferências | `idioma` |

São só 5 campos — **não é um formulário grande**. O problema não é volume, é que
`email` + `senha` (credenciais, imutáveis/sensíveis) aparecem com o mesmo peso visual de
`idioma` (preferência trivial, alterável pelo próprio usuário depois). Na edição, `email`
fica desabilitado e `senha` vira "nova senha opcional" — o mesmo formulário muda de
significado sem mudar de forma.

**Recomendação (baixo custo, sem tela nova):** manter um único modal, mas separar
visualmente em dois blocos — "Dados de acesso" (nome, e-mail, senha) e "Permissões e
preferências" (perfil, idioma). Não criar wizard, não criar página, não criar aba.

### 4.3 Outros achados

| Item | Estado |
|---|---|
| Validações | ✅ `minLength`, `required`, política de senha centralizada |
| Permissões | ✅ `funcionarioPolicies.ts` com testes; bloqueios de auto-desativação e DONO/ADMIN |
| Estados loading | ✅ `salvando` desabilita campos e botões |
| Erro | ⚠️ Só via toast; erro não fica ancorado ao campo que falhou |
| Sucesso | ✅ Atualização otimista da lista, sem recarregar a página |
| Responsividade | ✅ Tabela em desktop, cards em mobile |
| Fluxo criação/edição | ✅ Funciona |
| **Performance** | ❌ N+1 (item CR-4) |
| **Gate de dados** | ⚠️ Usa `service_role` (`createAdminClient`) e filtra `loja_id` em código de aplicação, contornando a RLS |

O último ponto merece atenção: não é um bug hoje, mas é uma **fonte de verdade paralela**
para isolamento por loja. Se alguém esquecer o `.eq('loja_id', …)` numa query futura, o
vazamento entre lojas é silencioso.

---

## 5. PERFORMANCE GLOBAL

### 5.1 Custo fixo pago por toda navegação no painel

| Camada | Operações | Deduplicado? |
|---|---|---|
| Edge middleware | `getUser` + `usuarios` | ❌ não |
| RSC (layout + page) | `getUser` + `usuarios` | ✅ via `cache()` |
| Layout admin | RPC `pdv_config_flags_visuais` + contagem `v_estoque_baixo` | ❌ |
| Cache HTTP | nenhum (`cache=MISS` em 100%) | — |

**Total: 6 idas de ida-e-volta antes de a página começar o próprio trabalho.**

### 5.2 Um efeito colateral pouco óbvio: o planner custa mais que a execução

Sob RLS, o tempo de **planejamento** domina o de execução em todas as consultas medidas:

| Consulta | Planning | Execution | Razão |
|---|---:|---:|---:|
| contagem `v_estoque_baixo` | **35,4 ms** | 2,0 ms | 18× |
| `usuarios` por id (middleware) | **16,8 ms** | 0,16 ms | 105× |
| join 3 tabelas (itens×vendas×produtos) | **9,3 ms** | 3,5 ms | 2,7× |
| `itens_venda` count | 7,0 ms | 2,0 ms | 3,5× |

Motivo: as policies se expandem numa árvore grande de subplans (**72 subplans** só em
`itens_venda`). Isso **não é um bug** — as policies estão corretas e bem escritas (usam
`InitPlan`, ou seja, avaliam uma vez, não por linha). Mas significa que **cada consulta
extra custa ~10–35 ms fixos mesmo retornando nada**. É exatamente por isso que reduzir o
*número* de consultas por página importa mais aqui do que otimizar cada uma.

### 5.3 Consultas sem limite

| Local | Consulta |
|---|---|
| `app/admin/dashboard/page.tsx:165-176` | `vendas` do período e do período anterior, sem `.limit()` |
| `lib/.../financeiroTitulosServer.ts:129` | `select('*', { count: 'exact', head: true })` |
| `app/admin/estoque/transferencias/page.tsx` | `lojas` sem `.limit()` |
| `app/admin/financeiro/documento/[id]/page.tsx` | `eventos` sem `.limit()` |
| `app/admin/catalogo` (opções de filtro) | categorias, marcas, fornecedores sem `.limit()` (mitigado por cache de 120 s) |

Nenhuma é crítica no volume atual. Todas são bombas-relógio: crescem com o uso do cliente.

---

## 6. AUDITORIA DE TODAS AS TELAS

Legenda: **GREEN** = funciona, rápida, clara · **YELLOW** = funciona com problema
relevante · **RED** = não funciona adequadamente.

| Rota | Funciona | Performance | UX | Complexidade | Problema | Ação |
|---|---|---|---|---|---|---|
| `/admin/relatorios` | ❌ | 🔴 ~34 s + erro | 🟡 | Alta | 5 RPCs morrem no timeout; carrega 4 abas para mostrar 1 | **RED** — CR-1 + carregamento por aba |
| `/admin/dashboard` | ✅ | 🟡 RPC 685 ms, 9–11 ops | ✅ | Alta | `dashboard_gerente_resumo` usa a função de fuso; `vendas` sem limite | **YELLOW** — CR-1 + limitar |
| `/admin/auditoria` | ✅ | 🟡 ~8–9 queries em série | 🟡 | Alta | 6 fontes sequenciais × limite 150 | **YELLOW** — paralelizar |
| `/admin/funcionarios` | ✅ | 🟡 1 + N HTTP Auth | 🟡 | Média | N+1 + divisor visual | **YELLOW** — join + CSS |
| `/admin/financeiro` | ✅ | 🟡 7 ops (paralelas) | 🟡 | Alta | `select('*')` em count; 3 abas + 1 rota separada | **YELLOW** |
| `/admin/categorias-produtos` | ✅ | 🟡 1 + até 50 | ✅ | Baixa | N+1 de contagem | **YELLOW** |
| `/admin/marcas-produtos` | ✅ | 🟡 1 + até 50 | ✅ | Baixa | N+1 de contagem | **YELLOW** |
| `/admin/catalogo` | ✅ | 🟢 paralelo + cache 120 s | ✅ | Média | Melhor referência do painel | **GREEN** |
| `/admin/estoque` | ✅ | 🟢 2 paralelas, RPC paginada | ✅ | Média | — | **GREEN** |
| `/admin/vendas` | ✅ | 🟡 +1 `getUser` redundante | ✅ | Média | Auth extra fora do cache | **YELLOW** |
| `/admin/clientes` | ✅ | 🟢 1 query paginada | ✅ | Baixa | — | **GREEN** |
| `/admin/fornecedores` | ✅ | 🟢 1 query paginada | 🟡 | Baixa | Renderiza `CatalogoHubNav` (abas de catálogo) — copy-paste | **YELLOW** |
| `/admin/compras` | ✅ | 🟡 4 paralelas, 2× limite 500 | ✅ | Média | Pré-carrega 1.000 linhas para comboboxes | **YELLOW** |
| `/admin/comissoes` | ✅ | 🟢 1 RPC | ✅ | Baixa | — | **GREEN** |
| `/admin/configuracoes` | ✅ | 🟢 2 paralelas | ✅ | Média | — | **GREEN** |
| `/admin/implantacao` | ✅ | 🟡 ~5 em série | 🟡 | Média | **GET com escrita**: `ensureChecklistRows` faz upsert ao renderizar | **YELLOW** |
| `/admin/diagnostico-caixa` | ✅ | 🟡 dispara sondas no load | 🟡 | Baixa | Ferramenta interna no menu do produto | **YELLOW** |
| `/admin/suspensao` | ✅ | 🟢 1 query | 🟡 | Baixa | **Não usa `loadAdminContext`** — gate divergente | **YELLOW** |
| `/admin/provisionamento` | ✅ | 🟢 0 queries | ✅ | Média | Ferramenta interna (ADMIN) | **GREEN** |
| `/admin/financeiro/documento/[id]` | ✅ | 🟢 2 paralelas | ✅ | Baixa | `eventos` sem limite | **GREEN** |
| `/admin/estoque/recebimento` | ✅ | 🟢 2 paralelas | ✅ | Média | — | **GREEN** |
| `/admin/estoque/transferencias` | ✅ | 🟢 2 paralelas | ✅ | Média | `lojas` sem limite | **GREEN** |
| `/admin/estoque/importar-nfe` | ✅ | 🟢 0 no servidor | ✅ | Alta | — | **GREEN** |
| `/admin/estoque/imprimir-etiquetas` | ✅ | 🟢 0 no servidor | ✅ | Baixa | — | **GREEN** |
| `/admin/categorias-financeiras` | ✅ | 🟢 1 query | ✅ | Baixa | — | **GREEN** |
| `/admin` | ✅ | 🟢 redirect | ✅ | — | — | **GREEN** |
| `/admin/catalogo/novo` | ✅ | 🟢 redirect | ✅ | — | — | **GREEN** |
| `/admin/financeiro/contas-pagar` | ✅ | 🟢 redirect | ✅ | — | — | **GREEN** |

**Score: 1 RED · 13 YELLOW · 14 GREEN.**

### Ranking das piores telas

1. **`/admin/relatorios`** — única tela que falha em produção. P0.
2. **`/admin/dashboard`** — funciona, mas é a primeira impressão e carrega o mesmo defeito.
3. **`/admin/auditoria`** — a mais cara em número de idas sequenciais ao banco.
4. **`/admin/funcionarios`** — N+1 + o defeito visual relatado.
5. **`/admin/financeiro`** — a mais densa em informação; 7 operações e 4 destinos de aba.

---

## 7. TELAS REDUNDANTES — E POR QUE A PREMISSA PRECISA SER CORRIGIDA

O pedido parte de que existe "excesso de telas". **Os dados não sustentam isso da forma
esperada, e é importante dizer isso em vez de produzir uma lista de remoções para agradar.**

A consolidação `/gerente` → `/admin` **já foi feita e está correta**:

- Existem apenas **4 arquivos `page.tsx`** em `app/gerente/**`, e **todos os 4 são redirects**.
- Não há **nenhuma** tela viva duplicada entre `/admin` e `/gerente`.
- `/admin/produtos` **não é uma rota** — é um módulo de domínio no servidor (actions,
  readers, writers). A única tela de produto é `/admin/catalogo`.
- Os subcaminhos de relatório (`relatorios/vendas`, `/estoque`, `/sem-giro`) **já** apontam
  todos para `/admin/relatorios`.

O que existe de verdade é **código morto**, não telas redundantes:

| Arquivo | Situação |
|---|---|
| `app/gerente/produtos/ProdutosGerentePageClient.tsx` | `@legacy`, não roteado |
| `app/gerente/financeiro/FinanceiroGerentePageClient.tsx` | `@legacy`, não roteado |
| `app/gerente/vendas/VendasGerenteListClient.tsx` | `@legacy`, não roteado |
| `app/gerente/relatorios/RelatoriosGerentePageClient.tsx` | `@legacy`, não roteado |
| `app/gerente/relatorios/{vendas,estoque,sem-giro}/*Client.tsx` | órfãos, sem `page.tsx` |

Pela regra do próprio projeto (`.cursor/rules/entity-ssot.mdc`), esses arquivos **não devem
ser apagados agora** — são evidência de migração e devem sobreviver 1–2 releases estáveis.

**Conclusão honesta: não há tela para eliminar hoje.** A complexidade percebida não vem da
quantidade de rotas — vem de (a) o menu expor ferramenta interna junto com operação e (b) a
navegação ter três mecanismos diferentes (sidebar, abas de hub, `?tab=`).

---

## 8. TELAS A CONSOLIDAR

Todas as propostas abaixo **reduzem** superfície. Nenhuma cria tela, card ou CTA novo.

| # | Proposta | Hoje | Depois | Risco |
|---|---|---|---|---|
| C-1 | Tirar ferramenta interna do menu de operação | `provisionamento`, `implantacao`, `diagnostico-caixa` ocupam 3 linhas do grupo SISTEMA | Agrupar sob uma entrada "Ferramentas internas" (as rotas continuam existindo) | Baixo — já são `adminOnly` |
| C-2 | `suspensao` vira aba de Configurações | Rota própria de 16 linhas no menu | Aba em `/admin/configuracoes` | Baixo |
| C-3 | `categorias-financeiras` vira a 4ª aba real de Financeiro | Rota separada, alcançada por aba que troca de página | Aba no mesmo `?tab=` das outras três | Baixo |
| C-4 | `categorias-produtos` + `marcas-produtos` numa tela só | 2 rotas quase idênticas (ambas 311 linhas, mesmo layout, mesmo N+1) | Uma tela "Classificação" com dois painéis | Médio — dois CRUDs reais |
| C-5 | Unificar o mecanismo de navegação | sidebar + hub tabs + `?tab=` | Padronizar em `?tab=` dentro do hub | Médio — toca várias telas |

**Não consolidar:** `catalogo`/`estoque`/`vendas`/`financeiro` são hubs legítimos com
entidades distintas. Uni-los aumentaria a complexidade em vez de reduzi-la.

---

## 9. PRIORIZAÇÃO

### P0 — impede o uso

| ID | Item | Evidência |
|---|---|---|
| **P0-1** | `relatorio_tz_validado` avaliada por linha derruba as 5 RPCs de relatório | 5 timeouts em produção; 11.562 ms → 4,4 ms na prova controlada |
| **P0-2** | `/admin/relatorios` carrega 8 chamadas em série e bloqueia o render | `actions.ts:101-151` |

### P1 — prejudica a operação

| ID | Item |
|---|---|
| **P1-1** | `dashboard_gerente_resumo` a 685 ms pelo mesmo defeito (primeira tela após login) |
| **P1-2** | Middleware sem timeout/fallback na frente de todas as rotas (erro real de 25 s) |
| **P1-3** | N+1 de `getUserById` em Funcionários (11 HTTP confirmados em produção) |
| **P1-4** | `/admin/relatorios` busca 4 abas para exibir 1 |
| **P1-5** | `/admin/auditoria` com ~9 consultas sequenciais |
| **P1-6** | Divisor visual em `/admin/funcionarios` |

### P2 — melhoria

| ID | Item |
|---|---|
| **P2-1** | N+1 de contagem em categorias e marcas |
| **P2-2** | Consultas sem limite (dashboard, financeiro, transferências, documento) |
| **P2-3** | `getUser` redundante em `/admin/vendas` |
| **P2-4** | `/admin/implantacao` escreve durante um GET |
| **P2-5** | `/admin/suspensao` não usa `loadAdminContext` |
| **P2-6** | `/admin/fornecedores` mostra as abas de Catálogo |
| **P2-7** | `rpcErro` colapsa 6 erros com `??` e perde a origem |
| **P2-8** | Consolidações C-1 a C-3 |

### P3 — polish

| ID | Item |
|---|---|
| **P3-1** | Agrupar visualmente credenciais × permissões no modal de funcionário |
| **P3-2** | Erros de formulário ancorados ao campo, não só em toast |
| **P3-3** | Consolidações C-4 e C-5 |
| **P3-4** | Remover `@legacy` órfãos (só após 1–2 releases estáveis) |

---

## 10. CORREÇÕES RECOMENDADAS

### P0-1 — Eliminar a varredura de fusos por linha

Três opções, da mais barata para a mais estrutural:

1. **Tornar a validação imutável e sem catálogo** (recomendada). Trocar
   `EXISTS (SELECT 1 FROM pg_timezone_names …)` por uma tentativa de cast
   (`p_tz::timestamptz` em bloco de exceção) ou por uma allow-list pequena, e marcar a
   função como `IMMUTABLE`. `IMMUTABLE` permite ao planner dobrar a constante **uma vez**.
2. **Resolver o fuso uma vez por chamada**, materializando-o numa variável antes do
   `WHERE` (função `plpgsql` com `v_tz := relatorio_tz_validado(p_tz)`), de modo que o
   predicado use um valor escalar.
3. **Comparar por intervalo em vez de por expressão**: converter `p_de`/`p_ate` para
   `timestamptz` uma vez e filtrar `v.data >= inicio AND v.data < fim`. Isso resolve o
   problema *e* torna o predicado sargável, permitindo o uso de `idx_vendas_data`.

A opção 3 é a mais correta a longo prazo. As opções 1 e 2 são o caminho mais rápido para
tirar produção do vermelho hoje. **Nenhuma delas altera regra de negócio, contrato de
retorno ou fonte de verdade.**

**Validação obrigatória antes do merge:** rodar `EXPLAIN (ANALYZE)` das 5 RPCs com
`SET LOCAL role authenticated` e exigir **< 500 ms** cada. Medir como role privilegiada não
vale: `relatorio_cobertura_estoque` mede 60 ms como role privilegiada e 270 ms sob RLS —
uma diferença de 4,5× que esconderia regressões.

### P0-2 — Carregar só o que a aba mostra

- `Promise.all` para o que a "Visão geral" precisa (`porDia`, `resumoExecutivo`).
- Mover produtos, estoque e margem para carregamento sob demanda quando a aba abrir.
- Usar `<Suspense>` para os KPIs aparecerem antes das tabelas.

Isso reduz o carregamento inicial de **7 conjuntos para 2**, sem remover funcionalidade.

### P1-2 — Blindar o middleware

Envolver `fetchRawSession` em `Promise.race` com um timeout curto (~3 s) e um caminho
degradado explícito. Um painel que redireciona para o login em 3 s é operável; um painel
que congela 25 s não é.

### P1-3 — Remover o N+1 de Funcionários

Substituir N × `getUserById` por uma única leitura de e-mails (join com `auth.users` via
função `SECURITY DEFINER`, ou coluna espelhada em `usuarios`). De 1 + N requisições para 1.

### P1-6 — Corrigir o divisor

Trocar `border-x-0 border-b-0` por `border-0` nos `DataTable` agrupados de Funcionários, ou
dar a cada grupo o seu próprio `SectionCard`. Vale revisar as outras 8 telas com o mesmo
padrão — nelas o efeito é uma linha duplicada sob o título, menos visível mas igualmente
não intencional.

---

## 11. O QUE **NÃO** DEVE SER ALTERADO

| Item | Por quê |
|---|---|
| **`statement_timeout = 8s`** | É a proteção que impediu uma query defeituosa de esgotar o banco. Aumentar troca um erro visível por um painel travado. |
| **Políticas RLS** | Estão corretas e otimizadas (`InitPlan`, avaliação única). O custo de planning é consequência esperada, não defeito. |
| **Consolidação `/gerente` → `/admin`** | Foi bem executada. Não reabrir. |
| **Arquivos `@legacy`** | Regra do projeto: manter 1–2 releases. Não apagar nesta rodada. |
| **`idx_vendas_data`** | Já existe. Não criar índices novos antes de tornar os predicados sargáveis — índice novo não resolve predicado com função. |
| **Hubs Catálogo / Estoque / Financeiro** | Agrupamento legítimo. Não fundir. |
| **`DragonModal`** | Não é a origem do divisor. Não mexer. |
| **Stack tecnológica** | Nenhum problema encontrado exige biblioteca, cache externo, view materializada ou pipeline analítico novo. |

---

## 12. ORDEM IDEAL DE EXECUÇÃO

Ordenada por impacto operacional por unidade de risco.

| Ordem | Ação | Impacto esperado | Risco |
|---|---|---|---|
| 1 | **P0-1** — corrigir `relatorio_tz_validado` | Relatórios sai de "quebrado" para < 1 s; dashboard de 685 ms para ~50 ms | Baixo — 1 função, sem mudança de contrato |
| 2 | **Verificar em produção** com `EXPLAIN ANALYZE` sob `authenticated` | Confirma o ganho antes de seguir | Nenhum |
| 3 | **P0-2** — carregamento por aba + `Promise.all` | 7 conjuntos → 2 no load inicial | Baixo |
| 4 | **P1-2** — timeout no middleware | Remove a falha de 25 s em todas as rotas | Baixo |
| 5 | **P1-3** — N+1 de Funcionários | Remove até 100 chamadas HTTP por load | Médio — toca `service_role` |
| 6 | **P1-6** — divisor visual | Resolve o defeito relatado | Muito baixo |
| 7 | **P1-5** — paralelizar Auditoria | Tela mais cara em idas sequenciais | Baixo |
| 8 | **P2-7** — preservar qual RPC falhou | Sem isso, o próximo incidente volta a ser cego | Muito baixo |
| 9 | **P2-1/P2-2** — N+1 de contagem e limites | Previne degradação com o crescimento do cliente | Baixo |
| 10 | **P2-8** — consolidações C-1 a C-3 | Reduz o menu sem remover função | Baixo |
| 11 | **P3** — polish e consolidações maiores | — | Médio |

**Os passos 1 a 4 resolvem os dois sintomas relatados pelo usuário** (Relatórios com
timeout e lentidão generalizada). Os passos 5 a 8 impedem que voltem sem aviso.

---

## 13. CRITÉRIO DE PRONTO (a aplicar daqui em diante)

Uma tela só é "DONE" quando, **em produção**:

1. o fluxo principal se conclui;
2. o tempo até conteúdo útil é medido e aceitável;
3. os estados loading/erro/vazio refletem a realidade — em particular, **erro não pode ser
   renderizado como vazio** (hoje Relatórios mostra "sem dados" quando na verdade a
   consulta morreu);
4. a mensagem de erro identifica a operação que falhou;
5. não existe tela redundante;
6. há evidência de produção anexada ao PR.

O item 6 é o que faltou nas sprints anteriores. **`/admin/relatorios` passou por sprint de
UX, tem testes de comportamento (`RelatoriosContent.behavior.test.tsx`), teve PR aprovado e
mergeado — e nunca funcionou em produção**, porque os testes exercitam o componente com
dados injetados e nunca tocam a RPC real. Testes de UI verdes não são evidência de que a
tela funciona.

---

## ANEXO — REPRODUÇÃO DAS MEDIÇÕES

```sql
-- Medir uma RPC de relatório do jeito certo (com RLS, como a aplicação):
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<uuid-de-um-DONO>","role":"authenticated"}';
EXPLAIN (ANALYZE, TIMING)
SELECT * FROM public.relatorio_vendas_por_dia_periodo(
  current_date - 29, current_date, 'America/Sao_Paulo'
);
-- Observado em 2026-08-09: Execution Time: 16639 ms (4 linhas)

-- Isolar a causa:
EXPLAIN (ANALYZE) SELECT public.relatorio_tz_validado('America/Sao_Paulo');
-- Observado: 57,9 ms para retornar uma string

EXPLAIN (ANALYZE) SELECT count(*) FROM pg_timezone_names;
-- Observado: 54,7 ms, 1.196 linhas

-- Confirmar o limite que dispara a mensagem ao usuário:
SELECT rolname, rolconfig FROM pg_roles WHERE rolname = 'authenticated';
-- authenticated → statement_timeout=8s
```

Volumes em produção no momento da auditoria: `produtos` 133 · `estoque` 131 ·
`vendas` 127 · `itens_venda` 127 · `caixas` 46 · `usuarios` 14.
