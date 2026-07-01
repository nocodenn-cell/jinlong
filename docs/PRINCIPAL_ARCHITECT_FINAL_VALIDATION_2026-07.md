# Principal Architecture Validation (Final) — fastproduct

**Postura desta auditoria:** o objetivo aqui não é medir progresso — é tentar **reprovar** a arquitetura. A pergunta não é "melhorou desde a última revisão?" (ver `docs/PRINCIPAL_ARCHITECT_REVIEW_2026-07.md`). A pergunta é **"ela é consistente, hoje, olhando só para o código atual, com horizonte de 10 anos e decisões passadas ignoradas?"**. Onde uma inconsistência foi encontrada, ela é reportada com arquivo/linha — não com adjetivo.

**Método:** leitura direta de código + 4 investigações direcionadas adicionais (triggers/views/materialized views do banco; SSOT de Estoque/Venda/Pagamento/Caixa; SSOT de Cliente/Fornecedor/Produto/Fiscal/Permissão/Usuário/Auditoria/Configuração; enforcement automatizado vs. convenção + inventário hexagonal), somadas às investigações da revisão anterior.

---

## 1. Inventário completo de módulos

| Módulo | Responsabilidade única | Aggregate Root | Autoridade | Quem chama (legítimo) | Quem NÃO deveria chamar | Depende de | Quem depende dele | Violação confirmada? |
|---|---|---|---|---|---|---|---|---|
| **PDV/Caixa** | Operar sessão de caixa e finalizar venda | Nominal: `Venda`/`Caixa` — real: vive em stored procedures, não em classe TS | **Fragmentada**: abertura sem RPC; fechamento com 2 RPCs simultâneas (uma órfã); movimentação com RPC única (boa prática); finalização v4 canônica (boa prática) | `app/caixa/server/*.impl.ts`, `pdv-local`, Edge `sync-outbox` | Outros módulos gerente não deveriam escrever em `caixas`/`movimentos_caixa` — **confirmado que não o fazem** | Supabase Auth, `estoque` (baixa), `pdv_config` | Financeiro (`venda_finance_context`, comissões), Auditoria (`venda_eventos`) | **Sim** — abertura sem lock/RPC (`caixaSessaoOperador.impl.ts:100-110` faz `insert` direto); `fechar_caixa_pdv_atomico` (migration `227`) órfã e ainda `GRANT`ada ao lado de `fechar_caixa_atomico` (a usada de fato); `sync-outbox/index.ts:459` é um **terceiro** caminho de escrita em `caixas` |
| **Produtos** | Cadastro/ciclo de vida de produto | `Produto` — único módulo com quase-Aggregate real (`produtoService` + `produtoRepository`) | **Dividida**: CRUD manual (TS) x criação/vínculo via `importar_nfe_transacao` (RPC SQL) | `app/gerente/produtos/actions.ts`, `app/admin/catalogo` | `app/gerente/estoque/actions.ts` não deveria fazer `insert`/`delete` em `estoque` a partir do fluxo de criação/exclusão de produto | `core/services/produtoService`, `produtoRepository`, RLS `produtos_escrita` | Estoque, Caixa, Relatórios, Auditoria, NFe | **Sim** — segunda autoridade de escrita (RPC de NFe bypassa `produtoService` inteiramente); RLS de `SELECT` em `produtos` é **"todas (autenticado)"**, sem escopo de loja (`AUTHORIZATION_MATRIX.md`, ainda sem hardening) |
| **Estoque** | Saldo/movimento de estoque por loja | Nenhum em TS — vive em `decrementar_estoque_seguro`/`ajustar_estoque_manual`/`transferir_estoque_seguro` | Majoritariamente RPC, **mas com 3 escritas diretas fora de RPC confirmadas** | Caixa (venda), Gerente/Estoque (ajuste), Produtos (linha inicial) | Produtos não deveria escrever em `estoque` diretamente | `produtos` (FK), `movimentos_estoque_log` | Caixa, Relatórios, Auditoria | **Sim** — `garantirLinhaEstoque` (`app/gerente/estoque/actions.ts:87`) e `produtos/actions.ts:79`/`:640` fazem `.from('estoque').insert/delete` direto, fora de qualquer RPC; `RelatorioEstoqueClient.tsx` importa `estoque/actions` diretamente |
| **Financeiro** | Contas a receber/pagar, comissões, espelho financeiro | Nenhum — "fat actions" com Supabase direto | `app/gerente/financeiro/actions.ts` + triggers (`trg_finance_context_pagamento`, `trg_finance_context_conta`, `trg_registrar_comissao`) | `/gerente/financeiro`, `/admin/financeiro` (via `financeiroTitulosServer.ts` compartilhado) | Financeiro não deveria ter `criarCliente()` próprio | `vendas_pagamentos`, `contas_receber`, `comissoes_vendedores` (via trigger) | Auditoria, Admin | **Sim** — `criarCliente()` duplicado (`financeiro/actions.ts:19`) em paralelo a `clientes/actions.ts` |
| **Fiscal** | Emissão/gestão de documento fiscal | Nenhum módulo de domínio próprio — nem pasta dedicada | Majoritariamente backend (`fiscal_enfileirar_documento_venda`, Edge `fiscal-worker`) — validação só em `fiscal-validation.ts` (Deno), sem duplicata em TS do app (ponto positivo pontual) | Venda (enqueue pós-venda), `estoque/importar-nfe` (entrada), `financeiro/documento/[id]` (emissão) | N/A (não há módulo próprio a proteger) | Fila `documentos_fiscais_pendentes`, `fiscal-worker` | Venda, Auditoria | **Sim** — domínio sem dono; espalhado por Estoque e Financeiro, que não têm relação de domínio entre si |
| **Clientes** | Cadastro de cliente | Nenhum, CRUD simples | Dividida com Financeiro | `/gerente/clientes`, indiretamente Financeiro | Financeiro | — | Financeiro (fiado), Vendas (associação opcional) | **Sim** — autoridade duplicada confirmada (2 escritores) |
| **Fornecedores** | Cadastro de fornecedor | Nenhum | **Dividida**: CRUD manual (`fornecedores/actions.ts`) x upsert via `importar_nfe_transacao` | `/gerente/fornecedores`, fluxo de NFe | Fluxo de NFe não deveria escrever fornecedor por caminho SQL paralelo | — | Produtos (vínculo), Recebimento | **Sim** — autoridade duplicada confirmada (TS manual vs. RPC de import) |
| **Auditoria** | Timeline agregada de leitura sobre ledgers existentes | N/A (read model, não Aggregate) | Leitura consolidada em `app/admin/auditoria/actions.ts`; **escrita sempre via trigger/RPC de outros módulos** (SSOT de escrita confirmado — bom) | Painel admin | Outros módulos não deveriam reimplementar leitura das mesmas tabelas por RPC própria | `venda_eventos`, `vendas_canceladas_auditoria`, `movimentos_estoque_log`, `system_alerts`, `descontos_venda` | Painel admin (única UI) | **Sim** — `app/admin/estoque/actions.ts` e `app/gerente/vendas/actions.ts` leem as mesmas tabelas por caminhos de RPC paralelos, fora do módulo de auditoria |
| **Usuários** | Deveria ser gestão de conta/perfil/loja | N/A — **módulo não existe** | Nenhuma — único caminho é Supabase Auth admin/SQL direto | Ninguém (sem actions de escrita na aplicação) | N/A | N/A | `adminPolicy`, RLS de quase toda tabela (só leitura) | **Sim, por ausência** — é um dos módulos explicitamente pedidos no escopo do ERP e **não existe como capacidade de aplicação** |
| **Relatórios** | Leitura agregada para decisão gerencial | N/A (read model) | Mistura de RPCs `relatorio_*` dedicadas (bom) com import direto de action de Estoque (ruim) | `/gerente/relatorios/*`, `/admin/relatorios` | Relatórios não deveria importar Server Action de escrita/gestão de outro domínio | Views (`v_kardex_unificado`, `v_estoque_baixo`), RPCs `relatorio_*` | Ninguém (folha) | **Sim** — `RelatorioEstoqueClient.tsx` → `@/app/gerente/estoque/actions` |
| **Configurações** | Dados de loja e parâmetros do PDV | Nenhum, CRUD simples | **Única e consolidada** (`app/gerente/configuracoes/actions.ts`) | `/gerente/configuracoes`, `/admin/configuracoes` (delega, não duplica) | N/A | — | Caixa (limites), Fiscal (defaults) | **Não** — melhor caso de SSOT do sistema junto com Produtos |
| **Ledger** (`core/ledger/*`) | Motor de partidas contábeis | `LedgerEngine` — **único candidato real a Aggregate Root TS de todo o sistema** | TS puro, com porta + adapter in-memory testável | Hoje, quase ninguém em produção | N/A | Nada de infra | Potencialmente Financeiro (ainda não integrado de fato) | **Não** diretamente — mas é "módulo pequeno demais" em uso real vs. qualidade de desenho: o melhor código DDD do repositório está isolado e subutilizado |
| **Shared** (`shared/`, `shared-core/`, `core/`, `pdv-importados/shared/`) | Deveria ser lógica runtime-agnóstica reutilizável | N/A (infraestrutura de código) | **Fragmentada entre 4 locais** | Praticamente todo o sistema | `shared-core` não deveria conter Zustand store por sua própria regra documentada (`RECONNECT_REPLAY_POLICY.md` §0.4) | Nada externo (sem dependência invertida confirmada) | `pdv-importados`, `pdv-local` | **Sim** — a própria regra de fronteira do módulo já é violada pelo seu maior arquivo (`unifiedCartStore.ts`, 427 linhas) |

