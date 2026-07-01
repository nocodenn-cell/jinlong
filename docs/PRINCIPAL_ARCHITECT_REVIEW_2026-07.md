# Architecture Review — fastproduct como plataforma ERP

**Papel:** Principal Software Architect (revisão externa, pré-produção como plataforma ERP multi-empresa).
**Data:** 2026-07-01. **Escopo:** monorepo `fastproduct` (`pdv-importados`, `pdv-local`, `backend/supabase`, `shared-core`, `shared/`).
**Método:** leitura direta de código, migrations, RLS, testes, CI, ESLint/guards, e cruzamento com as auditorias internas já existentes no repositório (`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`, `docs/MULTI_AUTHORITY_ARCHITECTURE_AUDIT.md`, `docs/ADMIN_AUTH_STRUCTURAL_AUDIT.md`, `docs/AUTHORIZATION_MATRIX.md`, `docs/adr/ADR-PDV-centro-de-gravidade.md`). Este documento **não repete** o conteúdo dessas auditorias — ele se apoia nelas como evidência e adiciona uma leitura arquitetural de mais alto nível, com foco no objetivo declarado: um ERP multi-módulo, multi-empresa, mantido por dezenas de desenvolvedores.

> **Nota de honestidade metodológica:** não havia um documento de especificação funcional anexo disponível para leitura nesta sessão. A avaliação foi feita **contra o código real** e contra o objetivo declarado no pedido de revisão ("ERP moderno inspirado operacionalmente no Bling"). Onde o código diverge desse objetivo, isso é tratado como achado, não como suposição.

---

## 1. Visão geral da arquitetura

O que existe hoje **não é um ERP genérico modular** — é um **PDV de loja única (single-tenant por `loja_id`), já em produção real**, com um painel de gestão anexo, evoluindo organicamente na direção de um ERP. Isso é uma distinção importante: partes do sistema (motor de venda, RLS, caixa, sync offline) têm maturidade de produto de produção real — não é um protótipo. Mas a arquitetura **não foi desenhada como plataforma multi-empresa/multi-módulo** desde o início; ela está sendo esticada para lá.

Estrutura real:

- `pdv-importados/` — Next.js App Router, é onde vive **quase toda** a lógica (124 arquivos / ~10.4k linhas só em `lib/`), com dois painéis de gestão **coexistindo**: `/gerente/*` (legado) e `/admin/*` (novo, parcialmente migrado — 9 de 17 rotas migradas, "Fase 9" pendente para `suspensao`, `categorias-financeiras`, `contas-pagar`, `compras`, `clientes`, `fornecedores`).
- `pdv-local/` — Tauri + SQLite, segundo runtime completo com sua própria fila de sync/outbox.
- `backend/supabase/` — 187 migrations, **57% delas (107) definem functions** — ou seja, mais da metade da evolução do schema é, na prática, evolução de lógica de negócio em PL/pgSQL, não DDL.
- `shared-core/` (workspace formal) + `shared/` (pasta solta na raiz) + `pdv-importados/core/` + `pdv-importados/shared/` — **quatro** lugares que disputam o papel de "camada compartilhada", em estados de migração diferentes (ver seção 7).
- Governança formal do projeto (`.cursor/rules/governance.mdc`) é literalmente titulada **"Governança de execução para solo dev no monorepo"** — o processo de decisão, revisão e mudança foi desenhado para **um único desenvolvedor (ou agente)**, não para uma equipe.

Isso não é uma crítica gratuita: é o dado mais importante de toda a revisão, porque o pedido explicitamente projeta "dezenas de desenvolvedores trabalhando simultaneamente" em dois anos. A distância entre o modelo de governança atual e esse alvo é o maior risco estrutural do projeto — maior que qualquer problema pontual de acoplamento.

---

## 2. Pontos fortes

Para não distorcer a leitura: existem decisões boas e um nível de rigor documental raro.

