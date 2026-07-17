# Database Integrity Gate — Auditoria de Integridade do Banco (pré-Fase 6)

**Data:** 2026-07-17
**Escopo:** `backend/supabase/migrations/` (200 arquivos), documentos de auditoria históricos do repositório, código de aplicação (`pdv-importados`, `pdv-local`, `backend/supabase/functions`).
**Solicitante:** gate obrigatório antes de iniciar a Fase 6 (Fiscal/Focus NFe).
**Metodologia:** auditoria estática (leitura de migrations, grep exaustivo, cruzamento com documentos de auditoria anteriores). **Nenhuma execução contra um banco Postgres real foi realizada nesta sessão** — não há instância Postgres/Supabase disponível neste ambiente. Essa é uma limitação declarada, não omitida: todas as conclusões abaixo são baseadas em análise de conteúdo de arquivo, não em verificação empírica de estado de banco.

---

## 1. Objetivo e escopo

Este relatório responde, item a item, às seis obrigações definidas pelo usuário antes de autorizar o início da Fase 6:

1. Validar todos os drifts conhecidos das Fases 2–5 (ainda existe? corrigido? apenas documentado? migration correspondente? risco para instalação nova?).
2. Inventariar migrations por categoria (existentes, só-produção, captura, corretivas, reconciliação) e suas dependências/conflitos de ordem.
3. Responder objetivamente se um ambiente vazio chega ao estado atual rodando apenas as migrations do repositório.
4. Reauditar o Single Source of Truth do banco (funções duplicadas, views antigas, triggers órfãs, grants inconsistentes, policies duplicadas, RPCs obsoletas, índices redundantes, objetos manuais).
5. Classificar o estado do banco com uma única conclusão objetiva.
6. Aplicar o gate: a Fase 6 não deve começar enquanto existir drift estrutural que afete vendas, clientes, financeiro, estoque, permissões ou auditoria.

---

## 2. Validação de drifts conhecidos (Fases 2–5)

Baseado em `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`, `CONCLUSOES_AUDITORIA_FINAL.md`, `docs/MULTI_AUTHORITY_ARCHITECTURE_AUDIT.md`, `docs/RLS_POLICY_DIAGNOSTIC.md`, `docs/BACKLOG_TECNICO.md`, `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`, `pdv-importados/app/caixa/TODO_auditoria_255.md`, `docs/FASE_5_ACCEPTANCE.md` e `docs/regras-negocio/*.md`.

