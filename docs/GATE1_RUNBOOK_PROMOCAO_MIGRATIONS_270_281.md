# Gate 1 — Runbook de Promoção Controlada das Migrations 270–281

**Data:** 2026-07-17
**Objetivo:** aplicar as migrations 270–281 (Fase 5 + Database Integrity Hardening) em
homologação e depois produção, de forma **segura, reproduzível e reversível**.
**Status:** roteiro preparado — **`db push` NÃO executado** nesta sessão.

> Este documento é um procedimento. Cada passo tem um comando e um critério de sucesso. Não pular
> passos. Em qualquer falha de critério, **parar** e ir para a seção de rollback.

---

## 0. Baseline atual de produção (capturado 2026-07-17, projeto `kbabmewnahysfvlybiak`)

O estado é **misto** — atenção, pois alguns objetos já existem por *drift* (não porque a migration
rodou). As migrations são idempotentes e reconciliam esses casos, mas a distinção importa para
entender o que **muda de fato** em produção:

| Migration | O que faz | Já em prod? | Efeito real do push |
|---|---|---|---|
| 270 vendas_em_espera RLS/integridade | RPCs + RLS de venda em espera | ❌ | cria (mudança real) |
| 271 vendas_em_espera ledger | tabela `vendas_em_espera_eventos` + trigger | ❌ | cria (mudança real) |
| 272 cancelamento/devolução token gerente | `autorizar_operacao_privilegiada` + RPCs | ❌ | cria (mudança real) |
| 273 orçamentos | tabela `orcamentos` + RPCs | ❌ | cria (mudança real) |
| 274 authorization_challenges | tabela + RPCs (infra QR/PIN) | ❌ | cria (mudança real) |
| 275 kits modelagem | `kit_composicoes` + `venda_kit_expansao` | ❌ | cria (mudança real) |
| 276 vendas.cliente_id | `ADD COLUMN IF NOT EXISTS` | ✅ (drift) | **no-op** (coluna já existe) — só reconcilia histórico |
| 277 RLS policies fantasma | versiona 19 policies (DROP+CREATE) | ✅ (ghost) | reconcilia definição (mesma de prod) |
| 278 stub finalizar_venda legada | stub dos 2 overloads | parcial | **desativa o overload 9-arg VIVO** (mudança real de segurança) |
| 279 views security_invoker | `ALTER VIEW SET` em 3 views | parcial | no-op nas já seguras; garante `v_venda_consistencia_anomalias` |
| 280 revoke anon/PUBLIC (sweep) | revoga anon/PUBLIC de SECURITY DEFINER | ❌ | **revoga anon de 33 funções** (mudança real de segurança) |
| 281 índices redundantes | DROP de 2 índices | ❌ | remove 1 índice real + 1 no-op |

**Mudanças de comportamento reais a validar com atenção:** 272 (novo fluxo de gerente), 278 (fecha
bypass da v4 legada) e 280 (fecha bypass anon na v4 canônica). As demais são criação de recursos novos
(inertes até serem usados pela UI) ou reconciliação de drift.

---

## 1. Pré-checks antes do push

1. **Branch e código promovidos.** Confirmar que o PR #199 (branch `claude/sales-phase-5-audit-94kz17`)
   está revisado e que as migrations 270–281 são exatamente as do repositório:
   ```
   ls backend/supabase/migrations/ | sort | sed -n '/^27[0-9]/p;/^28[01]/p'   # deve listar 12 arquivos
   node scripts/migration-sequence-guard.mjs   # OK, sem colisão
   node scripts/rpc-gate-guard.mjs             # OK, caller único de venda
   ```
2. **Determinismo do bootstrap** (opcional, recomendado): rodar o harness da Frente 7 num Postgres
   descartável — `backend/supabase/scripts/bootstrap-determinism-check.sh` deve imprimir
   "OK — bootstrap determinístico".
3. **Diff local × remoto.** Antes de qualquer push:
   ```
   supabase link --project-ref <REF_DO_ALVO>
   supabase migration list        # ver quais das 270–281 constam como não-aplicadas no remoto
   supabase db diff --linked       # inspecionar divergências antes de escrever
   ```
   Critério: as 12 migrations aparecem como **pendentes** no remoto (ou já reconciliadas, no caso de
   drift 276/277/279). Nenhuma colisão de versão.
4. **Janela de baixo tráfego.** Escolher janela sem venda ativa (fora de horário de caixa) — 278 e 280
   alteram funções de venda; melhor sem operação concorrente.