1. **Autoridade de auth convergida e testada.** `lib/admin/policy/adminPolicy.ts` é uma fonte única de decisão (`Decision { type, target, reason, scope }`) consumida por adapters finos em edge/API/action, com 292 testes garantindo equivalência edge/SSR (`tests/admin-edge-ssr-equivalence.test.ts`, `tests/admin-policy-consistency.test.ts`). É o único subsistema classificado como **"Risco Baixo"** na própria auditoria interna de multi-authority — e é citado ali mesmo como "modelo de referência" para os demais. É um padrão de convergência genuinamente bom e deveria ser o gabarito para caixa/pricing/vendas.
2. **RLS como segunda linha de defesa real, não decorativa.** 51 das 187 migrations tratam de RLS; toda tabela financeira/auditoria verificada tem `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` correspondente; existe script dedicado de auditoria (`audit_rls_public_tables.sql`) e uma matriz de autorização documentada (`AUTHORIZATION_MATRIX.md`) que já lista os próprios pontos fracos (`recalcular_saldo_caixa` sem checagem de perfil, RPC legado ainda com grant residual).
3. **Motor de scan/caixa com máquina de estados explícita e disciplina de contrato.** `shared-core/src/pdv/scan-pipeline*` + `SCAN_PIPELINE_STATE_MACHINE.md` + `RECONNECT_REPLAY_POLICY.md` definem semântica formal de ACK visual, replay, idempotência e taxonomia de falha — com testes "golden" e regra explícita de que o documento é contrato vivo ("quando divergir do código, o código está errado ou o documento está errado — nunca os dois em silêncio"). Isso é maturidade de engenharia de sistemas real, incomum em código de PDV.
4. **Cultura de auto-auditoria.** O time já produziu, sem provocação externa, auditorias de drift de produção, de multi-authority e de estrutura de auth — com metodologia, severidade e read-only explicitado. Isso é exatamente o comportamento que esta revisão está pedindo, e já existe internamente. O risco não é falta de autoconsciência — é a distância entre diagnóstico e correção (os achados de 2026-06-07/06-20 continuam abertos).
5. **Um pedaço de DDD genuíno e isolado:** `pdv-importados/core/ledger/*` (`LedgerEngine`, `chartOfAccounts`, `commands`/`queries`, `ports`, `adapters/InMemoryLedger`) é a única parte do código com cara de domain layer hexagonal de verdade — comandos, queries, porta e adapter in-memory testável. É pequeno e pouco usado hoje, mas é o melhor exemplo interno de "como isso deveria ser" no resto do sistema.
6. **CI e guards reativos funcionam.** `guard:core`, `guard:pdv`, `guard:rpc`, `guard:pricing`, `guard:migrations` etc. pegam classes reais de regressão (RPC legado sendo chamado, migration com número duplicado, lógica de decisão vazando para componente client). Não é arquitetura preventiva, mas é rede de segurança real e ativa.

---

## 3. Pontos fracos

1. **Dois painéis de gestão ativos simultaneamente.** `/gerente/*` (legado, ainda dono de clientes, fornecedores, compras, suspensão, categorias financeiras) e `/admin/*` (novo, 9/17 migrado, várias páginas delegando de volta para `actions` de `/gerente`). Isso não é só débito visual: é **duas superfícies de autorização, duas superfícies de teste, dois lugares para o mesmo bug** até a Fase 9 fechar — e não há data/critério de corte no roadmap.
2. **"Fat actions" como padrão dominante, não exceção.** De todos os módulos gerente investigados, só **Produtos** delega de verdade para uma camada de domínio (`core/services/produtoService.ts` + `produtoRepository`, com o comentário no próprio código "CORE decide o status; o server apenas executa"). **Estoque** e **Financeiro** fazem `supabase.from(...).insert(...)` e `supabase.rpc(...)` diretamente dentro da Server Action. Ou seja: o único módulo com boundary de domínio decente é a exceção, não a regra — o padrão real é Next.js Server Action = camada de aplicação + infraestrutura fundidas.
3. **Fiscal não tem dono.** Não existe `app/gerente/fiscal/` nem módulo de domínio fiscal. A lógica está partida entre `app/gerente/estoque/importar-nfe/`, `app/gerente/financeiro/documento/[id]/`, `lib/nfe/nfeParser.ts` e a Edge Function `fiscal-worker`. Fiscal no Brasil é um domínio com regras próprias (NCM, CFOP, CST, CSOSN, contingência, DANFE) — tratá-lo como apêndice de Estoque e de Financeiro é uma escolha que vai custar caro assim que a superfície fiscal crescer (múltiplos regimes, múltiplos emissores, mais documentos).
4. **Camada "compartilhada" fragmentada em quatro lugares** com estados de migração diferentes (detalhe na seção 7) — o efeito prático é que um novo desenvolvedor não tem como saber, sem investigar, onde colocar lógica nova de pricing ou carrinho.
5. **Lógica de negócio pesada dentro do banco, sem equivalente formal na camada TypeScript.** 107/187 migrations definem functions; 94 arquivos usam `SECURITY DEFINER`. A função `finalizar_venda_transacional_canonica_v4` (migration `243`, ~250 linhas) concentra sozinha: validação de preço autoritativo, insert de venda, baixa de estoque, pagamentos, consumo de token de desconto de gerente, auditoria, ledger de evento e enfileiramento fiscal — tudo dentro de uma transação com `pg_advisory_xact_lock`. Isso é o **Aggregate Root do domínio de Vendas implementado em PL/pgSQL**, não em código de domínio testável em TypeScript.
6. **Multi-authority real e já documentada** em Caixa e em Vendas/Sync (Zod web + validação `pdv-local` + validação Edge Function `sync-outbox`, sem contrato compartilhado) e em Pricing (classe `PricingService`, RPC `calcular_preco_produto`, triggers DB `122`–`125`, `unifiedCartStore` com piso de `precoMinimo` no client) — quatro autoridades de preço coexistindo é a antítese de um domínio bem modelado.

