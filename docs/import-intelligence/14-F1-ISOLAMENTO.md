# 14 — Fase 1: isolamento entre empresas

Status: **implementado e testado em ambiente local**. Nada foi aplicado em produção.
Base: decisões D1 (criação de loja), D2 (administrador de plataforma) e D3 (habilitação comercial) da autorização executiva.

## 1. O que foi implementado

Migration `backend/supabase/migrations/20261010130000_f1_isolamento_multiempresa.sql`.
Rollback em `backend/supabase/rollback/20261010130000_f1_isolamento_multiempresa.rollback.sql`.

| # | Item | Implementação |
|---|---|---|
| 1 | Sincronização `usuarios` → `usuario_vinculos` | Trigger `usuarios_sincroniza_vinculo` (AFTER INSERT / UPDATE OF perfil, loja_id, ativo) chama `m1_sincronizar_vinculo_usuario`. O backfill passa a usar a mesma função. |
| 2 | Proveniência | Coluna `usuario_vinculos.origem` (`LEGADO` \| `DIRETO`). O trigger só cria, ativa ou desativa vínculos `LEGADO`. Nunca apaga, nunca toca vínculos `DIRETO`. Conflito com vínculo `DIRETO` vira exceção (`CONFLITO_VINCULO_DIRETO`). |
| 3 | Loja com empresa obrigatória | Trigger `lojas_empresa_obrigatoria`: sem `empresa_id` → `LOJA_SEM_EMPRESA`. Sessões SQL administrativas podem informar a empresa explicitamente pela GUC `jinlong.empresa_contexto_sql`; papéis de API (`authenticator`), nunca. |
| 4 | P0 `lojas_write_gerente` | Removida. Entram `lojas_update_gestao` (UPDATE: `fp_pode_loja(id, DONO/GERENTE)` em USING **e** WITH CHECK). INSERT/DELETE/TRUNCATE revogados de `authenticated`. |
| 5 | `lojas_select_authenticated` | Removida (todo usuário autenticado lia todas as lojas). Entra `lojas_select_escopo`: lojas da própria empresa ou plataforma. |
| 6 | Titularidade | `empresa_id` imutável depois de definido (`LOJA_EMPRESA_IMUTAVEL`), inclusive para DONO e sessão SQL. Atribuir empresa a loja órfã: só procedimento sem identidade ou plataforma `PROVISIONAMENTO`. |
| 7 | Policies permissivas | Cerca de empresa: policy **RESTRICTIVE** `cerca_empresa` em 42 tabelas com `loja_id`, em `usuarios` (o próprio registro sempre visível) e em `vendas` (tenant pelo caixa). RESTRICTIVE só reduz acesso. |
| 8 | RPCs SECURITY DEFINER | Trigger `cerca_empresa_escrita` nas mesmas 44 tabelas: com identidade de usuário, a escrita fora da empresa falha (`CERCA_EMPRESA_VIOLADA`), mesmo dentro de RPC que ignora RLS. RPCs de leitura com escopo global corrigidas: `obter_estoque_disponivel_transferencia` e `relatorio_consistencia_vendas_gerente`. Helper legado `auth_usuario_gerencial_loja` (9 policies e 6 RPCs) passa a exigir a cerca. |
| 9 | ADMIN legado | O ramo de compatibilidade de `fp_pode_loja` e da cerca vale só para a empresa legada (antes: qualquer loja de qualquer empresa). |
| 10 | Plataforma (D2) | `plataforma_admins` ganha `capacidades` (`PROVISIONAMENTO`, `COMERCIAL`). A escrita é feita só por `ops_definir_plataforma_admin` (service_role, **sem** identidade de usuário) com histórico append-only. Um trigger bloqueia qualquer outra escrita, inclusive direta por service_role. A tabela continua vazia. |
| 11 | Provisionamento (D1) | Duas RPCs. `plataforma_provisionar_loja(empresa, nome, código)` exige empresa explícita e ativa, é idempotente por código, recusa código de outra empresa e é auditada (`plataforma_auditoria`). `plataforma_criar_empresa` fica bloqueada pela trava de segunda empresa. |
| 12 | Habilitação comercial (D3) | Há dois caminhos. `plataforma_definir_modulo_empresa` é usada pela plataforma com capacidade `COMERCIAL`; o responsável é `auth.uid()`. `ops_definir_modulo_empresa` é o procedimento operacional, exige responsável e não aceita identidade de usuário. Registra cliente, módulo, autorização comercial, responsável, data, motivo, vigência e histórico imutável. `fp_modulo_ativo` respeita a vigência. |
| 13 | Contexto do módulo | `fp_empresa_contexto_modulo(módulo, papéis, empresa?)` deriva a empresa da sessão. Uma empresa informada é validada. Com várias empresas elegíveis e nenhuma informada, o resultado é ambíguo e o acesso é negado. |
| 13b | Views definer | `produtos_custos` (security definer, porque `preco_custo` tem SELECT revogado) passa a filtrar pela cerca; antes, o ADMIN legado lia o custo de qualquer loja. `v_top_produtos`, `v_vendas_dia` e `v_venda_consistencia_anomalias` agregavam vendas de **todas** as lojas para qualquer autenticado, inclusive OPERADOR, e não têm uso no app; passam a `security_invoker`, ou seja, respeitam RLS e cerca. |
| 14 | Trava de 2ª empresa | `multiempresa_controle.segunda_empresa_liberada = false`. O produto não cria uma segunda empresa enquanto houver tabelas compartilhadas (§6). |

