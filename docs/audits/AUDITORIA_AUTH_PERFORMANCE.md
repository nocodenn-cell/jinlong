# Auditoria de Performance — Auth

- **Data:** 2026-09-12, investigação entre 23:10 e 23:30 UTC.
- **Base:** [`RELATORIO_MEDICAO_NAVEGACAO_AUTENTICADA.md`](./RELATORIO_MEDICAO_NAVEGACAO_AUTENTICADA.md).
- **Ambiente:** produção. Vercel `pdv-importados` (deploy `main` `8bc56764`) e Supabase `jinlong` (`sa-east-1`).
- **Escopo:** somente leitura. Nenhum código, banco, configuração ou dado foi alterado.
- **Operações em produção:** apenas `SELECT` em views de estatística (`pg_stat_activity`, `pg_stat_database`, `pg_stat_statements`, `pg_settings`), leitura de logs (gateway, Auth, PostgREST, Postgres), leitura do JWKS público e 3 navegações de leitura com a sessão que o próprio usuário abriu.
- **Dados sensíveis:** nenhum token, cookie, sessão ou segredo foi lido ou registrado.

**Legenda de evidência:**

| Rótulo | Significado |
|---|---|
| **MEDIDO** | Número obtido de log ou estatística |
| **OBSERVADO** | Visto no código ou no estado do sistema |
| **INFERIDO** | Conclusão derivada das evidências acima |

---

## 1. Problema observado

A medição anterior (MEDIDO) encontrou:

| Caso | Total | Parte de autenticação |
|---|---:|---|
| Catálogo, 1ª navegação | 10,6 s | ~7,9 s: middleware `getUser` 3.056 ms + `usuarios` 2.382 ms; RSC `getUser` 401 ms + `usuarios` 2.057 ms |
| Dashboard, F5 frio | 12,4 s | `SELECT usuarios` no middleware com **8.184 ms**; `getUser` 680 ms + 829 ms |
| Vendas | 2,8 s | 0,9 a 1,7 s |
| Caixa | 2,7 s | 5 Server Actions em série, cada uma com 4 idas de auth |
| Prefetch | — | 3 a 5 links por tela, e cada prefetch passa pelo middleware |

**Pergunta a responder:** por que 2 a 8 s antes de uma consulta que, no banco, leva milissegundos?

---

## 2. Fluxo atual de autenticação

Todo o fluxo abaixo foi OBSERVADO no código.

### 2.1 Onde a sessão é obtida