---

## 4. Riscos de curto prazo

| Risco | Evidência | Por que é urgente |
|---|---|---|
| **Deploy de schema não determinístico** | Auditoria interna já confirmou 172 migrations em produção vs. 170 no repo, com colisões de número e conteúdo divergente (`113`, agora também `245`/`250` no estado atual verificado nesta revisão) | Qualquer `supabase db push` daqui pra frente pode ignorar ou sobrescrever algo silenciosamente. Isso é reversível **agora**; fica exponencialmente mais caro com mais devs escrevendo migrations em paralelo. |
| **Auditoria de compliance incompleta** | `descontos_venda` em produção sem `operador_id`/`aplicado_em` (migration `113` do repo não refletida em prod) | Sem esses dois campos, desconto de gerente não entra na timeline de auditoria — é exatamente o tipo de lacuna que aparece em auditoria fiscal/trabalhista. |
| **Painéis duplicados sem prazo de corte** | 8 rotas ainda só em `/gerente`, sem critério de quando a Fase 9 acontece | Cada feature nova precisa decidir "em qual painel" e cada bug de auth precisa ser verificado nos dois. |
| **RPCs SECURITY DEFINER sem checagem de perfil uniforme** | `AUTHORIZATION_MATRIX.md` já lista `recalcular_saldo_caixa` como "sem checagem de perfil na função (hardening recomendado)" pelo próprio time | Superfície de escalonamento de privilégio conhecida e não fechada. |
| **God files de UI no caminho mais crítico do produto** | `CaixaPageClient.tsx` com 1401 linhas | É a tela de checkout — qualquer regressão de performance ou de re-render nela afeta a operação de venda em tempo real, o coração do produto. |

---

## 5. Riscos de longo prazo

1. **Modelo de tenant incompatível com "milhares de empresas".** O RLS de hoje escopa por `usuarios.loja_id`, com "DONO" tendo visão macro apenas via exceção. Não existe hierarquia `empresa_id → lojas`. O próprio `ROADMAP.md` lista "Multi-loja / filiais" como item de **longo prazo, ainda não feito**. Migrar de single-tenant-por-loja para multi-empresa não é uma feature incremental: é uma reescrita de praticamente toda política de RLS, de toda função `SECURITY DEFINER` que hoje deriva loja implicitamente, e potencialmente de índices/particionamento. Fazer isso **depois** que existirem milhares de linhas de RPC assumindo `loja_id` como topo da hierarquia é ordens de magnitude mais caro que decidir o modelo de tenant agora.
2. **Lógica de domínio presa em PL/pgSQL.** Se a lógica de negócio central (regras de venda, precificação, estoque) mora majoritariamente em stored procedures gigantes, ela não é testável com o mesmo ferramental que o resto do time usa (Vitest), não é refatorável com segurança por LLMs/IDEs com a mesma qualidade que TypeScript, e amarra a arquitetura ao Postgres/Supabase de um jeito que dificulta qualquer evolução futura (múltiplos bancos, mensageria, processamento assíncrono fora do banco).
3. **Escala de equipe vs. governança de solo dev.** Regras como "em pedido ambíguo, faça até 2 perguntas antes de implementar" e "limite mudanças ao módulo solicitado" são adequadas para 1 dev (ou agente) trabalhando sequencialmente. Não existem CODEOWNERS, não existe enforcement automatizado de boundaries (sem `dependency-cruiser`/`madge`/`nx`/`eslint-plugin-boundaries` — só scripts `guard:*` reativos a incidentes específicos já ocorridos). Com uma migration numerada colidindo **mesmo com um único fluxo de trabalho atual**, o risco de colisão sobe imediata e continuamente à medida que mais pessoas escrevem migrations/RPCs em paralelo.
4. **Teto de ingestão de eventos já documentado pelo próprio time.** `RECONNECT_REPLAY_POLICY.md` §0.3 admite que a arquitetura atual (`POST` + Postgres) sustenta "tipicamente" 50k–150k eventos/dia/loja antes de precisar de agregação assíncrona, ingestão edge ou time-series. Em milhões de vendas/mês distribuídas por milhares de lojas, esse teto é ultrapassado — e a arquitetura de solução (fila dedicada, agregação) ainda não existe, só é mencionada como "planejar".
5. **Quatro camadas "shared" concorrentes** tendem, sem intervenção deliberada, a virar cinco, seis — cada nova feature que precisa de lógica cross-runtime vai escolher (ou duplicar em) uma das quatro por conveniência local, não por decisão arquitetural.

---

## 6. Violações arquiteturais encontradas

Fatos verificados diretamente no código, não inferências:

1. **Relatórios lendo Server Action de outro módulo em vez de camada de leitura própria.** `app/gerente/relatorios/estoque/RelatorioEstoqueClient.tsx` importa diretamente `obterListaEstoqueGerente`/`obterListaEstoqueGerenteCompletaParaExport` de `@/app/gerente/estoque/actions`. Relatórios deveriam ter seu próprio modelo de leitura (read model/query service), não acoplar-se à action de escrita/gestão de outro domínio.
2. **Lógica de criação de Cliente duplicada, não compartilhada.** `app/gerente/financeiro/actions.ts` define seu próprio `criarCliente()` fazendo `insert` direto em `clientes`, em paralelo a `salvarClienteAction()` de `app/gerente/clientes/actions.ts`. Duas implementações da mesma regra de negócio, com risco real de divergirem silenciosamente (validação diferente, campos obrigatórios diferentes).
3. **Fronteira de `shared-core` já violada pela própria regra que o time escreveu.** `docs/RECONNECT_REPLAY_POLICY.md` §0.4 diz explicitamente: *"Não introduzir em shared-core: Supabase, toast, carrinho Zustand, pricing de domínio, auth de sessão."* Mas o maior arquivo do workspace `shared-core` é exatamente `stores/unifiedCartStore.ts` (427 linhas) — um store Zustand de carrinho. A política existe, está documentada, e não está sendo seguida no artefato mais importante do módulo.
4. **Camada de domínio (`core/`) aplicada de forma inconsistente.** `core/pricing/` não contém nenhuma implementação — só um teste (`pricingServiceGuards.test.ts`) que importa a implementação real de `shared/pricing/PricingService.ts` (pasta solta na raiz, fora do workspace formal `shared-core`). Uma pasta chamada `core/pricing` que não tem pricing nenhum dentro é, na prática, uma violação de nomenclatura que engana quem está navegando o código.
5. **Auditoria como módulo de leitura correta, mas sem exclusividade de acesso às suas próprias fontes.** `app/admin/auditoria/actions.ts` é exemplar como agregador read-only (comentário explícito: "NÃO cria/altera tabela alguma... apenas SELECT"). Mas `app/admin/estoque/actions.ts` faz seu próprio `select` em `movimentos_estoque_log`, e `app/gerente/vendas/actions.ts` lê `venda_eventos` por um caminho de RPC totalmente separado (`listar_venda_eventos_gerente`/`kpis_venda_eventos_gerente`). Ou seja: o módulo de auditoria não é o único consumidor de leitura das próprias tabelas de auditoria — é mais um entre vários caminhos paralelos.
6. **Business rules vazando para componentes client**, confirmado pela própria existência (e necessidade contínua) do `core-rule-guard.mjs`, que varre `components/`, `hooks/`, `stores/` e arquivos `'use client'` atrás de decisões de negócio (ex.: comparação de `status_publicacao`) fora de `/core`. Um guard reativo existir e continuar necessário é evidência de que a violação é recorrente, não um incidente isolado já resolvido.

---

## 7. Shared — análise profunda (pedida explicitamente)

Existem hoje **quatro** candidatos a "camada compartilhada", cada um com um recorte diferente e níveis de disciplina diferentes:

| Local | Papel real | Estado |
|---|---|---|
| `shared-core/` (workspace npm formal) | Runtime de PDV: scan-pipeline, cart types, pricing resolution, catálogo, engine de produto, observabilidade, ledger snapshot, discount policy | 51 arquivos / 3.926 linhas. **Tem regra de fronteira explícita e documentada** (não Supabase/toast/cart Zustand/pricing de domínio/auth) — mas a própria regra já está sendo violada pelo `unifiedCartStore` (maior arquivo do módulo). |
| `shared/` (pasta solta na raiz, fora de workspaces) | Logger, env-check, `mensagemErroUsuario`, `cart/totals.ts` (implementação **completa e duplicada** de cálculo de totais) e `pricing/PricingService.ts` (classe própria de precificação) | **Ativamente importado** por `pdv-local/src/App.tsx` e por testes em ambos os workspaces — não é código morto, é uma segunda fonte de verdade viva. |
| `pdv-importados/core/` | Deveria ser a camada de domínio local do app web (services, ports, ledger, money) | Mistura módulos maduros (`ledger/*`, bem estruturado) com módulos vazios/enganosos (`pricing/` só tem teste, `sync/` só tem um `.md`). |
| `pdv-importados/shared/cart/` | Totals do carrinho, local ao app web | **Já esvaziado com redirecionamento documentado** para `shared-core/src/stores/unifiedCartStore` — é o único dos quatro em estado de migração *concluída*. |

**Resposta às perguntas pedidas:**