| # | Drift | Ainda existe? | Migration correspondente | Risco p/ instalação nova |
|---|---|---|---|---|
| 1 | Versionamento de migrations divergente prod × repo (raiz de todo o resto) | **PARCIALMENTE** — colisões de número resolvidas por renumeração (225→251, 235→252, 245→253, 250→254); mas paridade prod↔repo nunca verificada mecanicamente (`db diff` nunca rodou, CI quebrado) | Nenhuma migration resolve isso — é um problema de processo/CI, não de schema | **ALTO** — nenhuma garantia de que `db reset` produz o mesmo schema que produção |
| 2 | `descontos_venda` sem `operador_id`/`aplicado_em` em produção | Corrigido **no repositório** (migration 113); aplicação em produção real **não reverificada** | `113_descontos_venda_auditoria_operador.sql` | Baixo para instalação nova (migration existe e é idempotente) |
| 3 | Fiado removido em produção, ainda referenciado na app | **Corrigido** — `FIADO` só resta como rótulo de exibição para vendas históricas; `contas_receber` hoje é alimentado pelo fluxo de crediário/parcial, não mais por fiado | `246_remover_venda_fiado.sql` + backport `20260620222629_245_remover_venda_fiado.sql` | Baixo |
| 4 | `system_alerts` ausente em produção | **INCERTO** — migration existe e evoluiu (236→237), mas aplicação real em produção nunca reverificada | `236_system_alerts_log_leve.sql`, `237_system_alerts_remove_triggers.sql` | Baixo para instalação nova; médio para paridade com produção |
| 5 | `venda_finance_context` ausente em produção | **INCERTO** — migration renumerada (235→252) e integrada a fluxos v4 mais recentes; aplicação em produção nunca reverificada | `252_venda_finance_context_mirror.sql` | Baixo para instalação nova |
| 6 | `vendas.cliente_id` sem migration correspondente (v4 já lia/gravava a coluna) | **Corrigido no repositório**, mas **NÃO VALIDADO contra produção** — é o achado de maior risco desta auditoria (ver §2.1) | `276_vendas_cliente_id_drift_fix.sql` (`ADD COLUMN IF NOT EXISTS`, idempotente) | **ALTO** — se a coluna nunca existiu em produção antes desta migration, toda venda com cliente desde a Fase 5b pode ter falhado silenciosamente |
| 7 | `vendas_em_espera.cliente_id` órfão (persistido, nunca consumido) | Corrigido no repositório; não validado em banco real | `270_vendas_em_espera_rls_integridade_cliente.sql` | Baixo |
| 8 | Campo `rotulo` órfão em `vendas_em_espera` | Corrigido (mitigado na aplicação; coluna órfã aceita como dívida sem impacto) | Nenhuma (decisão deliberada de não remover) | Nenhum |
| 9 | RLS de `vendas_em_espera` aberta demais (sem escopo de loja, sem `WITH CHECK`, sem unicidade) | Corrigido no repositório; não validado em banco real | `270_vendas_em_espera_rls_integridade_cliente.sql`, `271_vendas_em_espera_ledger_eventos.sql` | Baixo (repo), médio (produção não confirmada) |
| 10 | RPCs legadas v2/v3 de finalização de venda | **Corrigido** — v2/v3 bloqueadas com `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'`; overload duplo da própria v4 também resolvido | `20260619234314_...`, `20260620004913_...`, `20260620020436_...`, `268_reconcile_finalizar_venda_v4_single_overload.sql` | Baixo |
| 11 | Lacunas RLS documentadas (`vendas_insert_loja` permissivo, `itens_venda` permissivo, catálogo sem isolamento por loja, views sem teste de escopo, RPCs críticas sem gate de CI) | **APENAS DOCUMENTADO** — nenhuma correção localizada | Nenhuma | **ALTO** — RLS é a última linha de defesa; segue como estava no diagnóstico original |
| 12 | RLS trata ADMIN inconsistentemente vs. GERENTE/DONO (4 policies) | **Corrigido**, com verificação contra produção confirmada (caso raro) | `251_rls_admin_alinha_painel_gerente.sql` | Nenhum |
| 13 | Guard de CI ausente para `cancelar_venda_transacional`/`devolver_ou_trocar_venda` | Corrigido no código do guard; **não confirmado em CI real** (CI quebrado desde antes da Fase 5) | `scripts/rpc-gate-guard.mjs` (extensão desta sessão) | Médio — proteção só vale se o CI rodar |
| 14 | Multi-authority no domínio Caixa (`vendas_suspensas` só client-side, sem espelho server) | **APENAS DOCUMENTADO — ainda existe** | Nenhuma (é gap de camada de aplicação, não de schema) | Alto para integridade operacional, não é drift de schema em si |
| 15 | Multi-authority em validação de venda (Zod web / outbox / sync-outbox triplicados, arredondamento divergente) | **APENAS DOCUMENTADO — não corrigido** | Nenhuma | Médio |
| 16 | `docs/venda-golden-flow.md` não documenta atomicidade diferente Web (atômico) vs. Local (não atômico) | **APENAS DOCUMENTADO — pendência confirmada em aberto pela própria Fase 5** | Nenhuma (é gap de documentação) | Baixo (documentação, não schema) |
| 17 | BA-012 — baixa de estoque não atômica no PDV Local | **APENAS DOCUMENTADO — dívida aceita, sem correção** | Nenhuma | Médio (canal offline) |
| 18 | Preço atacado — motor duplicado Web vs. Local | **Corrigido e validado com dados reais de produção** (PR #182); CI verde e teste HMAC em device seguem pendentes | Migrations da série de preço (034, 077, etc.) | Baixo |
| 19 | Kardex avançado / arredondamento heterogêneo / devolução fora do cancelamento | Devolução: **corrigido** (`248_devolver_ou_trocar_venda.sql`). Kardex avançado e arredondamento: **apenas documentado** | `248_devolver_ou_trocar_venda.sql` | Baixo (devolução), médio (kardex/arredondamento, backlog) |
| 20 | `guard:core` — regra de negócio embutida na UI | **INCERTO** — sinal contraditório entre `CORRECOES_ESTABILIZACAO.md` (relata dívida) e `FASE_5_VENDAS_AUDITORIA_E_PLANO.md` (relata guard OK) | N/A | Baixo — não é drift de schema |

### 2.1 Achado de maior risco: `vendas.cliente_id` (drift #6)

Este é o item citado explicitamente pelos próprios documentos da Fase 5 como risco de prioridade alta ainda **não investigado**: `docs/FASE_5_ACCEPTANCE.md` (seção 11, risco #2) registra textualmente que a hipótese "a coluna já existia em produção como drift" vs. "a coluna nunca existiu, causando falha silenciosa em toda venda com cliente e saldo pendente desde a Fase 5b" **não foi verificada contra um banco real**. A migration `276_vendas_cliente_id_drift_fix.sql` usa `ADD COLUMN IF NOT EXISTS`, o que é seguro nos dois cenários, mas não esclarece qual cenário de fato ocorreu — e se o segundo cenário for verdadeiro, há um período de produção com perda silenciosa de dado de cliente em vendas a crédito.

### 2.2 Achados adicionais específicos da Fase 5 (não presentes em fases anteriores)

- **Kits de produto**: modelagem (`275_kits_modelagem.sql`) criada, mas `venda_kit_expansao` existe como tabela **sem escritor** — dívida deliberada e documentada, não drift silencioso.
- **`autorizar_operacao_privilegiada` consome token antes do fim da transação** — comportamento sutil sem teste de integração dedicado (risco #4 de `docs/FASE_5_ACCEPTANCE.md`).
- **Migration 272 remove assinaturas antigas de `cancelar_venda_transacional`/`devolver_ou_trocar_venda`** sem confirmação de que nenhum caller de produção real ainda as usa — item de checklist não marcado.
- **Nenhuma das 7 migrations 270–276 (toda a Fase 5) foi aplicada a um banco real** — todos os itens "corrigidos no repositório" desta tabela carregam esse risco-guarda-chuva: a correção existe como SQL revisado manualmente, mas nunca executado contra Postgres real.

---

## 3. Inventário de migrations por categoria

**Total: 200 arquivos** — 189 numerados (`001`…`24703`) + 11 com prefixo timestamp (`2026...`).

### 3.1 Migrations existentes (visão geral)
Sequência numérica de `001_schema_inicial.sql` a `276_vendas_cliente_id_drift_fix.sql`, com gaps de numeração em `120–121`, `128–204` (consumido pelo bloco timestamp + hiato deliberado), `247` (desdobrado em `24701/24702/24703`), `257`, `259–267`. `node scripts/migration-sequence-guard.mjs` confirma **zero colisões ativas** — as 4 colisões históricas (225/235/245/250) foram resolvidas por renumeração para 251/252/253/254.

### 3.2 Migrations aplicadas apenas em produção (segundo `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`, 2026-06-20)
Em 2026-06-20, produção tinha 172 migrations (144 numéricas + 28 timestamp) contra 170 arquivos no repositório — produção já estava "à frente". As migrations então só-produção (`245_remover_venda_fiado`, `243_finalizar_venda_v4_sync_producao`, `244_consistencia_vendas_auditoria`, `264_dashboard_venda_eventos_kpis`, blocos de bloqueio v2/v3) foram **backportadas** para o repositório como os 9 arquivos timestamp de captura (2026-06-18 a 2026-06-20). Não há confirmação recente de que essa lista está completa — a auditoria original é de 2026-06-20 e nunca foi refeita contra o estado atual de produção.

### 3.3 Migrations de captura ("capture"/snapshot de estado já aplicado)
`241_relatorio_margem_por_venda_snapshot_only.sql`, `243_finalizar_venda_canonica_v4_captura.sql`, e os 9 arquivos timestamp (2026-06-18 a 2026-06-20) — todos se autodeclaram no conteúdo como "migration aplicada diretamente no DB em [data]".

### 3.4 Migrations corretivas
`038_fix_...`, `063_ajuste_manual_estoque_kardex.sql`, `101_fix_dashboard_atividades_limit.sql`, `117_fix_oc_rls_usuarios_pattern.sql`, `118_fix_vendas_pagamentos_concurrency.sql`, `126_ajuste_triggers_when_update.sql`, `20260419013345_fix_venda_idempotency_key.sql`, `20260618011821_113_rls_audit_fixes.sql`, `20260619174508_fix_finalizar_venda_v2_stub_quebrado.sql`, `216_fix_marcas_drift_ativo_rls_usuarios.sql`, `276_vendas_cliente_id_drift_fix.sql`.

### 3.5 Migrations de reconciliação/drift
`056_enable_rls_vendas_pagamentos_reconcile.sql`, `212–214_restaura_*.sql` (restauração de drifts de `movimentos_caixa`, `configuracoes_gerais`, `comissoes`), `213_restaura_configuracoes_gerais_drift.sql`, `268_reconcile_finalizar_venda_v4_single_overload.sql`, `276_vendas_cliente_id_drift_fix.sql`.

### 3.6 Dependências e conflitos de ordem — o achado estrutural mais importante

O Supabase CLI ordena as 200 migrations **lexicograficamente pelo nome completo do arquivo**. Isso produz uma ordem de execução real muito diferente da ordem cronológica/de dependência pretendida:

1. **Posições 1–125**: `001` → `127` (sequência numérica normal).
2. **Posições 126–136 (11 arquivos)**: **todo o bloco timestamp `2026...`** roda aqui — entre a migration 127 e a 205 — porque `"127_..." < "20260419..." < "205_..."` como comparação de string. Essas migrations foram na verdade aplicadas em produção em 18–20 de junho de 2026, ou seja, **depois** de boa parte de 205–276 ter sido planejada/escrita.
3. **Posições 137–200**: `205` → `276`, com `24701/24702/24703` intercalados entre `246` e `248` (`"24701" < "248"` lexicograficamente).

**Consequência prática confirmada por evidência textual**: pelo menos 4 dos 9 arquivos timestamp contêm comentários "GUARD (2026-07-03)" onde o próprio time documenta que teve de **reescrever manualmente** o conteúdo original para tolerar rodar fora de ordem (ex.: `20260618011922_114_pdv_config_loja_backfill.sql` pula um backfill de `pdv_config.loja_id` porque, na posição real de execução, a migration 209 que cria essa coluna ainda não rodou; `20260618161315_264_...` tem o mesmo problema com `venda_eventos`, criada só na migration 228, que roda depois na sequência real).

**Colisões de conteúdo com o mesmo número** (não apenas nome, conteúdo materialmente diferente): `113` (repo: adiciona `operador_id`/`aplicado_em`; timestamp: liga RLS em 4 tabelas), `114` (repo: fiscal enqueue; timestamp: backfill de `loja_id`), `244`/`245` (nomes de sufixo idênticos, propósitos e defaults divergentes — `253_clientes_tipo_endereco_e_view_gerente.sql` documenta explicitamente essa colisão em seu cabeçalho).

---

## 4. Um ambiente vazio consegue chegar ao estado atual rodando apenas as migrations do repositório?

### Resposta objetiva: **SIM, com ressalva importante.**

Um `supabase db reset`/replay completo **termina sem erro de SQL** — confirmado pelos comentários "GUARD" nos 9 arquivos timestamp, que foram deliberadamente reescritos para tolerar a ordem de execução fora de sequência (checagens condicionais de existência de coluna/tabela antes de operar sobre elas).

**Porém, "termina sem erro" ≠ "produz o mesmo schema que produção".** Isso é reconhecido formalmente pelo próprio time em três documentos independentes:
- `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` — identifica a divergência de numeração como o "achado-raiz" (P0).
- `docs/GOVERNANCA_PMO_JINLONG.md` — confirma `system_alerts` ausente em produção como consequência direta.
- `docs/PLANO_EXECUTIVO_EXECUCAO_JINLONG.md` (2026-07-08, o mais recente) — descreve essa dívida como *"a raiz do grafo de dependências: nada que toque banco é seguro antes disto"* e cita a tarefa pendente `S1.6`: "Conferir que os backports timestamp já existentes batem com o conteúdo de produção" — **nunca executada**.

Nenhuma migration que impede o bootstrap foi encontrada (zero erros de SQL esperados em `db reset`). O que falta é a **prova de equivalência** entre o schema resultante desse bootstrap e o schema real de produção — essa prova exige rodar `supabase db diff` contra um banco de produção real, o que não foi feito (nem nesta sessão, nem em nenhum momento documentado).

---

## 5. Reauditoria de Single Source of Truth do banco

### 5.1 Funções duplicadas/obsoletas

**Achado real — RPC legada órfã, tratamento assimétrico:** `public.finalizar_venda_transacional` (sem sufixo `_canonica_vN`, criada em `020`, redefinida em `023`, `113`, `122`) **nunca recebeu um stub `LEGACY_DISABLED`**, ao contrário de `_canonica_v2` (bloqueada com `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'`) e `_canonica_v3` (idem). Verificação direta confirma:
- Última definição em `122_limite_desconto_manual_itens.sql:122-301`, com `GRANT EXECUTE ... TO authenticated` e `TO service_role` mantidos, **sem nenhum `DROP FUNCTION` posterior** em toda a sequência até `276`.
- O único caller ativo no código é `finalizar_venda_transacional_canonica_v4` (`pdv-importados/app/caixa/server/caixaVendas.impl.ts`); os únicos usos textuais de `finalizar_venda_transacional` (sem `_v4`) restantes no repositório são documentação histórica (`IMPLEMENTACAO_CONSISTENCIA_VENDAS.md`, `VENDA_CONSISTENCY_ANALYSIS.md`), não código executável.
- **Risco real**: a RPC legada continua **executável por qualquer usuário `authenticated`**, sem as validações incorporadas desde então (token de gerente v2+, revalidação de preço v3, automação de contas_receber v4). Um cliente autenticado com credenciais válidas de operador poderia, em teoria, chamar essa RPC diretamente via PostgREST, contornando toda a evolução de hardening posterior.

**Verificado e sem problema** (evolução linear/documentada): `decrementar_estoque_idempotente` (delega para `decrementar_estoque_seguro` desde a migration 070, com comentário explicando o motivo); `fechar_caixa_atomico` vs. `fechar_caixa_pdv_atomico` (propósitos distintos documentados — web vs. sync-outbox); famílias `registrar_movimentacao`/`aprovar_movimentacao`/`estornar_movimentacao`/`cancelar_movimentacao` (ciclo de vida distinto, não duplicatas). Nenhuma função com sufixo `_old`/`_bak`/`_backup`/`_deprecated`/`_temp`/`_test` foi encontrada.

### 5.2 Views antigas

**Achado real #1 — views órfãs nunca dropadas:** `v_vendas_dia` e `v_top_produtos` (criadas em `001_schema_inicial.sql`) foram superadas por RPCs mais completas (`relatorio_vendas_por_dia_periodo`, `relatorio_top_produtos_periodo`) mas nunca receberam `DROP VIEW`. Único uso restante é o arquivo gerado `database.types.ts` (typegen automático).

**Achado real #2 — risco de RLS bypass nas views órfãs (mais grave):** o próprio repositório documenta em `040_v_estoque_baixo_security_invoker.sql` que views sem `security_invoker = true` "rodam com privilégios do dono, podendo contornar RLS das tabelas base" — e corrigiu isso para `v_estoque_baixo`. **`v_vendas_dia` e `v_top_produtos` nunca receberam essa correção.** `v_venda_consistencia_anomalias` (`244_consistencia_vendas_auditoria.sql`) também está sem `security_invoker` e sem `REVOKE`/`GRANT` explícito — ao contrário de `v_fiscal_doc_status_event_mismatch`, `v_clientes_gerente` e `v_kardex_unificado`, que têm o padrão correto.

### 5.3 Triggers órfãs

**Nenhum problema encontrado.** 33 `CREATE TRIGGER` verificados; todas as 20 funções-alvo existem e não foram dropadas; todos os pares `DROP TRIGGER`/`CREATE TRIGGER` são consistentes. Caso notável (`237_system_alerts_remove_triggers.sql`) remove trigger e função **juntos** — remoção limpa, sem órfão.

### 5.4 Grants inconsistentes

**Achado real:** 15 de 112 funções não-trigger **nunca receberam `REVOKE ALL FROM PUBLIC`** — permanecem chamáveis por qualquer role por padrão do Postgres (`relatorio_vendas_por_dia_periodo`, `relatorio_top_produtos_periodo`, `relatorio_curva_abc_periodo`, `list_produtos_gerente_filtrados`, `resumo_comissoes_por_operador`, `detalhe_comissoes_operador`, entre outras). Severidade atenuada pelas que são `SECURITY INVOKER` confirmadas (RLS da tabela base ainda protege), mas é inconsistente com o padrão de defesa em profundidade usado nas ~80 outras funções do repositório, e nem todas as 15 tiveram `SECURITY DEFINER`/`INVOKER` confirmado.

### 5.5 Policies duplicadas / policies fantasma

**Achado real — 11 policies de segurança sem definição versionada em lugar nenhum do repositório:** `224_rls_initplan_wrap_auth_select.sql` (gerado a partir de snapshot de produção em 2026-06-02) contém 11 blocos `DO $$ ... GUARD ...` para policies que **não existem em nenhum `CREATE POLICY` de nenhuma migration**: `clientes_loja_isolado`, `contas_receber_loja_isolado`, `doc_fiscal_loja_isolado`, `liquidacoes_loja_isolado`, `perfis_select_policy`, `perfis_insert_policy`, `perfis_update_policy`, `perfis_delete_policy`, `transferencias_idempotencia_select_gerente`, `transferencias_idempotencia_insert_gerente`, `transferencias_idempotencia_delete_gerente`. O próprio comentário do arquivo confirma: "drift real: existia em `pg_policies` no remoto quando este snapshot foi gerado... mas nunca foi capturada como migration". **Isso significa que RLS de isolamento por loja em `clientes`, `contas_receber`, documentos fiscais, `liquidacoes` e perfis de usuário não tem definição versionada — um `db reset` do zero não recria essas policies.**

Fora isso, 157 `CREATE POLICY` em 55 tabelas seguem o padrão correto `DROP POLICY IF EXISTS` antes de recriar — nenhuma duplicação real encontrada nas tabelas mais policiadas (`vendas`, `estoque`, `descontos_venda`, `usuarios`, `caixas`, `movimentos_caixa`).

### 5.6 RPCs obsoletas

Ver §5.1 (`finalizar_venda_transacional` legada). v2/v3 estão corretamente bloqueadas com `RAISE EXCEPTION`.

### 5.7 Índices redundantes

- **`produtos(categoria_id)`**: dois índices idênticos ativos, `idx_produtos_categoria` (migration 001) e `idx_produtos_categoria_id` (migration 085) — nenhum `DROP INDEX` do primeiro encontrado.
- **`contas_receber(venda_id)`**: `idx_contas_receber_venda_id` (índice simples, migration 223) tornou-se redundante após `contas_receber_venda_id_unique` (índice único parcial, migration 24701) — o índice antigo não foi removido.
- Demais casos analisados (`marcas`, `configuracoes_gerais`, `comissoes_vendedores`, `contas_pagar`, `devolucoes`, `vendas_em_espera`, `orcamentos`, `authorization_challenges`, `kit_composicoes`) são recriações defensivas com `IF NOT EXISTS`/mesmo nome (no-op) ou índices com propósitos distintos — sem redundância real.
- **Lacuna, não redundância:** nenhum índice explícito para `itens_venda` foi encontrado fora de PK/FK implícitos.

### 5.8 Objetos criados manualmente

Não há evidência direta de objetos criados manualmente fora de migration nesta auditoria estática (não há acesso a `pg_catalog` real). O indício mais forte é indireto: as 11 policies "fantasma" do §5.5 e os drifts de coluna do §2 (itens 4, 5, 6) são consistentes com alterações manuais em produção que nunca viraram migration — mas isso não pode ser confirmado sem acesso ao banco real.

---

## 6. Classificação final

## 🟡 Banco reconciliado com ressalvas

### Justificativa

**Por que não é 🔴 (divergências bloqueantes):**
- Não há evidência de erro de SQL no bootstrap — `db reset` completa (com os patches GUARD já aplicados).
- Zero colisões de numeração ativas (`migration-sequence-guard.mjs` confirma allowlist vazio).
- Nenhuma RPC chamada pelo código está ausente do repositório (61 RPCs verificadas, todas presentes).
- A maioria dos drifts históricos documentados (Fases 2–4) tem migration correspondente e classificação "corrigido".
- Achados de SSoT (§5) são reais, mas localizados e não sistêmicos: 1 RPC legada órfã, 2 views órfãs, 15 funções sem `REVOKE PUBLIC`, 11 policies fantasma, 2 pares de índice redundante — nenhum invalida a arquitetura golden-flow em si (o caller único da v4 está corretamente protegido).

**Por que não é 🟢 (banco reconciliado, sem ressalvas):**
- A prova de equivalência prod↔repo (`supabase db diff` vazio) **nunca foi executada** — é uma tarefa formalmente pendente desde 2026-06-20, reafirmada em 2026-07-08, e ainda não feita hoje (2026-07-17).
- O drift de maior risco (`vendas.cliente_id`, §2.1) tem cenário de "falha silenciosa em produção" não descartado.
- Nenhuma das 7 migrations da Fase 5 (270–276) foi validada contra um banco real.
- 11 policies de RLS de isolamento por loja (incluindo `clientes`, `contas_receber`, documentos fiscais e perfis de usuário) não têm definição versionada em nenhuma migration.
- Uma RPC de finalização de venda legada, sem os hardenings de v2/v3/v4, permanece executável por qualquer usuário autenticado.
- O CI está quebrado (falha em ~2-3s em todo job desde antes da Fase 5), então nenhum guard automático (RPC gate, migration sequence, RLS) roda de forma independente hoje — toda verificação depende de execução manual local.

---

## 7. Gate para a Fase 6 (Fiscal/Focus NFe)

### Veredito: **Fase 6 CONDICIONALMENTE LIBERADA, não totalmente bloqueada — mas com pré-requisitos obrigatórios.**

Avaliação por domínio afetado:

| Domínio | Estado | Bloqueia Fase 6? |
|---|---|---|
| Vendas | Golden flow v4 protegido e único caller ativo; mas RPC legada órfã sem hardening ainda executável, e `vendas.cliente_id` com cenário de falha silenciosa não descartado | **Sim, parcialmente** — Fiscal consome dados de venda; se houve perda silenciosa de `cliente_id` em produção, documentos fiscais gerados a partir desses dados herdam o problema |
| Clientes | RLS de isolamento por loja (`clientes_loja_isolado`) sem definição versionada (policy fantasma) | **Sim** — Fiscal precisa de dado de cliente correto e isolado por loja para emissão de NF-e |
| Financeiro | `contas_receber_loja_isolado` também é policy fantasma; fluxo de crediário automático (24702) não validado em banco real | **Sim, parcialmente** — não bloqueia diretamente o módulo Fiscal, mas é dependência indireta |
| Estoque | Sem drift crítico novo identificado nesta auditoria | Não |
| Permissões | 11 policies fantasma incluem `perfis_*` (controle de acesso de usuário) | **Sim** — permissões incorretas afetam todos os domínios, incluindo o futuro módulo Fiscal |
| Auditoria | Views sem `security_invoker` (`v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias`) podem contornar RLS em relatórios/auditoria | Médio — não bloqueia Fiscal diretamente, mas é risco de integridade de auditoria |

### Pré-requisitos obrigatórios antes de iniciar código da Fase 6

1. **Investigar o cenário real de `vendas.cliente_id`** (drift #6, §2.1) contra um banco de produção real — confirmar se houve perda de dado silenciosa.
2. **Versionar as 11 policies fantasma** do §5.5 como migration formal (extraindo definição real de produção via `supabase db pull` ou equivalente), com prioridade para `clientes_loja_isolado`, `contas_receber_loja_isolado`, `doc_fiscal_loja_isolado` e `perfis_*` — este último item é literalmente o domínio que a Fase 6 vai estender (documentos fiscais).
3. **Executar `supabase db diff` (ou equivalente) contra produção real** para confirmar paridade, ou pelo menos documentar as diferenças conhecidas antes de construir Fiscal sobre esse schema.
4. **Aplicar e validar as 7 migrations da Fase 5 (270–276)** contra um ambiente Supabase real antes de considerar o domínio de Vendas estável o suficiente para servir de base ao Fiscal.
5. **Restaurar o CI** (ou rodar os guards manualmente antes de cada merge da Fase 6) — sem isso, novas regressões de RLS/RPC na Fase 6 não serão detectadas automaticamente.

Itens que **não** bloqueiam o início do trabalho de design/modelagem da Fase 6 (podem prosseguir em paralelo): remoção do `REVOKE ALL` faltante nas 15 funções de relatório, remoção da RPC `finalizar_venda_transacional` legada, limpeza dos 2 pares de índice redundante, drop das 2 views órfãs — são dívidas reais mas de baixo risco imediato para o domínio Fiscal.

---

## 8. Recomendações e próximos passos (não implementados nesta auditoria)

1. Criar migration de reconciliação para as 11 policies fantasma, com conteúdo extraído de produção real (requer acesso a um ambiente Supabase real, não disponível nesta sessão).
2. Criar migration `DROP FUNCTION public.finalizar_venda_transacional(...)` (assinatura legada) após confirmar, via logs de produção, que não há caller residual.
3. Adicionar `security_invoker = true` a `v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias`, ou removê-las se de fato órfãs.
4. Adicionar `REVOKE ALL FROM PUBLIC` às 15 funções de relatório identificadas no §5.4.
5. Remover `idx_produtos_categoria` (duplicado por `idx_produtos_categoria_id`) e `idx_contas_receber_venda_id` (redundante ao índice único `24701`).
6. Formalizar a estratégia de baseline única proposta em `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` §8 (squash + numeração 100% timestamp + gate de CI `db diff` vazio) — pendente desde 2026-06-20.
7. Investigar e resolver o CI quebrado (bloqueia qualquer guard automático, incluindo os desta e de fases futuras).

Nenhuma dessas ações foi executada nesta sessão — por instrução explícita do usuário, este é um documento de auditoria, não de implementação.