| Camada | Arquivo | O que executa |
|---|---|---|
| **Middleware** (Edge), matcher `/admin/:path*`, `/gerente/:path*`, `/caixa/:path*` | [`middleware.ts:45-46`](../../pdv-importados/middleware.ts), [`lib/admin/auth/middlewareSupabase.ts:23-47`](../../pdv-importados/lib/admin/auth/middlewareSupabase.ts), [`lib/admin/auth/sessionConsistency.ts:96-122`](../../pdv-importados/lib/admin/auth/sessionConsistency.ts) | `createServerClient` → `auth.getUser()` (rede, Supabase Auth) → `SELECT perfil, idioma_preferido, loja_id, ativo FROM usuarios` (rede, PostgREST) → `middlewareAdminDecision`. **Não diferencia prefetch, RSC, documento ou POST de Server Action** (nenhuma checagem de `Next-Router-Prefetch` em `middleware.ts` nem em `lib/admin/policy`) |
| **Layout admin** (RSC, Node) | [`app/admin/layout.tsx:20`](../../pdv-importados/app/admin/layout.tsx) → `resolveAdminSession` = `getCachedAdminSession` | `React.cache` por request: `createClient` → `getUser` → `SELECT usuarios` (as mesmas 4 colunas). Depois `pdv_config_flags_visuais` e, se a flag estiver ativa, o count de `v_estoque_baixo` (`layout.tsx:34-43`) |
| **Páginas admin** (RSC) | ex.: [`app/admin/dashboard/page.tsx:111`](../../pdv-importados/app/admin/dashboard/page.tsx) → `loadAdminContext` → `getAdminSession` | Reaproveitam o **mesmo** `React.cache` do layout (`sessionConsistency.ts:185-223`), sem leitura extra |
| **Server Actions de gerência** | `assertGerenteSession` ([`lib/gerente/auth/assertGerenteSession.ts:20`](../../pdv-importados/lib/gerente/auth/assertGerenteSession.ts)) | Mesmo cache. Numa action disparada pelo cliente, o request é novo, então `getUser` e `usuarios` são refeitos |
| **Exceção em Vendas** | [`app/gerente/vendas/actions.ts:75-83`](../../pdv-importados/app/gerente/vendas/actions.ts) | `createVendasSupabaseClient` chama `auth.getUser()` **fora** do cache |
| **Caixa (página)** | [`app/caixa/page.tsx:9-34`](../../pdv-importados/app/caixa/page.tsx) | `getUsuarioIdioma` → `getUsuarioAtual` (um **segundo** `React.cache`, [`lib/auth/usuarioAtual.ts:25-53`](../../pdv-importados/lib/auth/usuarioAtual.ts): `getUser` + `SELECT perfil, idioma_preferido, loja_id`) → `auth.getUser()` de novo → `SELECT perfil FROM usuarios` de novo |
| **Caixa (Server Actions)** | `app/caixa/server/*.impl.ts` (ex.: `caixaCatalogo.impl.ts:146`) | `getUsuarioAtual` e, em vários pontos, `auth.getUser()` direto (15 ocorrências em `app/caixa/server`) |
| **Cliente (navegador)** | `CaixaCarrinhoAuthSync.tsx`, `CaixaPageClient.tsx:479` | `getSession()` / `onAuthStateChange`: leitura local, sem ida ao servidor. `hooks/useIdioma.ts:21` (`getUser`) só é usado por `SalesTrendChart.tsx` |

### 2.2 Clientes Supabase e conexões

- `createClient()` ([`lib/supabase/server.ts:5-30`](../../pdv-importados/lib/supabase/server.ts)) cria um objeto `createServerClient` a cada chamada, e isso acontece em layout, página e cada action.
- Criar o cliente **não** abre conexão: é um objeto em memória. As idas ao Supabase são requisições HTTPS ao gateway.
- As conexões com o **Postgres** são abertas pelos serviços do Supabase (GoTrue para `/auth/v1/*`, PostgREST para `/rest/v1/*`), não pelo app.

**Versões resolvidas (OBSERVADO):** `@supabase/ssr` 0.5.2, `@supabase/supabase-js` / `auth-js` 2.104.0, `next` 15.5.15.

**Assinatura de JWT do projeto (OBSERVADO via JWKS público):** 1 chave **ES256/EC** publicada. Tokens com assinatura assimétrica podem ser verificados localmente, ver §7.

---

## 3. Chamadas repetidas

Contagem por tipo de requisição. A coluna "Contagem nos logs" traz o número de chamadas `/auth/v1/user` e `/rest/v1/usuarios` encontradas nas janelas do relatório de medição e no experimento de §4.5.

| Tipo de requisição | `getUser` (Auth) | `SELECT usuarios` | Contagem nos logs | Status |
|---|---:|---:|---|---|
| Navegação para rota admin (RSC) | **2** (middleware + layout) | **2** (middleware + layout) | Estoque frio 23:28:56–58: Edge `/user` + Edge `usuarios` + node `/user` + node `usuarios` + RPC | **CONFIRMADO** |
| Prefetch de link visível | **1** (middleware) | **1** (middleware) | 23:28:59: 3× Edge `/user` + 3× Edge `usuarios`, **sem** chamada `node` (layout compartilhado não é re-renderizado no prefetch) | **CONFIRMADO** |
| Server Action do Caixa (POST) | **2** (middleware + `getUsuarioAtual`) | **2** | 22:56:09–10 e 22:58:19–20: cada action = Edge `/user` + Edge `usuarios` + node `/user` + node `usuarios` + RPC | **CONFIRMADO** |
| Abertura do Caixa (RSC) | 2 no middleware + **1** no RSC | 1 no middleware + **2** no RSC | 22:56:07–08: um `node /user` e dois `node usuarios` | **CONFIRMADO** (as 2 leituras de perfil); ver a linha seguinte |
| `getUser` duplicado no código (Caixa page, Vendas) virando 1 chamada | — | — | Só 1 `node /user` por render, embora o código chame duas vezes | **PROVÁVEL** que seja a deduplicação de `fetch` GET idêntico que o Next faz durante o render RSC. Mecanismo não verificado no código-fonte do Next |
| Leituras de perfil em caches distintos | — | — | `getCachedAdminNormalization` e `getUsuarioAtual` são dois `React.cache` que leem `usuarios` com colunas diferentes | **CONFIRMADO** (código + 2 leituras no Caixa) |