- **O que deveria estar em `shared-core`:** só o que é genuinamente runtime-agnóstico e reutilizado por web e desktop com a mesma semântica — scan pipeline, tipos de carrinho, motor de avaliação de produto, política de desconto de gerente. Isso já é, na maior parte, o que está lá.
- **O que NÃO deveria estar lá:** o `unifiedCartStore` como está hoje é um Zustand store — acoplado a um paradigma de estado de UI, exatamente o que a política interna do módulo já proíbe. Se web e desktop usam paradigmas de estado diferentes (ou podem vir a usar), a lógica de cálculo (totais, regras) deveria ser uma função pura exportada por `shared-core`, e o **store** (Zustand ou outro) deveria viver no adapter de cada runtime, consumindo essa função pura.
- **Risco de "god module":** o risco real não é `shared-core` inchar sozinho (ele está, na verdade, relativamente disciplinado em tamanho) — é o **ecossistema de quatro "shared" ao redor dele** virar terreno onde cada decisão de "onde colocar isso" é ad-hoc. Isso é pior que um god module único: é ambiguidade estrutural, que tende a se resolver por duplicação (como já aconteceu com `cart/totals.ts` e com `PricingService`) em vez de por reuso.

**Recomendação concreta:** consolidar em **um único** workspace compartilhado (`shared-core`), aposentar `shared/` (root) migrando `PricingService` e `cart/totals.ts` para dentro dele ou eliminando-os em favor do que já existe em `shared-core/src/pricing` e `shared-core/src/stores`, e esvaziar `pdv-importados/core/pricing` (pasta vazia e enganosa) ou preenchê-la de fato como adapter local. O `ledger/` de `pdv-importados/core` é o único candidato natural a **subir** para `shared-core` no médio prazo, já que é o pedaço com melhor formato de domínio hoje.

---

## 8. Performance

- **Renderização:** `CaixaPageClient.tsx` com 1401 linhas na tela de checkout é o maior risco de performance percebida do produto — não há evidência nos docs de estratégia de code-splitting ou memoização deliberada para esse componente.
- **Consultas:** RLS habilitado amplamente é correto para segurança, mas a própria auditoria do painel admin já registrou "89 prepare statements em dev, bloqueio esperado" — sinal de que o custo de planejamento de query por RLS já é observável mesmo em volume de desenvolvimento, antes de qualquer escala real.
- **Cache:** a mesma auditoria interna recomenda, sem ainda implementar, "considerar cache em Dashboard (período grande = lentidão)" — problema conhecido, não corrigido.
- **Estado:** quatro autoridades de preço coexistindo (classe `PricingService`, RPC `calcular_preco_produto`, triggers DB `122`–`125`, piso `precoMinimo` no `unifiedCartStore`) criam risco real de divergência sob concorrência (dois operadores, promoção mudando no meio de uma venda) — a própria auditoria de multi-authority já classifica isso como risco médio e indica que tipos MANUAL/PROMOÇÃO "confiam em snapshot do client no server".
- **Sincronização:** o modelo de dois runtimes (web online-first, desktop com outbox) ainda não tem política de conflito/reconexão formalmente aceita — o `ADR-PDV-001` está em status **"Proposto — aguardando sign-off"**, com seções inteiras de política de preço, offline e replay marcadas como "preencher na aceitação". Ou seja, o sistema já opera em produção com esses pontos formalmente indefinidos.
- **Eventos:** teto de ingestão de telemetria auto-declarado (50k–150k eventos/dia/loja) sem plano de purge implementado (só descrito como "próximo passo").
- **Concorrência:** `finalizar_venda_transacional_canonica_v4` usa `pg_advisory_xact_lock` corretamente para evitar duplicidade — mas por concentrar 6 responsabilidades na mesma seção crítica, qualquer nova responsabilidade adicionada a essa função (mais um passo de validação, mais uma integração) aumenta o tempo de retenção do lock, criando tensão direta entre "adicionar regra de negócio" e "não degradar throughput de venda".

---

## 9. Evolução futura

| Capacidade futura | A arquitetura atual suporta? | O que precisa mudar |
|---|---|---|
| **Multi-empresa** | Não — modelo é `loja_id` plano, sem `empresa_id` acima | Nova hierarquia de tenant, reescrita de RLS e de toda RPC `SECURITY DEFINER` que hoje deriva loja implicitamente |
| **Filiais** | Parcial (já existe `transferir_estoque_entre_lojas`) | Falta hierarquia empresa→filiais e consolidação financeira/fiscal entre filiais |
| **API pública** | Não | Rotas atuais são internas, autenticadas por sessão Supabase/cookie; API pública exige modelo de auth por API key/OAuth, versionamento de contrato e rate limiting, tudo ainda inexistente |
| **App mobile** | Parcialmente — o padrão de outbox do `pdv-local` é reutilizável, mas hoje a validação já está **triplicada** (web/desktop/backend) sem contrato compartilhado; um terceiro cliente tende a virar uma quarta implementação de validação, não uma reutilização |
| **Marketplace / integrações** | Fraco | Não há barramento de eventos de domínio nem webhooks; só tabelas de fila (`documentos_fiscais_pendentes`) + polling via Edge Function. É uma base razoável para evoluir a um sistema de outbox de domínio genérico, mas ainda não existe como abstração reutilizável fora do fiscal |
| **Múltiplos bancos / mensageria** | Não | Sem broker de mensagens; tudo hoje é Postgres-como-fila. Funciona no volume atual, não escala para múltiplas integrações concorrentes |
| **Processamento assíncrono geral** | Parcialmente | 4 Edge Functions (`fiscal-worker`, `sync-outbox`, `validar-gerente`, `_shared`) mostram que o time já sabe operar workers assíncronos — é a fundação certa para generalizar, mas hoje cada worker é single-purpose, não uma infraestrutura de filas reutilizável |