5. **Ninguém mais aplicando migrations** no mesmo projeto simultaneamente.

---

## 2. Confirmação do ambiente correto (CRÍTICO)

> O Readiness Check apontou que o projeto consultado (`kbabmewnahysfvlybiak`) está **quase vazio**
> (1 cliente, 0 contas_receber). **Confirmar se este é o produção real ou um staging** antes de tratar
> como produção.

1. Listar projetos e confirmar o `ref` do alvo:
   ```
   supabase projects list
   ```
2. **Aplicar SEMPRE primeiro em HOMOLOGAÇÃO** (`SUPABASE_MIGRATION_CHECK_PROJECT_REF`), nunca direto em
   produção. Só promover para produção após todos os critérios da seção 7.
3. Confirmar, antes do push, que o `project-ref` linkado corresponde ao ambiente pretendido:
   ```
   supabase status         # conferir o ref linkado
   ```
   Critério: o `ref` impresso == o ambiente que você pretende alterar. **Se houver dúvida, parar.**

---

## 3. Backup / Rollback

**Antes do push (obrigatório):**
1. Backup lógico do schema + dados:
   ```
   supabase db dump --linked -f backup_pre_gate1_$(date +%Y%m%d_%H%M).sql --data-only
   supabase db dump --linked -f schema_pre_gate1_$(date +%Y%m%d_%H%M).sql          # schema
   ```
2. Confirmar que o projeto tem **Point-in-Time Recovery** ou snapshot automático (Supabase Pro) — anotar
   o timestamp exato imediatamente antes do push, para restauração se necessário.

**Rollback por migration** (cada arquivo documenta o seu; resumo):
- 281: recriar os 2 índices simples. 280: reconceder (não recomendado — reabre gap). 279:
  `ALTER VIEW ... SET (security_invoker=false)`. 278: reaplicar a definição original de 122/020.
  277: `DROP POLICY` das 19. 270–275: `DROP` das tabelas/RPCs criadas (nenhuma tem dado histórico até
  ser usada pela UI). 276: manter (coluna reconciliada, sem rollback).
- **Rollback preferencial:** restaurar do backup/PITR do passo 1 se o dano for amplo; rollback por
  migration só para reversão cirúrgica de um item específico.

---

## 4. Ordem de execução

`supabase db push` aplica as pendentes em **ordem lexicográfica** — que para 270→281 coincide com a
ordem numérica/de dependência. Não há intercalação de timestamps nessa faixa (o problema de ordenação
da Frente 7 é anterior à 205; não afeta 270–281).

```
# Em HOMOLOGAÇÃO primeiro:
supabase db push --linked
# (aplica 270, 271, ..., 281 na ordem)
```

Dependências internas (todas respeitadas pela ordem numérica): 271 depende de 270; 281 depende do
índice único criado em 24701 (já em prod); 277 depende das tabelas base (já em prod); 280 opera sobre
o catálogo vivo (idempotente).

Critério de sucesso: `db push` termina sem erro e as 12 passam a constar no histórico remoto
(`supabase migration list`).

---

## 5. Validações pós-aplicação (rodar logo após o push)

Executar no ambiente recém-atualizado. **Todas devem retornar o valor esperado.**