**Totais de uma navegação típica por clique (INFERIDO, somando as linhas acima):**
- 4 idas de auth para a rota;
- mais **2 por prefetch** (3 a 5 prefetches, ou seja, 6 a 10 idas em paralelo);
- Caixa: 3 do RSC mais **20** das 5 actions (4 × 5).

---

## 4. Evidências de produção

### 4.1 O tempo não está na execução SQL (MEDIDO, `pg_stat_statements` desde 2026-06-02)

| Consulta | Chamadas | Média | **Máx. histórico** | Maior tempo visto no gateway |
|---|---:|---:|---:|---:|
| `SELECT perfil, idioma_preferido, loja_id, ativo FROM usuarios WHERE id=…` (PostgREST) | 25.850 | 1,9 ms | **566 ms** | **8.184 ms**, 2.382 ms, 2.057 ms |
| `set_config(search_path, role, jwt.claims…)` (PostgREST, por request) | 139.971 | 1,9 ms | 688 ms | — |
| GoTrue: `SELECT users…` / `sessions…` / `identities…` / `mfa_*` (por `/user`) | ~75 mil cada | 0,24 a 0,99 ms | 361 a 1.587 ms | `/user` 2.740 ms (duração interna do GoTrue) |

**Conclusão:** o `SELECT usuarios` nunca levou mais de 566 ms executando no Postgres. Os 8.184 ms e 2.382 ms medidos no gateway foram gastos **antes ou fora** da execução da query. → **CONFIRMADO**

### 4.2 O tempo está dentro dos serviços do Supabase (MEDIDO)

- **Auth (GoTrue), duração interna registrada em `auth_logs`:**
  - 2.740 ms às 22:53:51, bate com os 3.056 ms no gateway;
  - 1.685 ms e 832 ms às 22:54:00;
  - 1.615 ms às 22:54:13;
  - depois cai para 2 a 30 ms.
  - O atraso está **dentro do serviço Auth**, não na rede Vercel → Supabase.
- **Entre etapas do app:** do fim de uma chamada do middleware até a primeira chamada `node` do RSC passam ~100 a 110 ms (22:53:51.161 + 2.382 → 22:53:53.653; 23:00:09.421 + 8.184 → 23:00:17.712). O serverless não adicionou segundos entre as etapas.

### 4.3 Os pools de conexão esvaziam ou são descartados quando ocioso (MEDIDO, `pg_stat_activity`)

| Momento | `supabase_auth_admin` (GoTrue) | `authenticator` (PostgREST) |
|---|---|---|
| ~23:1x, após ~10 min sem tráfego | 1 conexão, idade 19 s | 8 conexões (a mais nova com 19 s) |
| 23:28:20, após ~26 min sem tráfego | **0 conexões** | 8 idle: 168 s, 6× 1.601 s, 1 com 8 dias |
| 23:29:27, **30 s após 1 navegação fria** | **1 conexão nova (30 s)** | **7 conexões novas (27 a 30 s)** + a de 8 dias; as de 168 s e 1.601 s sumiram |

- **Contador de sessões** (`pg_stat_database.sessions`): 368.564 → **368.574** (+10) durante a navegação fria. Isso corresponde a 7 conexões PostgREST + 1 GoTrue + 2 das consultas desta auditoria via mgmt-api.
- **CONFIRMADO:** uma única navegação depois de ociosidade fez o Postgres abrir **~8 conexões novas**, exatamente no instante da navegação.
- **PROVÁVEL:** o PostgREST ainda tinha conexões listadas, mas descartou as ociosas e abriu novas. Isso é consistente com uma política de tempo máximo ocioso do pool; o valor configurado não é visível por SQL.