O ponto mais importante desta seção: **multi-empresa é pré-requisito estrutural para quase tudo o resto da lista** (marketplace, API pública, mobile em escala). Não é um item paralelo do roadmap — é a fundação que falta embaixo de todos os outros.

---

## 10. Dívida técnica (classificada por severidade)

| # | Item | Severidade | Nota |
|---|---|---|---|
| 1 | Drift de migrations produção × repositório (numeração colidente, conteúdo divergente) | **Crítico** | Já auto-documentado pelo time em 2026-06-20; sem correção aplicada ainda |
| 2 | Modelo de tenant single-loja sem hierarquia de empresa | **Crítico** | Bloqueia o objetivo declarado de "milhares de empresas"; quanto mais código assume `loja_id` como topo, mais caro fica corrigir |
| 3 | Governança de "solo dev" sem enforcement de boundaries para equipe | **Crítico** (para o horizonte de 2 anos) | Colisões de numeração de migration já ocorrendo com fluxo de trabalho atual; risco cresce com mais pessoas |
| 4 | Função `finalizar_venda_transacional_canonica_v4` concentrando 6+ responsabilidades em PL/pgSQL | **Alto** | Difícil de testar isoladamente, difícil de estender sem aumentar tempo de lock |
| 5 | Multi-authority em Caixa e em Vendas/Sync (triplicada, sem contrato compartilhado) | **Alto** | Já classificado como "Alto risco" pela auditoria interna própria |
| 6 | Dois painéis de gestão (`/gerente` + `/admin`) coexistindo sem prazo de corte | **Alto** | Dobra superfície de auth, teste e manutenção até a Fase 9 |
| 7 | Quatro localizações "shared" concorrentes sem fronteira única | **Médio** | Gera duplicação por ambiguidade, não por necessidade real |
| 8 | Quatro autoridades de pricing coexistindo | **Médio** | Risco de divergência de preço sob concorrência |
| 9 | `SECURITY DEFINER` em 94 arquivos sem checklist central de quais checam perfil | **Médio** | Pelo menos 2 casos já auto-identificados como "hardening recomendado" e não fechados |
| 10 | Ausência de enforcement automatizado de boundaries (sem dependency-cruiser/nx/eslint-boundaries) | **Médio** | Hoje mitigado por scripts `guard:*` reativos, que cobrem só incidentes já ocorridos |
| 11 | Fiscal sem módulo de domínio próprio | **Médio** | Espalhado por Estoque e Financeiro; vai piorar conforme a superfície fiscal cresce |
| 12 | Sem política de retenção/purge de telemetria implementada | **Médio** | Já reconhecido como TODO no próprio doc de contrato |
| 13 | God files de UI (`CaixaPageClient.tsx` 1401 linhas, `produtos/actions.ts` 1152 linhas) | **Médio** | Reviewability e risco de regressão na tela mais crítica do produto |
| 14 | Duplicação pontual (`criarCliente` em Financeiro e em Clientes) | **Baixo** | Fácil de consolidar, baixo risco isolado |
| 15 | Arquivos transitórios versionados na raiz (`AUTONOMOUS_LOG.md`, `relatorio-risco-*.txt`, patch stash) | **Baixo** | Ruído de navegação, não risco funcional |

---

## 11. Comparação com arquiteturas maduras (ERPNext, Odoo, Medusa, Vendure)