Aplicação (`pdv-importados`):

| Arquivo | Mudança |
|---|---|
| `app/admin/provisionamento/actions.ts` | Gate `fp_plataforma_pode('PROVISIONAMENTO')` com a sessão do usuário, no lugar de `perfil === 'ADMIN'`. `empresaId` obrigatório. A loja é criada pela RPC `plataforma_provisionar_loja` (o banco valida); antes era um insert com service_role sem empresa. |
| `app/admin/provisionamento/page.tsx`, `ProvisionamentoWizardClient.tsx` | Mesmo gate. Seleção explícita da empresa, sem pré-seleção. |
| `app/gerente/configuracoes/actions.ts` | O ramo de criação de loja foi removido. A tela só edita a loja existente. |
| `lib/modulos/requireModulo.ts` | Gate de servidor que nega por padrão. É o pré-requisito de qualquer rota do Import Intelligence. |
| `src/lib/i18n/{pt,zh}.json` | Textos novos do provisionamento. |

As server actions de funcionários (`admin/funcionarios/actions.ts`) usam service_role, mas tiram a loja da sessão e nunca do cliente. Por isso não mudaram: o trigger de sincronização cobre as gravações delas.

## 2. Evidência do P0 em `lojas`

O mesmo script foi rodado (`probe-lojas`) nos bancos local M1 (antes) e F1 (depois). Um GERENTE da empresa A tenta alterar a loja da empresa B:

| Banco | Linhas alteradas em B | B visível para o GERENTE de A |
|---|---|---|
| M1 (antes da F1) | **1** | **sim** |
| F1 | 0 | não |

O mesmo vale para RPC SECURITY DEFINER (`probe-c4`). O DONO da empresa A chamou `ajustar_estoque_manual_seguro` sobre o estoque da empresa B:
- M1: executou (DONO é global no legado, "Padrão A");
- F1: `CERCA_EMPRESA_VIOLADA: estoque fora da empresa do usuário`.

Autenticação real (GoTrue + PostgREST, `supabase start`), smoke `backend/scripts/f1-rls-rest-smoke.mjs`: **32/32 OK**. Destaques:
- L3: GERENTE de A faz PATCH em B1 → nenhuma linha (antes, `lojas_write_gerente` permitia);
- L6: troca de `empresa_id` → 42501;
- L7: POST em lojas por DONO → negado;
- L9: loja sem empresa → recusada até para service_role;
- C1–C8: produtos, estoque, usuários e RPCs de B → negados para A; os próprios dados de A seguem acessíveis;
- P1–P6: sem autopromoção; a segunda empresa fica bloqueada; o provisionamento exige plataforma;
- M1–M8: o módulo nasce desabilitado; só a capacidade COMERCIAL habilita; empresa forjada e GERENTE são negados; anon é negado.

## 3. Testes executados

| Teste | Ambiente | Resultado |
|---|---|---|
| `f1-isolamento-multiempresa.test.sql` (novo) | container PG 17 (`jl_f1`) e Supabase local real | 35 checks OK nos dois |
| `m1-multiempresa.test.sql` (atualizado) | os dois | 29 checks OK nos dois |
| `c1-secdef-sem-identidade.test.sql` (guard de classe) | os dois | OK: todas as funções novas executáveis por `authenticated` checam identidade |
| `f1-rls-rest-smoke.mjs` (novo) | Supabase local, JWT real | 32/32 OK |
| Regressão: 45 scripts `backend/scripts/*.test.sql` | cópia `jl_f1_reg` | 33 PASS / 12 FAIL. As 12 falhas são **idênticas, com a mesma mensagem**, às do baseline anterior à M1 (`diff` vazio). Nenhuma falha nova. |
| Rollback | cópia `jl_f1_rb` | `pg_dump --schema-only` idêntico ao estado M1. Só diferem as 2 linhas de token aleatório `\restrict` do pg_dump. |
| Vitest `lib/modulos/requireModulo.test.ts` (novo) | — | 8/8 |
| Vitest do provisionamento | — | 5/5 |
| Vitest completo (pdv-importados) | — | 369 arquivos passam, 2 skipped; 2 falhas **ambientais**, ambas comprovadas. `productUpdater.semRpc.integracao` só roda porque o Supabase local estava de pé e usava a chave fictícia da ausência de env; com a chave local real passa 2/2, contra o banco já com a F1. `dashboard/page.paginacao` estourou timeout sob carga e passa isolado (2/2). Nenhum dos dois toca arquivo alterado. |
| Reaplicação da migration | cópia | idempotente |
| `tsc --noEmit` (pdv-importados) | — | limpo |
| ESLint nos arquivos alterados | — | limpo |
| Guardrails | — | todos OK: migration-sequence, rpc-gate, core-rule, domain-boundary, pricing-rpc, no-prod-target, boundary-ratchet, design, route |