### 4.4 Horário das lentidões × ociosidade (MEDIDO, `edge_logs` por minuto, 12/09)

| Minuto (UTC) | Contexto | Máx. `/auth/v1/user` | Máx. `usuarios` |
|---|---|---:|---:|
| 12:15 | início de uso após ociosidade | 1.344 ms | 1.695 ms (p50 geral 2.067 ms) |
| 12:21 | retomada após ~2 min | 1.282 ms | **3.134 ms** |
| 18:11 | 1º uso do fim da tarde | 1.116 ms | 2.330 ms |
| 22:53 | 1º uso da noite (medição) | **3.056 ms** | 2.813 ms |
| 22:54 → 22:55 | uso contínuo | 1.693 → **130 ms** | 2.075 → 372 ms |
| 22:59 | uso contínuo | 211 ms | 91 ms |
| 23:00 | F5 do Dashboard | 1.484 ms | **8.184 ms** |
| 23:01 | uso contínuo | 229 ms | 842 ms |

- **OBSERVADO:** os picos se concentram no **primeiro minuto de uso depois de uma pausa** e somem em 1 a 2 minutos de uso contínuo.
- **Exceção:** o pico de 23:00 veio depois de ~50 s sem navegação (houve uma espera entre as rodadas de medição).

### 4.5 Experimento controlado: navegação fria × quente (MEDIDO)

Condição: ~26 min sem tráfego no app, depois 3 cliques seguidos.

| Navegação | Tela utilizável | Auth `/user` (gateway / GoTrue) | `usuarios` (gateway) | RPC da página |
|---|---:|---|---|---:|
| Estoque (**fria**) | **2.481 ms** | 286 / **236 ms** (Edge), 56 ms (node) | **314 ms** (Edge), 257 ms (node) | 303 ms |
| Prefetches do hub (3, simultâneos) | — | 34 a 94 ms | 94 a 212 ms, depois **828 ms** | — |
| Vendas (quente) | 1.296 ms | 262 → 37 ms | 120 a 205 ms | 83 ms |
| Dashboard (quente) | 74 ms (cache do roteador) | — | — | — |

Referência quente da medição anterior: Estoque 666 a 1.049 ms; GoTrue `/user` 2 a 30 ms; `usuarios` 12 a 20 ms.

- **CONFIRMADO:** a primeira navegação após ociosidade é mais lenta (2,48 s contra 0,67 a 1,05 s) e coincide com a abertura de conexões novas (§4.3).
- **OBSERVADO:** neste experimento o custo frio foi de **centenas de ms** por chamada, não de 2 a 8 s. Os picos de 2 a 8 s da medição anterior foram **maiores e variáveis**.

### 4.6 Outros sinais (OBSERVADO)

- **Dimensionamento:** `max_connections` = 60 e `shared_buffers` ≈ 280 MB, típico de uma instância pequena (INFERIDO: Micro). Métricas de CPU e IO **não estão acessíveis** por esta via.
- **Picos históricos em comandos triviais do GoTrue:** `UPDATE users SET last_sign_in_at` máx. **7.787 ms**; `INSERT audit_log_entries` máx. 4.867 ms; `INSERT refresh_tokens` máx. 2.936 ms. Há momentos em que o próprio Postgres trava por segundos, mesmo em escrita simples.
- **`postgrest_logs`:** mensagens `Warp server error: Thread killed by timeout manager` às 22:52:45, 22:54:47, 22:55:17, 22:56:47, 23:00:02, 23:01:15 e 23:02:38. É o encerramento de conexões HTTP ociosas no PostgREST. Não há correlação temporal clara com os picos.
- **Token refresh (`/auth/v1/token`):** nenhuma chamada nas janelas lentas.
- **Chamadas de auth vindas do navegador** nas rotas admin: nenhuma (só User-Agent `node` e `Vercel Edge Function`).

---

## 5. Hipóteses investigadas