**Leitura do inventário:** de 13 módulos analisados, **9 têm violação confirmada de autoridade única ou boundary**, 1 não existe (Usuários), 1 está isolado/subaproveitado (Ledger), e apenas **2** (Configurações, e parcialmente Ledger) não apresentam achado negativo. Isso não é "alguns pontos fracos" — é o padrão dominante.

---

## 2. Mapa de dependências (grafo lógico)

```
[Frontend]  React Server/Client Components, 'use client'
     │  deveria chamar
     ▼
[Application]  Server Actions / actions.ts / API routes
     │  deveria chamar
     ▼
[Domain]  core/services, core/caixa, core/vendas, core/ledger, core/ports
     │  deveria chamar via Port/Adapter
     ▼
[Infrastructure]  lib/adapters/supabase/*, lib/supabase/*, Edge Functions
     │
     ▼
[Database]  Postgres — tables, RPCs/Functions, Triggers, RLS, Views
```

**Dependências invertidas / que pulam camada — todas confirmadas com evidência:**

| # | Transição real observada | Evidência | Gravidade |
|---|---|---|---|
| 1 | **Frontend → Infrastructure**, pulando Application e Domain | `app/gerente/features/FeatureToggle.tsx` e `app/login/LoginForm.tsx` — `'use client'` + `createClient()` de `@/lib/supabase/client` chamado direto no componente | Alta — é exatamente o tipo de furo que nenhuma regra de lint genérica hoje impede |
| 2 | **Application → Infrastructure**, pulando Domain | Estoque, Financeiro e (parcialmente) Caixa fazem `supabase.from(...)`/`.rpc(...)` direto dentro da Server Action, sem passar por `core/` | Alta — é o padrão **dominante**, não a exceção (só Produtos passa por Domain de fato) |
| 3 | **Database assumindo o papel conceitual de Domain** | 107/187 migrations definem functions; `finalizar_venda_transacional_canonica_v4` concentra pricing + venda + estoque + pagamento + desconto + ledger + fiscal em ~250 linhas de PL/pgSQL | **Crítica** — a camada mais "de baixo" do diagrama concentra a maior parte das decisões de negócio que, por definição de Clean/Hexagonal, deveriam estar em Domain |
| 4 | **Infrastructure duplicando Domain** | RLS (`CREATE POLICY`) reimplementa em SQL a mesma decisão de autorização que `adminPolicy.ts` já decide em TypeScript — divergência confirmada: `lojas_write_gerente` (migration `032`) não inclui `ADMIN`, enquanto `adminPolicy.ts` inclui | Alta — duas fontes de verdade independentes para a mesma regra de permissão, sem nenhum mecanismo que as mantenha sincronizadas |
| 5 | **Domain → Infrastructure/Framework** | **Não encontrado.** `core/` não importa `next`, `react` nem `@/lib/supabase` (grep confirmatório vazio) | — (ponto positivo real) |
| 6 | **Shared → App** (dependência invertida clássica) | **Não encontrado.** `shared-core/src` não importa de `pdv-importados`/`pdv-local` (só menções em comentário) | — (ponto positivo real) |