```sql
-- 276: coluna existe
SELECT 'v276', EXISTS(SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='vendas' AND column_name='cliente_id');           -- true

-- 277: 19 policies versionadas presentes
SELECT 'v277', count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN (
  'clientes_loja_isolado','clientes_insert_loja','clientes_update_gerente_loja','clientes_delete_gerente_loja',
  'contas_receber_loja_isolado','doc_fiscal_loja_isolado','liquidacoes_loja_isolado',
  'itens_venda_select_loja','itens_venda_write_gerente_loja','ordens_compra_gerente_loja',
  'ordens_compra_itens_gerente_loja','pdv_config_select_gerencial','pdv_config_update_dono',
  'caixa_policy','painel_policy','tokens_desconto_select_gerente',
  'transferencias_idempotencia_select_gerente','transferencias_idempotencia_insert_gerente',
  'transferencias_idempotencia_delete_gerente');                                                 -- 19

-- 278: ambos overloads da legada agora são stub LEGACY_DISABLED
SELECT 'v278', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='finalizar_venda_transacional'
    AND pg_get_functiondef(p.oid) ILIKE '%LEGACY_DISABLED%';                                     -- 2

-- 279: nenhuma view public sem security_invoker
SELECT 'v279', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
    AND COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                  WHERE option_name='security_invoker'),'false') NOT IN ('true','on');           -- 0

-- 280: nenhuma função SECURITY DEFINER executável por anon/PUBLIC
SELECT 'v280', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('public',p.oid,'EXECUTE')); -- 0

-- 281: índices removidos; survivors presentes; constraint UNIQUE válida
SELECT 'v281_drop', to_regclass('public.idx_contas_receber_venda_id') IS NULL
              AND to_regclass('public.idx_produtos_categoria_id') IS NULL;                        -- true
SELECT 'v281_survivors', to_regclass('public.idx_produtos_categoria') IS NOT NULL
              AND to_regclass('public.contas_receber_venda_id_unique') IS NOT NULL;              -- true
SELECT 'v281_constraint', convalidated FROM pg_constraint
  WHERE conrelid='public.contas_receber'::regclass AND contype='u';                              -- true

-- 270–275: recursos criados
SELECT 'v272', to_regprocedure('public.autorizar_operacao_privilegiada(text,text,text,uuid)') IS NOT NULL; -- ajustar assinatura conforme migration
SELECT 'v273', to_regclass('public.orcamentos') IS NOT NULL;                                     -- true
SELECT 'v274', to_regclass('public.authorization_challenges') IS NOT NULL;                       -- true
SELECT 'v275', to_regclass('public.kit_composicoes') IS NOT NULL;                                -- true
SELECT 'v271', to_regclass('public.vendas_em_espera_eventos') IS NOT NULL;                       -- true
```

---

## 6. Queries de confirmação das Frentes 2–6 (regressão de segurança)

Confirmam que o estado seguro do repositório está refletido no ambiente:

```sql
-- Frente 2: RLS ativo nas tabelas críticas (deve ser tudo true)
SELECT relname, relrowsecurity FROM pg_class
  WHERE oid IN ('public.vendas'::regclass,'public.itens_venda'::regclass,'public.estoque'::regclass,
                'public.contas_receber'::regclass,'public.caixas'::regclass,'public.clientes'::regclass);

-- Frente 3: v4 é overload único; legada desativada (2 stubs)
SELECT 'v4_overloads', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='finalizar_venda_transacional_canonica_v4';             -- 1

-- Frente 4: 7 views, todas security_invoker (query v279 = 0)

-- Frente 5: caller legítimo mantém acesso (authenticated) mesmo após revoke de anon
SELECT 'v4_auth_ok', has_function_privilege('authenticated',
  'public.finalizar_venda_transacional_canonica_v4(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid)','EXECUTE');  -- true

-- Frente 6: índice ativo de estoque preservado
SELECT 'idx_estoque_loja', to_regclass('public.idx_estoque_loja') IS NOT NULL;                   -- true
```

---

## 7. Critérios de aprovação antes de produção

Promover de homologação → produção **somente** quando **TODOS** forem verdadeiros em homologação:

- [ ] `db push` concluiu sem erro; as 12 migrations constam no histórico remoto.
- [ ] Todas as validações da seção 5 retornaram o valor esperado (destaque: **v280 = 0** e **v278 = 2**).
- [ ] Todas as queries da seção 6 confirmaram o estado seguro (RLS on; v4 = 1 overload; authenticated
      mantém EXECUTE).
- [ ] Investigado o risco #2 do DEC-01 (`vendas.cliente_id`): rodar
      `SELECT count(*) FROM vendas WHERE cliente_id IS NOT NULL;` e conferir logs de erro da v4 —
      confirmar que não houve falha silenciosa histórica.
- [ ] Homologação funcional do caminho crítico OK (Gate 2 — `docs/GO_LIVE_READINESS_CHECK.md`): login,
      caixa, venda, preço, desconto de gerente (agora com 272 aplicado), pagamento, cancelamento,
      baixa de estoque, contas a receber.
- [ ] Backup/PITR de produção confirmado imediatamente antes do push de produção.
- [ ] Janela de baixo tráfego agendada.

**Só então** repetir seções 3→5→6 apontando para o `project-ref` de **produção**.

---

## Observações finais

- **Não** inclui Fiscal/NFC-e (Fase 6) — fora do escopo deste gate.
- Itens deferidos que **não** entram neste push: DROP das tabelas/views mortas (DEC-02/06),
  squash-to-baseline (DEC-09). São iniciativas próprias, pós-go-live.
- Este runbook é reproduzível: os mesmos passos valem para homologação e produção, trocando apenas o
  `project-ref`.