| # | Hipótese | Evidência | Status |
|---|---|---|---|
| H1 | **Abertura de conexão Postgres nos serviços Supabase (GoTrue/PostgREST) após ociosidade** | §4.3: pool GoTrue com 0 conexões; 8 conexões novas abertas no instante da navegação fria. §4.1: execução SQL ≤ 566 ms, mas gateway com 2 a 8 s. §4.4: picos no 1º minuto após pausa. §4.5: fria 2,48 s × quente 0,7 a 1,0 s | **CONFIRMADO** como causa do **custo frio**. A **magnitude** de 2 a 8 s por conexão é **PROVÁVEL** sob concorrência (ver H6), não reproduzida isoladamente |
| H2 | Trabalho de autenticação repetido na mesma navegação | §3: 2× `getUser` + 2× `usuarios` por navegação; 4 por action; 2 por prefetch; 2 leituras de perfil no Caixa | **CONFIRMADO** |
| H3 | Chamadas duplicadas entre middleware e Server Components/Actions | Middleware e RSC fazem a mesma leitura (mesmas colunas) sem compartilhar resultado; actions do `/caixa` passam de novo pelo middleware | **CONFIRMADO** |
| H4 | Prefetch do Next dispara autenticação desnecessária | Matcher cobre todas as rotas; nenhuma exceção para prefetch; logs com 3× Edge `/user` + 3× `usuarios` logo após cada render | **CONFIRMADO** que dispara. "Desnecessária" é **PROVÁVEL**: o prefetch não re-renderiza o layout, mas o middleware ainda protege o payload |
| H5 | Cold start de serverless (Vercel) | §4.2: ~100 ms entre etapas do app, inclusive nas navegações de 8 s; o atraso está dentro do GoTrue e do PostgREST | **DESCARTADO** como causa principal nas amostras. O cold start do Edge Middleware antes da 1ª chamada ficou **NÃO CONFIRMADO** (resolução de relógio ±0,5 s) |
| H6 | Rajada de requisições simultâneas amplifica o custo frio | Catálogo 1ª: 5 middlewares + RSC abrindo conexões ao mesmo tempo, com durações de 1 a 3 s; experimento isolado: 0,2 a 0,8 s | **PROVÁVEL**. Não isolado de H7 |
| H7 | Instância de banco pequena com travamentos momentâneos (CPU/IO) | §4.6: `max_connections` 60; `UPDATE` trivial com máx. 7,8 s; checkpoint com escrita de 2,3 s. Sem acesso a métricas de CPU/IO | **PROVÁVEL** como fator secundário. **NÃO CONFIRMADO** |
| H8 | Latência de rede ou TLS Vercel → Supabase | Mesma região (`gru1` / `sa-east-1`); chamadas quentes com origin de 8 a 20 ms; duração interna do GoTrue igual ao origin_time do gateway | **DESCARTADO** |
| H9 | Criação repetida de cliente Supabase custa tempo | `createServerClient` só cria objeto em memória; nenhuma evidência de custo | **DESCARTADO** como causa de segundos |
| H10 | Renovação de token (refresh) nas janelas lentas | Nenhum `/auth/v1/token` nas janelas | **DESCARTADO** para as amostras |
| H11 | Cache de sessão existente sendo ignorado | `React.cache` funciona dentro de 1 request, mas: (a) o resultado do middleware não chega ao RSC; (b) dois caches distintos (`getCachedAdminNormalization` × `getUsuarioAtual`) leem o mesmo perfil; (c) cada Server Action é request novo | **CONFIRMADO** |
| H12 | Execução lenta da query de perfil (índice/plano) | Média 1,9 ms, máx. histórico 566 ms | **DESCARTADO** |
| H13 | Recarga de schema cache do PostgREST (`pg_timezone_names`) coincidindo com os picos | Recargas existem (1.267 desde junho), mas não há registro de recarga nas janelas | **NÃO CONFIRMADO** |

---

## 6. Causa provável/principal

**Resposta à pergunta "por que 2 a 8 s antes de uma consulta de milissegundos?"**