- **Onde a lógica de negócio vive.** Odoo e ERPNext tratam o banco como camada relativamente "burra" — a lógica de negócio vive no framework Python (ORM + hooks), não em stored procedures. O fastproduct fez a escolha oposta: 57% das migrations definem functions, e a função canônica de venda é um monólito PL/pgSQL de ~250 linhas. Isso é defensável para performance e atomicidade transacional (é o argumento correto para colocar a baixa de estoque atômica no banco), mas quando a **regra de negócio inteira** — incluindo precificação, desconto, auditoria e enfileiramento fiscal — mora lá dentro, perde-se testabilidade e portabilidade que os frameworks maduros preservam deliberadamente.
- **Module system formal com barramento de eventos.** Medusa e Vendure (ambos Node/TS, mais próximos da stack do fastproduct que Odoo/ERPNext) organizam domínios como **módulos formais** com service layer próprio e comunicação entre módulos via **eventos/subscribers**, não via import direto nem via tabela compartilhada lida por múltiplos consumidores. O fastproduct hoje comunica módulos por dois canais informais: import direto entre pastas de `app/gerente/*` (achado da seção 6) e tabelas Postgres compartilhadas lidas por múltiplos caminhos (achado da auditoria de fiscal/auditoria). Não existe um "event bus" de domínio — `venda_eventos` é uma tabela de log, não um mecanismo de publish/subscribe.
- **Multi-empresa como conceito de primeira classe.** No Odoo, `company_id` (e regras de acesso entre empresas) é parte do núcleo do ORM desde o primeiro dia. No fastproduct, multi-empresa não existe ainda como conceito — é a lacuna mais fundamental frente a essas referências.
- **API pública versionada.** ERPNext e Odoo expõem uma camada de API REST/RPC genérica desde o núcleo do framework, pensada para integração de terceiros. O fastproduct não tem equivalente — as rotas existentes são internas e amarradas à sessão do Supabase.
- **O que aproveitar diretamente:** (1) adotar o padrão módulo+eventos de Medusa/Vendure para reduzir o acoplamento hoje resolvido por import direto e por tabela compartilhada; (2) mover deliberadamente para TypeScript a parte de regra de negócio que **não** exige atomicidade de banco (precificação, políticas de desconto, cálculo de auditoria), mantendo em PL/pgSQL só o que realmente precisa de garantia transacional (baixa de estoque, idempotência de venda); (3) tratar `empresa_id` como decisão de fundação, não como feature — do jeito que Odoo trata `company_id`.

---

## 12. Recomendações priorizadas (com esforço e "agora vs. depois")

| # | Recomendação | Por que existe o problema | Impacto se não corrigido | Esforço | Quando |
|---|---|---|---|---|---|
| 1 | Fechar o drift de migrations (baseline única via `supabase db pull`, numeração timestamp daqui pra frente, gate de CI `supabase db diff` vazio) | Evolução paralela de produção e repo sem processo de reconciliação obrigatório | Deploy futuro pode corromper schema em produção silenciosamente | Médio (1–2 semanas, já tem plano desenhado na própria auditoria interna) | **Agora** |
| 2 | Decidir e desenhar o modelo de tenant multi-empresa (`empresa_id` acima de `loja_id`) antes de escrever mais RPCs que assumem loja como topo | Produto cresceu como PDV de loja única; multiempresa nunca foi decisão de fundação | Reescrita generalizada de RLS e RPCs mais tarde, com produção já rodando | Alto (é uma decisão arquitetural + migração faseada, não uma sprint) | **Agora** (decisão), execução pode ser faseada |
| 3 | Definir prazo de corte e migrar as 8 rotas restantes de `/gerente` para `/admin`, aposentando o painel legado | Migração começou sem data de encerramento | Duplicação permanente de superfície de auth/teste | Médio | Curto prazo |
| 4 | Unificar validação de venda/sync (web Zod + `pdv-local` outbox + Edge Function) em um contrato/schema compartilhado único | Três times/momentos diferentes implementaram a mesma validação separadamente | Divergência silenciosa de regras entre canais (ex.: quantidade com 3 decimais no web vs. `Math.floor` no RPC, já documentado) | Médio-Alto | Curto prazo |
| 5 | Consolidar as quatro localizações "shared" em uma só (`shared-core`), aposentando `shared/` (root) e esvaziando/preenchendo `core/pricing` | Migração incremental sem ponto final definido | Continuação da duplicação por ambiguidade (próxima feature vai escolher o lugar errado de novo) | Médio | Curto/médio prazo |
| 6 | Dar a Fiscal um módulo de domínio próprio (`app/gerente/fiscal/` ou equivalente), tirando-o de dentro de Estoque e Financeiro | Fiscal cresceu como apêndice em vez de domínio | Fica mais caro assim que a superfície fiscal aumentar (mais regimes, mais documentos) | Médio | Médio prazo |
| 7 | Extrair função de cálculo pura de carrinho do `unifiedCartStore` para `shared-core`, deixando o Zustand store como adapter em cada runtime | Política de fronteira do `shared-core` já existe mas não foi seguida no próprio módulo | A regra que deveria prevenir acoplamento a paradigma de UI já foi violada no maior arquivo do módulo | Baixo-Médio | Médio prazo |
| 8 | Introduzir enforcement automatizado de boundaries (dependency-cruiser ou eslint-plugin-boundaries) além dos guards reativos atuais | Hoje só existem scripts que reagem a incidentes já ocorridos | Cada nova classe de violação só é pega depois de acontecer pelo menos uma vez | Baixo-Médio | Médio prazo, mas antes de crescer o time |
| 9 | Quebrar `finalizar_venda_transacional_canonica_v4` em passos menores testáveis (mesmo mantendo a transação/lock no banco), documentando cada passo como uma função nomeada | Função cresceu incrementalmente sem refatoração de responsabilidade | Cada nova regra de negócio aumenta o tempo de lock e a dificuldade de revisão | Alto | Médio prazo |
| 10 | Fechar formalmente o `ADR-PDV-001` (sign-off de produto + engenharia nas seções ainda "a preencher": autoridade no bip, política de preço, política offline) | ADR está em produção com decisões meio tomadas | Operação já roda sem contrato formal fechado sobre o que pode falhar sem impedir venda | Baixo (é decisão, não código) | **Agora** |
| 11 | Desenhar (não necessariamente implementar já) a camada de API pública versionada e o barramento de eventos de domínio, como pré-requisito antes de mobile/marketplace/integrações | Nenhuma dessas capacidades futuras tem fundação hoje | Cada nova integração futura tende a virar mais uma implementação triplicada, como já aconteceu com venda/sync | Alto | Depois (mas desenhar cedo) |