**Veredito do grafo:** as duas violações mais graves (#3 e #4) não são "imports errados" que um linter pegaria facilmente — são **inversões conceituais**: o banco de dados é, na prática, a camada de domínio real do sistema, e a autorização é decidida duas vezes por dois sistemas de tipos diferentes (TypeScript e SQL) sem nenhum contrato que os mantenha alinhados.

---

## 3. Auditoria de Single Source of Truth

| Conceito | Autoridade única? | Segunda autoridade | Lógica duplicada | Cálculo duplicado | Validação duplicada | Estado duplicado |
|---|---|---|---|---|---|---|
| **Preço** | Não | `PricingService` (classe TS), RPC `calcular_preco_produto`, triggers `122/124/125/126`, piso `precoMinimo` em `unifiedCartStore` — **4 autoridades** | Sim | Sim (client estima, server é autoritativo) | Sim (margem negativa validada em trigger E em regra de UI) | Sim (snapshot MANUAL/PROMOÇÃO confiado do client, per auditoria interna já existente) |
| **Estoque** | Não | 3 escritas diretas fora de `decrementar_estoque_seguro`/`ajustar_estoque_manual` (`garantirLinhaEstoque`, criação/exclusão de produto) | Parcial | Não | Só em PL/pgSQL (sem CHECK constraint de banco — validação existe mas não é reforçada estruturalmente) | Não |
| **Venda** | **Sim, na prática** | v2/v3 existem no banco mas estão bloqueadas (`block_v2_legacy_overloads`); nenhuma Server Action ativa as chama | Não | Não | Não | Não |
| **Pagamento** | **Sim, na escrita** (só `finalizar_venda_transacional_canonica_v4` insere `vendas_pagamentos`) | — | Não | **Sim** — client (`CaixaPageClient.tsx`, `diferencaPagamento`) recalcula soma/troco antes de enviar; server revalida com `round_abnt`/tolerância `0.02` | Não | Não |
| **Caixa** | **Não** | Abertura sem RPC (insert direto); **2 RPCs de fechamento vivas** (`fechar_caixa_atomico` em uso, `fechar_caixa_pdv_atomico` órfã); 3º caminho de escrita via `sync-outbox` | Sim | **Sim** — limite de divergência `5.00` hardcoded de forma independente em SQL (`fechar_caixa_atomico`, migration `230`, `c_limite CONSTANT numeric := 5.00`) E em TypeScript (`CaixaPageClient.tsx:624`, `Math.abs(diferencaEstimada) > 5`) | Sim | Sim (cálculo de diferença refeito nos dois lados) |
| **Cliente** | Não | `criarCliente()` em Financeiro paralelo a `clientes/actions.ts` | Sim | Não | Possivelmente (campos obrigatórios podem divergir entre os dois) | Não |
| **Fornecedor** | Não | Upsert via `importar_nfe_transacao` (RPC) paralelo ao CRUD manual (`fornecedores/actions.ts`) | Sim | Não | Não confirmado | Não |
| **Produto** | Não | Criação/vínculo via `importar_nfe_transacao` (RPC) paralelo a `produtoService`/`produtoRepository` (TS) | Sim | Não | Regras de status (`status_publicacao`) podem divergir entre os dois caminhos | Não confirmado |
| **Fiscal** | **Sim, na prática** | Validação só em `fiscal-validation.ts` (Deno); não encontrada duplicata em TS do app | Não confirmado | Não | Não confirmado | Não |
| **Permissão** | **Não** | `adminPolicy.ts` (TS) x dezenas de `CREATE POLICY` (SQL), uma por tabela/operação, reimplementando a mesma checagem de perfil | **Sim, com divergência confirmada** (`lojas_write_gerente` sem `ADMIN`) | Não | **Sim, divergente** | Não |
| **Usuário** | N/A | Não há autoridade de escrita na aplicação — só Supabase Auth admin/SQL | — | — | — | — |
| **Auditoria** | **Sim, na escrita** (sempre trigger/RPC, nunca insert direto do app) | Leitura duplicada (não escrita) por `app/admin/estoque/actions.ts` e `app/gerente/vendas/actions.ts` | Parcial (leitura) | Não | Não | Não |
| **Configuração** | **Sim** | Nenhuma segunda autoridade de escrita confirmada | Não | Não | Não | Não |

**Resultado agregado:** de 13 conceitos, **8 têm mais de uma autoridade de escrita ou validação concorrente** (Preço, Estoque, Caixa, Cliente, Fornecedor, Produto, Permissão, e parcialmente Auditoria/leitura). Apenas **Venda, Pagamento (escrita), Fiscal e Configuração** têm autoridade única confirmada — e mesmo Pagamento tem cálculo duplicado (client + server) mesmo com escrita única. **Isso é o achado central desta auditoria: a maioria dos conceitos de negócio do sistema não tem uma única fonte de verdade — tem, em média, entre 1,5 e 2 fontes concorrentes por conceito.**

---

## 4. Auditoria DDD por módulo

| Módulo | Aggregate Root | Entities | Value Objects | Factories | Policies | Repositories | Services | Events | Veredito |
|---|---|---|---|---|---|---|---|---|---|
| Produtos | Fraco (funções, não classe) | Implícito (`Produto` como tipo, não classe com invariantes) | Nenhum explícito | Nenhum | `core/systemRules.ts` (parcial) | `produtoRepository` (real, único do sistema) | `produtoService` (real) | Não | **Semi-anêmico** — é o melhor caso fora do Ledger, mas ainda função-baseado |
| Estoque | Nenhum | Nenhum | `roundAbnt` (money) é o único VO real do sistema, e nem é específico de estoque | Nenhum | Nenhum em TS (vive em PL/pgSQL) | Nenhum | Nenhum | Nenhum | **Anêmico total** — 100% procedural, TS só orquestra chamada de RPC |
| Vendas | Nenhum em TS — vive em stored procedure | Nenhum | Nenhum | Nenhum | Nenhum em TS | Nenhum | `core/vendas/VendaService.ts` (fino, pouco mais que wrapper) | `venda_eventos` (tabela de log, não Domain Event no sentido DDD — sem payload tipado nem assinatura de handler) | **Anêmico** — o Aggregate real é a stored procedure |
| Caixa | Nenhum em TS | Nenhum | Nenhum | Nenhum | Nenhum em TS | Nenhum | `core/caixa/CaixaService.ts` (fino) | Nenhum | **Anêmico** |
| Financeiro | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum (mesmo com `venda_finance_context` existindo como espelho, não há Domain Event modelado) | **Anêmico total** |
| Fiscal | Nenhum em TS (Edge Function isolada) | Nenhum | Nenhum | Nenhum | `fiscal-validation.ts` (Deno, fora do domínio TS principal) | Nenhum | Nenhum | Fila (`documentos_fiscais_pendentes`) é um proto-event-log, não modelado como evento de domínio | **Anêmico** |
| Clientes/Fornecedores | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | **Anêmico total** |
| Auditoria | N/A (é read model) | N/A | N/A | N/A | Regras de merge/dedupe em `app/admin/auditoria/actions.ts` (ok para um read model) | N/A | N/A | Consome eventos de outros, não produz | **Correto para o que é** (read model, não deveria ter Aggregate mesmo) |
| **Ledger** | **`LedgerEngine`** — real | `chartOfAccounts` (estrutura tipada) | Parcialmente (`money.ts`) | Implícito em `commands.ts` | Implícito em `validateEntry.ts` | `LedgerPort` + `InMemoryLedger` (real) | Via `commands`/`queries` | Não formalizado como pub/sub, mas o desenho já suporta | **O único módulo com DDD correto** — mas isolado e pouco usado |

**Veredito geral de DDD:** o sistema tem, na prática, **um** módulo com modelo de domínio correto (`Ledger`) e **onze** anêmicos ou inexistentes. Isso não é "DDD parcialmente aplicado" — é DDD aplicado como demonstração em um canto isolado do código, enquanto o restante do sistema opera como CRUD-sobre-stored-procedures. Não há Factories em lugar nenhum do sistema fora do Ledger; não há Value Objects de negócio (Dinheiro, Quantidade, CFOP, CNPJ) além de `roundAbnt`; não há Domain Events com payload tipado e assinatura de consumidor — o que existe são tabelas de log lidas por múltiplos RPCs.

---

## 5. Auditoria Clean Architecture

| Regra | Verificado | Resultado |
|---|---|---|
| Domain não conhece Infrastructure | `grep` em `core/**` por `next`, `react`, `@/lib/supabase` | **Respeitado** — nenhuma ocorrência |
| Application não conhece UI | Server Actions não deveriam importar componentes React | Não testado diretamente nesta rodada, mas nenhuma evidência em contrário nas investigações anteriores |
| Infrastructure não contém regra de negócio | Migrations SQL | **Violado, estruturalmente** — 107/187 migrations definem functions com regra de negócio (validação de margem, limite de desconto, cálculo de comissão, idempotência de venda); a função canônica de venda é o Aggregate de fato |
| Shared não virou God Module | `shared-core`, `shared/`, `core/`, `pdv-importados/shared/` | **Parcialmente violado** — não por tamanho (shared-core tem só 3.926 linhas, disciplinado), mas por **ambiguidade estrutural**: 4 locais concorrentes sem fronteira única, e a própria regra de fronteira documentada do `shared-core` já foi violada pelo seu próprio maior arquivo |

**Veredito Clean Architecture: 2 de 4 regras respeitadas, 2 violadas de forma estrutural (não pontual).** A regra mais importante — "Infrastructure não contém regra de negócio" — é violada em mais da metade do schema do banco, o que é o oposto do que Clean Architecture prescreve.

---

## 6. Auditoria Hexagonal (Ports & Adapters)

| Item | Inventário | Achado |
|---|---|---|
| **Ports** (`core/ports/`) | Apenas `produto.ts` | **1 de N domínios** tem porta formal. Não existe port para Estoque, Venda, Pagamento, Caixa ou Fiscal |
| **Adapters** (`lib/adapters/`) | Apenas `lib/adapters/supabase/produtoRepository.ts` | Espelha exatamente o único port existente |
| **Driving adapters** (primários, iniciam o caso de uso) | Server Actions que chamam `core/services/*` | Só o fluxo de Produtos segue esse padrão de fato |
| **Driven adapters** (secundários, chamados pelo domínio) | `produtoRepository` | Único exemplo real |
| **Adapters que ainda não deveriam existir** (abstração prematura) | — | **Nenhum encontrado.** O problema não é abstração excessiva — é o oposto: faltam adapters para Estoque, Venda, Pagamento, Caixa, Fiscal, Financeiro e Fornecedor que deveriam existir e não existem |

**Veredito:** chamar isto de "arquitetura hexagonal" seria impreciso. O que existe é **um** domínio (Produtos) com porta e adapter reais, cercado por onze domínios que falam diretamente com o Supabase client dentro da própria Server Action. Ter hexagonal em 1 de 12 domínios não é "hexagonal parcial" — é uma prova de conceito isolada que nunca foi generalizada, e cuja existência isolada é, paradoxalmente, evidência de **inconsistência**: um novo desenvolvedor vendo `core/ports/produto.ts` legitimamente esperaria encontrar `core/ports/estoque.ts` ao lado — e não vai encontrar.

---

## 7. Auditoria do banco de dados

| Categoria | Volume | Achado |
|---|---|---|
| **Functions/Stored Procedures** | 107 de 187 migrations (57%) | Lógica de negócio concentrada no banco, incluindo o Aggregate de Venda inteiro |
| **Triggers** | 20 arquivos, ~20 triggers nomeados | Cobrem `updated_at` (baixo risco), guarda de margem/desconto (`122`, `124`, `125`, refeitos em `126` após bug real — ver abaixo), detecção de anomalia (`236`, não-bloqueante), comissão (`103`/`214`), espelho financeiro (`235`) |
| **Bug de trigger já manifestado em produção** | Migrations `124`/`125` → `126` | Os triggers de guarda de margem eram `BEFORE INSERT OR UPDATE` **sem `WHEN`**, disparando validação de margem em qualquer UPDATE (mesmo em coluna não relacionada, ex. `ativo`). Corrigido em `126` com `WHEN` restrito. **Isso é evidência concreta e não hipotética de que a fragilidade de lógica em trigger já causou incidente real**, não é risco teórico |
| **Cascata trigger→trigger** | `vendas_pagamentos` INSERT → `trg_finance_context_pagamento` → INSERT/UPDATE em `venda_finance_context` (sem trigger próprio, cascata para aqui); `vendas` UPDATE de status → `trg_registrar_comissao` → INSERT em `comissoes_vendedores` (sem trigger próprio) | Cascata de profundidade 2, controlada — mas cada trigger novo adicionado à cadeia de venda aumenta a superfície de efeito colateral implícito em uma única operação `UPDATE`/`INSERT` |
| **RLS (Policies)** | 51/187 migrations tocam RLS | Ampla cobertura, mas duplica em SQL a mesma decisão que `adminPolicy.ts` já toma em TS (achado #4 do grafo de dependências), com divergência confirmada |
| **SECURITY DEFINER** | 94 arquivos / 155 ocorrências | Superfície grande; pelo menos 2 casos já auto-identificados pelo próprio time como "sem checagem de perfil — hardening recomendado" (`AUTHORIZATION_MATRIX.md`) |
| **Views** | 5 views (`v_estoque_baixo`, `v_kardex_unificado`, `v_fiscal_doc_status_event_mismatch`, `v_clientes_gerente`, `v_venda_consistencia_anomalias`) | `v_kardex_unificado` faz UNION ALL/JOIN entre `movimentos_estoque_log`, `vendas`, `caixas`, `itens_venda`, `vendas_canceladas_auditoria` — **acopla estoque + vendas + caixa no nível de schema do banco**, não só em código de aplicação. `v_clientes_gerente` foi criada e **redefinida em migrations com nomes colidentes** (`244` vs `245`), o mesmo padrão de fragilidade de numeração já visto no restante do repositório, agora também em views |
| **Materialized Views** | **Nenhuma** | Em um sistema com views de agregação pesada (`v_kardex_unificado` fazendo UNION ALL sobre múltiplas tabelas grandes) e sem materialização, o custo de leitura cresce linearmente com o volume de dados — risco direto para a seção de escalabilidade |
| **Migrations de correção** (`fix_`/`rollback_`) | 10 de 187 (~5%) | Proxy direto de fragilidade já manifestada — não é projeção, é histórico |

**Existe lógica demais no banco?** Sim, e não apenas em volume — em **tipo**. Validações de regra de negócio (margem, limite de desconto), orquestração de múltiplos domínios (a função de venda) e leitura cross-domínio (`v_kardex_unificado`) vivem todas no Postgres. Isso não é errado por definição — bancos maduros fazem isso para garantir atomicidade — mas aqui não há uma linha clara de "o que precisa de atomicidade transacional" (defensável) vs. "o que só está lá porque foi mais rápido de escrever assim" (dívida). A auditoria não encontrou esse critério documentado em lugar nenhum.

---

## 8. Auditoria de escalabilidade extrema (100M vendas, 20M produtos, 50 mil empresas)

**A arquitetura suporta? Não, em nenhuma das três dimensões, sem reescrita estrutural.**

| Onde quebra primeiro | Por quê | Evidência |
|---|---|---|
| **1º — Modelo de tenant** | Não existe `empresa_id`. RLS escopa por `usuarios.loja_id` plano. 50 mil empresas exigiria isolamento real (dados, performance, "noisy neighbor") que hoje nem está desenhado, quanto mais implementado | `ROADMAP.md` lista multi-loja/filiais como item de longo prazo, não decidido |
| **2º — RLS de `produtos` sem escopo de loja** | `SELECT` em `produtos` é "todas (autenticado)" — hoje isso já é um problema de isolamento entre lojas da mesma instalação; em 50 mil empresas compartilhando schema, sem correção, seria uma falha de isolamento de dados entre clientes, não só um problema de performance | `AUTHORIZATION_MATRIX.md`, linha de `produtos` SELECT |
| **3º — Teto de ingestão de telemetria já autodeclarado** | O próprio time documentou 50k-150k eventos/dia/loja como limite antes de precisar de agregação assíncrona/fila dedicada/time-series | `RECONNECT_REPLAY_POLICY.md` §0.3 — em 50 mil empresas, esse teto é ultrapassado por ordens de grandeza no primeiro dia |
| **4º — `v_kardex_unificado` sem materialização** | UNION ALL + JOIN entre 5 tabelas de domínios diferentes, sem materialized view, sem partição documentada — em 100M vendas isso deixa de ser uma view de conveniência e vira um dos piores planos de execução do sistema | Confirmado por leitura direta da definição da view |
| **5º — Fila fiscal 100% Postgres-como-fila** | `documentos_fiscais_pendentes` + `fiscal-worker` via polling/`pg_cron`, sem broker de mensagens dedicado | `backend/supabase/functions/fiscal-worker`, `20260515000000_fiscal_worker_cron.sql` |
| **6º — Aggregate de venda como stored procedure única** | Cada venda dispara `finalizar_venda_transacional_canonica_v4` (6 responsabilidades) mais até 2-3 triggers em cascata (`trg_itens_venda_*`, `trg_finance_context_pagamento`, `trg_registrar_comissao`) dentro de uma transação com `pg_advisory_xact_lock`. Em 100M vendas sustentadas, cada escrita amplificada por trigger é multiplicada — write amplification por venda não é trivial | Estrutura confirmada da migration `243`/`246` |

**Nota sobre o que *não* quebraria primeiro:** o particionamento natural por `loja_id` em tabelas operacionais (`estoque`, `caixas`) é, na verdade, um bom presságio para sharding futuro — não é tudo ruim. O problema não é a ausência total de capacidade de escalar; é que **os 3 primeiros pontos de ruptura são exatamente os que exigem decisão de produto/arquitetura tomada com antecedência**, e nenhum dos três tem hoje uma decisão formal.

---

## 9. Auditoria de simplicidade

| Categoria | Achado |
|---|---|
| **Complexidade desnecessária (acidental, não essencial)** | 4 localizações "shared" concorrentes; 3-4 autoridades de pricing; 2 painéis de gestão (`/gerente` + `/admin`) coexistindo sem prazo — nenhuma dessas complexidades vem do domínio de negócio, todas vêm de migração incompleta |
| **Abstrações excessivas** | **Não encontrado como padrão geral.** O sistema, se algo, sub-abstrai (só 1 domínio tem port/adapter) |
| **Abstração insuficiente** | Ports/Adapters existem para 1 de 12 domínios; `core/pricing/` é uma pasta vazia (só contém um teste que importa de outro lugar) — uma abstração anunciada e não entregue é pior do que a ausência da pasta |
| **Camadas inúteis** | `core/pricing/` (vazia, cerimonial); `core/sync/` (só contém um `.md`, sem código) |
| **Objetos inúteis** | `toPolicyDecision` em `adminPolicy.ts` — definida, **sem consumidores em produção** (já confirmado em auditoria interna anterior) |
| **Código cerimonial** | A regra de `.cursorrules` de "funções com no máximo 20 linhas, complexidade cognitiva abaixo de 5" coexiste com `CaixaPageClient.tsx` (1401 linhas) e `produtos/actions.ts` (1152 linhas) — a regra existe como texto, não como prática, o que é pior do que não ter a regra: cria a expectativa de um padrão que o próprio código do sistema não segue |

**Veredito:** a complexidade que existe não é a complexidade "cara" (over-engineering, abstrações especulativas) — é a complexidade "barata" de migração inacabada e convenção não fiscalizada. Isso é, paradoxalmente, mais fácil de corrigir do que over-engineering, mas também mais fácil de deixar acumular indefinidamente porque nenhuma métrica de complexidade formal está sendo aplicada (ver seção 13).

---

## 10. Auditoria de evolução

| Capacidade | Facilidade de adicionar hoje | Por quê |
|---|---|---|
| **Marketplace** | Baixa | Sem barramento de eventos de domínio; só tabelas de fila específicas (fiscal) |
| **App Mobile** | Baixa-Média | Padrão de outbox do `pdv-local` é replicável, mas validação de venda já está **triplicada** sem contrato compartilhado — um 3º cliente tende a virar uma 4ª implementação, não reuso |
| **API Pública** | Muito baixa | Rotas atuais são internas, sessão-cookie; não há modelo de auth por API key/OAuth, nem versionamento de contrato |
| **Mensageria** | Baixa | Zero broker; tudo é Postgres-como-fila hoje |
| **Filiais** | Média | Já existe `transferir_estoque_entre_lojas`; falta hierarquia empresa→filiais e consolidação financeira/fiscal |
| **Microserviços futuros** | Muito baixa | O domínio inteiro está entrelaçado dentro de um único schema Postgres com FKs cruzando "domínios" (ex.: `v_kardex_unificado` juntando estoque+vendas+caixa); extrair um serviço exigiria primeiro desenhar boundaries que hoje não existem em lugar nenhum, nem em código nem em schema |
| **Machine Learning** | Média | Dados existem (vendas, estoque, telemetria), mas sem pipeline de exportação/feature store; teria que ser construído do zero, não é bloqueado, só inexistente |
| **Domain Events** | Baixa-Média | `venda_eventos` é um proto-event-log (tabela, não barramento) — seed razoável, mas sem payload tipado, sem assinatura de consumidor, sem garantia de entrega além de leitura direta de tabela |
| **CQRS** | Já emergindo organicamente, não deliberado | RPCs `relatorio_*` e views já são, de fato, um read-side separado do OLTP — mas não é arquitetado como CQRS (mesmo schema, sem store de leitura dedicado, sem sincronização assíncrona formal) |
| **Event Sourcing parcial** | Baixa | `venda_eventos` poderia evoluir para isso, mas hoje é log de auditoria, não fonte de verdade replayável — recriar estado a partir dele não é uma capacidade testada nem desenhada |

**Veredito:** a capacidade que mais bloqueia todo o resto desta lista é a ausência de barramento de eventos de domínio — sem ele, cada nova integração (marketplace, mobile, mensageria) tende a repetir o padrão já visto em Vendas/Sync: uma nova implementação paralela de validação, em vez de um consumidor de um evento já existente.

---

## 11. Auditoria de manutenção — onboarding de um novo desenvolvedor

| Fluxo | Tempo estimado para entender de ponta a ponta | Por quê |
|---|---|---|
| **Fluxo de venda** | Alto (dias) | Precisa ler: `CaixaPageClient.tsx` (1401 linhas) + `caixaVendas.impl.ts` + `core/vendas/VendaService.ts` (fino, engana sobre onde a lógica real está) + a migration `243`/`246` (250 linhas de PL/pgSQL, a real "aggregate root") + triggers em cascata (`122`, `236`, `103`) + `shared-core/src/pdv/scan-pipeline*` (máquina de estados separada). O ponto de confusão real: **o TypeScript sugere que a lógica está em `VendaService`, mas ela está majoritariamente na stored procedure** — um novo dev que confia na pista errada perde tempo real |
| **Fluxo financeiro** | Médio-Alto | `financeiro/actions.ts` (fat action) + `financeiroTitulosServer.ts` (compartilhado admin/gerente) + triggers de espelho (`trg_finance_context_pagamento/conta`) + comissões via trigger separado — nenhuma dessas peças está documentada como "isto é o fluxo financeiro", precisa ser reconstruído por leitura de código |
| **Fluxo fiscal** | Alto | Não tem módulo — está em `estoque/importar-nfe` (entrada) + `financeiro/documento/[id]` (emissão) + Edge Function `fiscal-worker` (Deno, stack diferente) + fila no banco. Um novo dev perguntando "onde fica Fiscal?" não vai achar uma resposta única |
| **Fluxo de estoque** | Médio | RPCs razoavelmente bem nomeadas (`decrementar_estoque_seguro`, `ajustar_estoque_manual`), mas as 3 escritas diretas fora de RPC (achado da seção 1) são exatamente o tipo de coisa que só aparece depois de já ter causado um bug |
| **Fluxo de autenticação** | **Baixo** | Este é o único fluxo genuinamente fácil de entender rápido — `adminPolicy.ts` como fonte única, adapters finos, 292 testes, e a própria auditoria interna (`ADMIN_AUTH_STRUCTURAL_AUDIT.md`) documenta o fluxo passo a passo com diagrama de sequência. Deveria ser o modelo replicado para os outros quatro fluxos |

**Pontos que continuam confusos mesmo após leitura completa:**
1. Onde uma regra de negócio nova deve ser escrita — TS (`core/`), Server Action, ou migration SQL? Não há critério documentado.
2. Onde colocar lógica compartilhada entre web/desktop — qual dos 4 "shared" usar? Não há critério documentado, e o exemplo mais recente (`unifiedCartStore`) já violou a única regra escrita que existia sobre isso.
3. Por que dois painéis (`/gerente` e `/admin`) coexistem e quando um novo dev deve usar qual.

---

## 12. Comparação com arquiteturas maduras

| Referência | Prática madura | fastproduct hoje |
|---|---|---|
| **ERPNext / Odoo** | Lógica de negócio no framework (Python/ORM), banco relativamente "burro"; multi-empresa (`company_id`) como conceito de núcleo desde o primeiro commit | Lógica majoritariamente em PL/pgSQL; sem conceito de empresa acima de loja |
| **Vendure / Medusa** | Module system formal (cada domínio = módulo com service layer + schema próprios) comunicando-se via **event bus interno** (subscribers), não via import direto nem tabela compartilhada | Comunicação entre domínios via import direto entre pastas `app/gerente/*` e via tabelas Postgres lidas por múltiplos caminhos paralelos — sem barramento de eventos |
| **SAP (conceitualmente)** | Camada de autorização unificada (roles/authorization objects) com fonte única, auditada centralmente | Duas fontes de autorização (`adminPolicy.ts` + dezenas de `CREATE POLICY`), já com divergência confirmada |
| **Dynamics 365 / Business Central** | Extensibilidade via eventos de negócio publicados pelo core (business events), permitindo extensões sem tocar no núcleo | `venda_eventos` é um seed, mas sem contrato de evento tipado nem mecanismo de assinatura — extensões hoje só podem ler a tabela diretamente, acoplando-se ao schema físico |
| **Todos acima** | Testes de arquitetura (fitness functions) como parte do pipeline de CI, não só testes de comportamento | fastproduct tem só **3** testes genuinamente arquiteturais (scan de ausência de padrão), todos concentrados em auth — nenhum cobre a maioria dos achados desta auditoria (multi-authority de estoque/caixa, ports ausentes, RLS-vs-policy) |

**O que falta adotar, na ordem de impacto:** (1) module system com comunicação via evento em vez de import/tabela compartilhada; (2) `empresa_id` como conceito de núcleo, não add-on; (3) fitness functions de arquitetura no CI cobrindo os achados desta auditoria, não só auth; (4)單一 fonte de autorização (eliminar a duplicação `adminPolicy` × `CREATE POLICY` gerando a regra SQL a partir da mesma definição, ou vice-versa).

---

## 13. Auditoria de autoimposição (a arquitetura se defende sozinha?)

Esta é a pergunta que a revisão anterior não fez com peso suficiente: **não "existe um guard?", mas "um desenvolvedor novo consegue violar isso amanhã sem perceber?"**

| Boundary | Protegido por ferramenta? | Evidência | Consegue ser violado sem perceber? |
|---|---|---|---|
| RPC legada (v2/v3) não deve ser chamada em produção | **Sim** — `rpc-gate-guard.mjs`, bloqueante no CI (`Architecture Lock` step em `ci-pdv-importados.yml`, roda antes do build, `deploy` depende do sucesso) | Confirmado | Não — é pego automaticamente |
| Rota estática deve ter `page.tsx` correspondente | **Sim** — `route-guard.mjs`, mesmo gate CI | Confirmado | Não |
| `PricingService` TS não deve ser usado em runtime online | **Sim** — `pricing-rpc-guard.mjs`, análise de grafo de imports, mesmo gate CI | Confirmado | Não |
| Migrations não podem colidir em número | **Parcialmente** — `migration-sequence-guard.mjs` roda no gate, mas **já tem allowlist para colisões conhecidas** (`225`/`235`) | Confirmado | **Sim, com precedente já aberto** — a existência de um allowlist é a prova de que o guard já foi contornado pelo menos uma vez, e o mecanismo de contorno (adicionar à allowlist) está disponível para a próxima colisão também |
| Lógica de decisão de negócio fora de `/core` em componente client | **Sim, parcialmente** — `core-rule-guard.mjs`, mesmo gate CI | Confirmado, mas é baseado em grep de padrões de string, não AST — só pega os padrões já conhecidos | **Sim, para qualquer padrão novo** que o guard ainda não conheça |
| **Consistência de estrutura entre módulos (fat action vs. domínio)** | **Não** | Nenhum guard, lint ou teste verifica se um módulo novo segue o padrão de Produtos (Domain+Port+Adapter) ou o padrão dominante (Supabase direto) | **Sim, trivialmente** — é o comportamento padrão hoje, não uma exceção a ser evitada |
| **Segunda autoridade de escrita (ex.: NFe criando produto/fornecedor por RPC paralela)** | **Não** | Nenhum mecanismo liga o caminho de escrita manual ao caminho de escrita via import | **Sim** — já aconteceu duas vezes (Produto, Fornecedor) sem que nada acusasse |
| **Cliente React chamando Supabase direto (`createClient` em `'use client'`)** | **Não, de forma genérica** — só existem bans pontuais de import path específico em `no-restricted-imports`, nada que proíba `createClient` fora de Server Actions | 2 casos confirmados (`FeatureToggle.tsx`, `LoginForm.tsx`) | **Sim** — nenhum lint genérico pegaria um 3º caso amanhã |
| **`shared-core` não deve conter Supabase/toast/cart Zustand/pricing/auth** | **Não** — é regra só documental (`RECONNECT_REPLAY_POLICY.md` §0.4) | A própria regra já foi violada pelo `unifiedCartStore` sem nenhum guard acusar | **Sim** — a violação já existe e passou despercebida por ferramenta |
| **RLS (`CREATE POLICY`) deve corresponder à mesma regra de `adminPolicy.ts`** | **Não** | Nenhum teste ou script compara as duas superfícies | **Sim, já divergente hoje** (`lojas_write_gerente`) e sem nenhum caminho automático de detecção de futura divergência |
| **Todo domínio deve ter Port + Adapter (padrão hexagonal)** | **Não** | Só Produtos tem; nada exige/lembra isso para novos módulos | **Sim** — é a norma, não a exceção |
| **RLS de `produtos` deve ser escopado por loja** | **Não** — é dívida conhecida, sem trigger de alerta | Hoje "todas (autenticado)" | **Sim** — silenciosamente, até virar incidente de isolamento multi-empresa |

**Veredito de autoimposição:**

- **O que é genuinamente autoimposto e sobreviveria a um time de 20 pessoas sem disciplina:** RLS como camada de segurança (o Postgres recusa a query mesmo se o app tiver bug — é o único boundary verdadeiramente inquebrável do sistema, independente de qualquer lint), e os 5 guards que rodam no CI como gate bloqueante (RPC legada, rotas, pricing runtime, migrations — com ressalva do allowlist, e core-rule por grep).
- **O que depende inteiramente de disciplina/convenção humana, e por isso já foi violado silenciosamente pelo menos uma vez cada:** a escolha entre fat-action e domain-delegation por módulo; a existência de segunda autoridade de escrita (NFe); componente client chamando Supabase direto; a fronteira de `shared-core`; a paridade entre `adminPolicy.ts` e RLS; a exigência de Port/Adapter por domínio; o escopo de loja em RLS de catálogo.
- **Conclusão dura:** a arquitetura **não é autoimpositiva** fora de um núcleo estreito (5 guards + RLS). Todo o resto — que é a maior parte dos achados desta auditoria — depende de um desenvolvedor lembrar de uma convenção não verificada por máquina nenhuma. Isso é sustentável com 1 desenvolvedor (ou um agente disciplinado seguindo `.cursor/rules/governance.mdc`) e **não é sustentável** com "dezenas de desenvolvedores" ao longo de 10 anos, porque cada nova pessoa começa sem o contexto tácito que hoje é a única coisa segurando essas convenções.

---

## 14. Notas finais

| Categoria | Nota | Justificativa em uma frase |
|---|---|---|
| **Nota da arquitetura (geral)** | **4,0 / 10** | Multi-authority confirmada em 8 de 13 conceitos de negócio, com pelo menos uma divergência de regra de negócio já materializada (limite de caixa `5.00` duplicado) e uma de segurança (`lojas_write_gerente` sem `ADMIN`) |
| **Nota de DDD** | **3,0 / 10** | 1 módulo (Ledger) com DDD correto, 11 anêmicos ou inexistentes; nenhum Value Object de negócio além de arredondamento monetário; nenhum Domain Event tipado |
| **Nota de Clean Architecture** | **4,0 / 10** | Domain isolado corretamente onde existe (bom), mas Infrastructure/Database concentra a maior parte da regra de negócio real (violação estrutural da regra mais importante) |
| **Nota de escalabilidade** | **2,5 / 10** | Para o alvo de 100M vendas / 20M produtos / 50 mil empresas: sem modelo de tenant, sem materialização de views agregadas, com RLS de catálogo sem escopo de loja e teto de ingestão já autodeclarado abaixo do alvo por ordens de grandeza |
| **Nota de simplicidade** | **5,0 / 10** | Complexidade existente é majoritariamente acidental (migração incompleta), não essencial — mais fácil de corrigir que over-engineering, mas real e não fiscalizada |
| **Nota de manutenibilidade** | **4,5 / 10** | Um fluxo (auth) é exemplar; os outros quatro (venda, financeiro, fiscal, estoque) exigem reconstrução manual de contexto por leitura de código, sem mapa único |
| **Nota de modularidade** | **3,5 / 10** | Pastas parecem modulares; boundaries reais não são — 9 de 13 módulos têm violação confirmada de autoridade, e o padrão hexagonal existe em 1 de 12 domínios |
| **Nota de evolução futura** | **3,0 / 10** | Ausência de barramento de eventos de domínio bloqueia estruturalmente marketplace, mobile robusto, mensageria e microserviços futuros; modelo de tenant bloqueia quase tudo o resto |

**Nota consolidada desta validação final: 3,7 / 10** — deliberadamente mais dura que a revisão anterior (5,5/10), porque o objetivo explícito desta rodada era outro: não medir progresso relativo, mas testar resistência sob a lente de 10 anos e dezenas de desenvolvedores, ignorando o histórico. Sob essa lente, o sistema **não passa**.

---

## 15. Os 20 maiores riscos restantes

1. Caixa pode abrir em duplicidade (sem RPC/lock na abertura) — risco operacional direto, não só arquitetural.
2. Duas RPCs de fechamento de caixa vivas simultaneamente, uma delas órfã e ainda com `GRANT` ativo — superfície de ataque/confusão desnecessária.
3. Limite de divergência de caixa (`5.00`) duplicado e não sincronizado entre SQL e TypeScript.
4. `adminPolicy.ts` e RLS SQL decidem a mesma permissão duas vezes, com divergência já confirmada (`lojas_write_gerente` sem `ADMIN`).
5. RLS de `produtos` sem escopo de loja — bloqueador de segurança para qualquer futuro multi-empresa.
6. Produto e Fornecedor têm segunda autoridade de escrita via RPC de importação de NFe, paralela ao domínio TS.
7. Ausência de módulo de Usuários como capacidade de aplicação — gestão depende de acesso direto a Supabase Auth/SQL.
8. Fiscal sem módulo de domínio próprio, espalhado por Estoque e Financeiro.
9. Multi-authority de Pricing (4 fontes concorrentes) já documentada e não resolvida.
10. Drift de migrations produção×repositório (herdado, ainda não corrigido).
11. Modelo de tenant single-loja incompatível com o alvo de 50 mil empresas.
12. Ausência de barramento de eventos de domínio — cada nova integração tende a duplicar validação em vez de reusar.
13. `finalizar_venda_transacional_canonica_v4` como Aggregate Root de fato, implementado em PL/pgSQL de 250 linhas com 6 responsabilidades.
14. Painéis `/gerente` e `/admin` coexistindo sem prazo de corte — dobra superfície de auth/teste.
15. 4 localizações "shared" concorrentes, incluindo violação da própria regra de fronteira do `shared-core`.
16. Só 1 de 12 domínios tem Port/Adapter — hexagonal como demonstração isolada, não como padrão.
17. Enforcement automatizado cobre só 5 classes de violação (RPC legada, rotas, pricing runtime, migrations com allowlist, grep de regra de negócio) — todo o resto depende de convenção.
18. `v_kardex_unificado` acopla estoque+vendas+caixa no schema do banco, sem materialização, com risco de degradação em escala.
19. Nenhuma proteção formal contra componente `'use client'` chamando Supabase diretamente (2 casos já confirmados).
20. Governança de execução (`governance.mdc`) desenhada explicitamente para "solo dev" — incompatível, por design, com o alvo de dezenas de desenvolvedores.

---

## 16. Roadmap final

**Imediato (dias, correções operacionais, não arquiteturais — mas bloqueantes):**
Corrigir abertura de caixa sem lock (risco de duplicidade real); remover ou re-unificar as duas RPCs de fechamento de caixa; sincronizar o limite de divergência (`5.00`) numa única fonte (server, com client só exibindo o valor vindo do servidor); escopar RLS de `produtos` por loja.

**Curto prazo (semanas):** reconciliar drift de migrations (herdado); unificar a regra de permissão em uma única fonte, gerando as `CREATE POLICY` a partir da mesma definição usada por `adminPolicy.ts` (ou o inverso — mas nunca as duas mantidas manualmente em paralelo); adicionar teste arquitetural que compara as duas superfícies até a unificação acontecer.

**Médio prazo (1–3 meses):** dar a Estoque, Venda, Pagamento e Caixa os mesmos Port+Adapter que Produtos já tem, fechando a inconsistência hexagonal; criar módulo de domínio Fiscal próprio; criar módulo de Usuários; consolidar as 4 camadas "shared" em uma; adicionar lint genérico proibindo `createClient` fora de Server Actions/infra.

**Estrutural (3–8 meses):** decompor `finalizar_venda_transacional_canonica_v4` em passos nomeados testáveis; desenhar e migrar para modelo de tenant `empresa_id`; introduzir barramento de eventos de domínio como sucessor de `venda_eventos`.

**Plataforma (8+ meses):** API pública versionada; CQRS deliberado sobre o que já emergiu organicamente (`relatorio_*`); avaliar Event Sourcing parcial para Vendas, já que o log existe mas não é replayável hoje.

---

## 17. O que eu recusaria aprovar antes da produção (como released feature, não como débito aceito)

1. **Abertura de caixa sem lock/constraint de unicidade** — é bug operacional latente, não dívida arquitetural; eu bloquearia merge de qualquer feature nova em Caixa até isso ser corrigido.
2. **A RPC de fechamento de caixa órfã (`fechar_caixa_pdv_atomico`) permanecer com `GRANT` ativo** — remover o grant ou a função antes de qualquer expansão do módulo de caixa.
3. **RLS de `produtos` sem escopo de loja** — eu não aprovaria nenhum trabalho em direção a multi-empresa até isso ser fechado; é o tipo de lacuna que vira incidente de vazamento de dados entre clientes, não só "dívida técnica".
4. **Divergência confirmada entre `adminPolicy.ts` e `CREATE POLICY`** — eu não aprovaria merge de nenhuma mudança de permissão que toque só um dos dois lados sem o outro sendo atualizado no mesmo PR, até existir um mecanismo automático de sincronismo.
5. **Reivindicar "módulo de Usuários"** como entregue — não existe hoje; eu não assinaria essa capacidade como pronta para nenhum cliente que pergunte especificamente por gestão de usuários via produto.

Fora desses cinco pontos, o restante desta auditoria é dívida real e séria, mas gerenciável com o roadmap acima — não é motivo para travar o que já está em produção como PDV de loja única.