1. **CONFIRMADO: a autenticação é feita várias vezes, em série, antes da primeira consulta da página.** Toda navegação passa por `getUser` → `usuarios` no middleware e de novo por `getUser` → `usuarios` no RSC. São 4 idas sequenciais ao Supabase antes de o primeiro dado da tela ser consultado. Cada prefetch soma mais 2 idas em paralelo, e cada Server Action do Caixa soma 4.
2. **CONFIRMADO: depois de alguns minutos sem uso, os serviços do Supabase não têm conexão utilizável com o Postgres.** O GoTrue estava com **0** conexões e o PostgREST descartou as ociosas. A primeira navegação abriu **~8 conexões novas** no mesmo instante, e esse é o tempo gasto antes da query rodar, que continua levando milissegundos.
3. **PROVÁVEL: a rajada de navegação + prefetch amplifica o custo frio.** Várias conexões são abertas ao mesmo tempo, numa instância pequena que já mostrou travamentos momentâneos de segundos.
   - Isolado, o custo frio medido foi de **centenas de ms** por chamada.
   - Nas rajadas reais chegou a **2 a 3 s** (Catálogo) e **8,2 s** (Dashboard).
   - Como (1) coloca essas chamadas **em série**, os atrasos se somam: 3,0 + 2,4 + 0,4 + 2,1 ≈ 7,9 s no Catálogo.

**Não é:**
- execução SQL (máx. 566 ms);
- rede Vercel↔Supabase (DESCARTADO);
- cold start da função Node (DESCARTADO nas amostras);
- refresh de token (DESCARTADO nas amostras).

---

## 7. O que pode ser otimizado

Nenhuma proposta remove autenticação, autorização, RLS, proteção de rota, isolamento por loja ou a checagem de conta inativa ou sem loja.

| # | Proposta | Impacto esperado | Risco | Complexidade | Arquivos/componentes |
|---|---|---|---|---|---|
| O1 | **Middleware: verificar o JWT localmente com `auth.getClaims()`** (projeto usa ES256, JWKS público confirmado), mantendo `getUser()` no RSC e nas actions como validação no servidor | Remove 1 ida ao GoTrue por navegação, por prefetch e por action (de 2 para 1 chamada de Auth por request); reduz a rajada de conexões GoTrue no frio | **Médio.** `getClaims` não detecta sessão revogada até o token expirar. Aceitável **só** porque o RSC e as actions continuam chamando `getUser`. Exige revisão de segurança e teste da matriz de autorização | Baixa a média | `lib/admin/auth/sessionConsistency.ts` (`fetchRawSession` usado no edge), `lib/admin/auth/middlewareSupabase.ts`, `middleware.ts` |
| O2 | **Unificar a leitura de perfil por request:** um único `React.cache` para usuário + perfil (colunas `perfil, idioma_preferido, loja_id, ativo`) usado por `getUsuarioAtual` e por `getCachedAdminNormalization` | Remove a 2ª leitura de `usuarios` no Caixa e em qualquer render que misture as duas funções | Baixo, desde que `ativo` e `loja_id` continuem sendo verificados | Baixa | `lib/auth/usuarioAtual.ts`, `lib/admin/auth/sessionConsistency.ts`, `app/caixa/page.tsx` |
| O3 | **Remover o `getUser()` explícito redundante** onde o cache já validou o usuário no mesmo request | Clareza; ganho de rede pequeno, porque o `fetch` já parece ser deduplicado no RSC (PROVÁVEL) | Baixo | Baixa | `app/caixa/page.tsx:12-15`, `app/gerente/vendas/actions.ts:75-83` |
| O4 | **Consolidar o bootstrap do Caixa** (5 actions → dados no Server Component ou 1 action) | De 20 idas de auth para ~4 na abertura; de ~2,7 s para perto do tempo do RSC (INFERIDO) | Médio: fluxo crítico do PDV (venda pendente, idempotência) | Média | `app/caixa/page.tsx`, `app/caixa/hooks/useCaixaBootstrapData.ts`, `useCaixaStatusMovimentacoes.ts`, `useCaixaVendasEmEspera.ts`, `CaixaRailTurnoSummary.tsx` |
| O5 | **Reduzir prefetches automáticos** em links de hub e sidebar que abrem telas pesadas (`prefetch={false}` ou prefetch só no hover) | Cada prefetch evitado corta 2 idas ao Supabase e diminui a rajada no frio | Baixo a médio: sem prefetch, a navegação pode perder o skeleton imediato e ficar sem resposta visual até o servidor responder. Medir antes/depois | Baixa | `components/ui/admin-v2/SidebarNav.tsx`, `AdminHubTabNav.tsx`, `EstoqueHubNav.tsx`, `CatalogoHubNav.tsx` |
| O6 | **Não pular o middleware no prefetch.** Em vez disso, torná-lo barato (O1) | Mantém a proteção do payload RSC | — (recomendação de não fazer o atalho inseguro) | — | `middleware.ts` |
| O7 | **Investigar a configuração de pool e o dimensionamento no Supabase** (tamanho do pool e tempo ocioso do PostgREST/GoTrue, tamanho da compute, métricas de CPU/IO no dashboard) antes de qualquer "keep-warm" | Pode reduzir ou eliminar o custo frio na origem | Baixo para investigar; custo financeiro se houver upgrade de compute | Baixa (operacional) | Supabase Dashboard: Settings/API, Database, Reports. **Não é código** |
| O8 | **Observabilidade:** spans do Sentry ou `Server-Timing` por etapa (middleware auth, RSC auth, perfil, primeira query) | Permite medir O1 a O5 sem depender de correlação de logs com diferença de relógio | Baixo | Baixa a média | `middleware.ts`, `lib/admin/auth/*`, `instrumentation.ts` |