O teste da M1 mudou em três expectativas, todas por decisão da F1:
1. Uma loja órfã só existe com o trigger desligado dentro da transação. Isso simula um dado anterior à F1.
2. O ADMIN legado não alcança mais a loja de outra empresa, só a da empresa legada.
3. `ops_definir_modulo_empresa` passou a exigir responsável (D3).

Além disso, as fixtures limpam a identidade simulada antes de gravar (a cerca vale para qualquer `auth.uid()`) e geram `auth.users.id`, que não tem default no GoTrue real.

## 4. Impacto no primeiro cliente

O cliente atual tem uma única empresa: a legada, com todas as lojas e usuários. A cerca é RESTRICTIVE e o cliente já está inteiro dentro dela. Por isso leitura, venda, estoque, financeiro e relatórios **não mudam** (teste E1 e regressão). As mudanças de comportamento são intencionais:

| Mudança | Quem sente | Decisão |
|---|---|---|
| GERENTE só edita os dados cadastrais da própria loja (antes: qualquer loja) | GERENTE | P0 / plano |
| Ninguém cria loja pela tela de configurações | GERENTE, DONO | D1 |
| O provisionamento exige administrador de plataforma cadastrado. **Hoje não há nenhum.** | equipe FastProduct | D2: designação posterior por procedimento (runbook doc 15) |
| ADMIN legado restrito à empresa legada | nenhum enquanto houver uma empresa | F1 |
| Usuário inativo ou com loja inexistente não passa pela cerca | contas inativas ou inconsistentes | fail closed |

Antes de qualquer aplicação em produção, rode as consultas somente leitura do doc 15 §1:
- divergências legado × vínculos;
- exceções do backfill;
- lojas sem empresa.

Uma conta legítima que caia em exceção perderia o acesso.

## 5. Desempenho

A cerca de leitura usa `loja_id = ANY ((SELECT fp_lojas_cerca())::uuid[])`. O planner avalia o array uma vez por consulta (initplan), não por linha.

O trigger de escrita faz uma consulta por linha gravada com identidade, o que custa algo em escritas em lote (itens de venda e estoque). A regressão de concorrência e vendas passou, mas **não houve medição com volume real**. Fica como pendência antes de produção (§6).

## 6. Riscos residuais

O que ainda **não** está cercado:
- Tabelas globais por desenho: `configuracoes_gerais`, `relatorio_settings`, `pricing_config_versions`, `categorias`, `marcas`, `categorias_financeiras`, `feature_flags`. Hoje são compartilhadas por todas as empresas.
- Tabelas-filhas sem `loja_id`: `itens_venda`, `vendas_pagamentos`, `movimentacoes_caixa`, `movimentos_caixa`, `caixas_fechamento_formas`, `importacoes_nfe_itens`, `importacoes_nfe_duplicatas`, `ordens_compra_itens`, `remessa_itens`, `regras_preco`, `historico_*`, `devolucoes`, `descontos_venda`, `documentos_fiscais_*` e outras. As escritas que começam pela tabela-pai já passam pela cerca. Leituras diretas seguem as policies legadas, que tratam DONO e ADMIN como globais.
- Linhas com `loja_id NULL`, compartilhadas por desenho (ex.: `precos_atacado` globais).
- `pdv_diagnostico_pre_producao` (metadados de schema) e storage (buckets por caminho de loja), sem revisão nesta fase.

**Mitigação:** com uma única empresa no banco, nenhum desses pontos expõe dado de outro cliente. A trava `segunda_empresa_liberada = false` impede que o produto crie a segunda empresa. Liberar a trava exige uma nova migration, depois de cercar os pontos acima (ESPEC etapas 5+).

## 7. Gate F1

| Pergunta | Resposta |
|---|---|
| Uma operação entre empresas A e B é autorizada indevidamente nas superfícies cercadas (lojas, 44 tabelas, RPCs de escrita, RPCs de leitura revisadas, módulo, plataforma)? | **Não**: SQL (35 checks), REST com JWT real (32/32) |
| Os comportamentos legítimos do cliente atual estão preservados? | **Sim**: E1, regressão idêntica, smoke L5/C4 |
| **GO** para operar o cliente atual e habilitar o módulo para ele (uma empresa)? | **Sim**, com as pendências de produção do doc 15 |
| **GO** para cadastrar um segundo cliente no ERP? | **Não**: §6. Bloqueado no banco pela trava. |