---

## 13. Roadmap arquitetural recomendado

**Fase 0 — Estancar o sangramento (semanas):**
Reconciliar migrations (item 1), fechar sign-off do `ADR-PDV-001` (item 10), fixar prazo de corte para o painel `/gerente` legado (item 3).

**Fase 1 — Consolidar fundações compartilhadas (1–2 meses):**
Unificar validação de venda/sync num contrato único (item 4), consolidar as quatro camadas "shared" em uma (item 5), extrair cálculo puro de carrinho do store (item 7), introduzir enforcement automatizado de boundaries (item 8).

**Fase 2 — Decisão de tenant e módulo fiscal (2–4 meses):**
Desenhar e começar a migração para `empresa_id`/multiempresa (item 2) — esta é a fase mais cara e mais importante; dar a Fiscal um módulo de domínio próprio (item 6) pode acontecer em paralelo, já que é menos acoplado à decisão de tenant.

**Fase 3 — Decompor o core transacional (2–3 meses, pode sobrepor com a Fase 2):**
Quebrar `finalizar_venda_transacional_canonica_v4` em passos nomeados e testáveis (item 9), migrar regras que não exigem atomicidade de banco (pricing, políticas de desconto) para TypeScript testável, mantendo no banco só o que precisa de garantia transacional.

**Fase 4 — Plataforma (a partir do mês 6-8):**
Desenhar barramento de eventos de domínio e camada de API pública versionada (item 11) como fundação para marketplace, mobile e integrações — só depois que multiempresa (Fase 2) estiver resolvida, porque toda API pública/integração externa vai precisar saber "de qual empresa" antes de saber "o quê".

Esta ordem não é arbitrária: cada fase depende de bases lançadas na anterior, e a decisão de tenant (Fase 2) é deliberadamente colocada **antes** de qualquer investimento em plataforma (Fase 4), porque é o único item desta lista que fica genuinamente mais caro quanto mais se espera.

---

## 14. Nota geral da arquitetura

### 5,5 / 10

Esta nota tem duas leituras que não podem ser fundidas em uma só sem perder informação:

- **Como PDV de loja única já em produção:** a maturidade é bem mais alta — RLS real, máquina de estados de scan bem desenhada, autoridade de auth convergida e testada, cultura de auto-auditoria rara. Nessa leitura restrita, o sistema mereceria algo como 7/10, com os problemas sendo majoritariamente de dívida técnica gerenciável.
- **Como fundação para o ERP multi-empresa, multi-módulo, mantido por dezenas de devs descrito no pedido:** a nota cai para perto de **4/10**, porque os três gaps mais caros de corrigir depois — modelo de tenant, lógica de domínio presa em PL/pgSQL, e governança desenhada para um único desenvolvedor — são exatamente os três que mais crescem em custo quanto mais tarde forem endereçados, e nenhum dos três tem hoje sequer uma decisão formal tomada (o próprio roadmap trata multiempresa como item de longo prazo, não como pré-requisito).

**5,5/10 é a média ponderada dessas duas leituras, puxada para baixo pelo fato de que o pedido de revisão define explicitamente o alvo como a segunda leitura.** O sistema não está "pronto para produção como ERP" — está pronto como PDV de produção único, com uma quantidade significativa de trabalho arquitetural de fundação (não de feature) necessária antes de ele poder honestamente ser chamado de plataforma ERP multi-empresa. A boa notícia, e a razão para a nota não ser mais baixa, é que a equipe já demonstrou — nas próprias auditorias internas e no design do scan-pipeline — que sabe fazer esse tipo de trabalho de fundação bem quando o faz. O que falta é decisão e sequenciamento, não capacidade.