**Não recomendado sem mais evidência:**
- ping periódico para manter conexões aquecidas: mascara o problema, gera custo e tráfego artificial, e o intervalo necessário não foi determinado;
- cache de perfil entre requests (cookie ou KV) com dados de autorização: risco de usar `ativo`, `perfil` ou `loja_id` desatualizados.

---

## 8. O que NÃO deve ser alterado

- **`getUser()` no RSC e nas Server Actions:** é a validação real no servidor. O1 só troca a verificação do **middleware**.
- **Checagem de `usuarios.ativo` e `loja_id`:** o middleware hoje é quem bloqueia conta inativa ou sem loja nas **Server Actions do `/caixa`**. `getUsuarioAtual` não lê `ativo`. Qualquer mudança no middleware precisa **mover ou garantir** essa checagem nas actions antes de remover a leitura no edge.
- **Matcher do middleware** e proteção de `/admin`, `/gerente` e `/caixa`, inclusive para requisições de prefetch e POST de actions.
- **RLS e isolamento por loja:** nenhuma otimização deve trocar o cliente autenticado por `service_role` para ganhar tempo.
- **`clearStaleSessionIfNeeded`** e o redirecionamento de sessão expirada.
- **Cache de dados de autorização entre requests ou usuários.**

---

## 9. Próxima intervenção recomendada

**Etapa 1: medir melhor antes de mudar (O8 + O7), sem alterar comportamento**

- Adicionar spans por etapa de auth. Isso é mudança de código de observabilidade, a aprovar.
- Consultar no Supabase Dashboard as métricas de CPU/IO e a configuração de pool nos horários 22:53, 23:00 e 12:21 UTC de 2026-09-12.
- Objetivo: separar H6 (rajada) de H7 (instância), que hoje estão só como PROVÁVEL.

**Etapa 2: menor mudança com evidência CONFIRMADA (O2 + O3)**

- Unificar a leitura de perfil por request e remover o `getUser` redundante do Caixa e de Vendas.
- Não muda nenhuma regra de acesso.

**Etapa 3: maior ganho, com revisão de segurança (O1)**

- `getClaims()` no middleware, mantendo `getUser()` no RSC e nas actions.
- Garantir a checagem de `ativo`/`loja_id` nas actions do Caixa antes de simplificar o edge.
- Validar com a matriz de autorização e com nova medição do relatório de navegação (3 rodadas + experimento frio).

**Etapa 4: O4 (bootstrap do Caixa) e O5 (prefetch seletivo)**

- Cada uma medida isoladamente, com critério de aceite: primeira navegação fria abaixo de 2 s e Caixa operacional abaixo de 1,5 s (metas a validar).
