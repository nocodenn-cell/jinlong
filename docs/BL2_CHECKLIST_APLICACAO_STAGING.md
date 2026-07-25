# BL-2 — Checklist de Aplicação em Staging
**Data**: 2026-07-25
**Status**: ✅ **REVISÃO FINAL CONCLUÍDA — LIBERADO PARA STAGING**
**Autor**: Claude (claude-sonnet-5)
**Pré-requisito**: Aprovação registrada na conversa (BL-2 aprovado para seguir para staging após revisão final)

---

## 0. Escopo Deste Documento

Executa os 5 passos pedidos antes de aplicar:
1. Diff final das migrations 273/274 contra `BL2_MODELO_FINAL_APROVADO.md`
2. Verificação de ausência de alteração destrutiva
3. Ordem e passos de aplicação em staging
4. Roteiro de re-execução dos cenários de validação no ambiente real
5. Critério de decisão antes de considerar produção

Inclui também a análise pedida sobre o achado da migration 272 (colunas de observabilidade restauradas) — registrado como correção complementar do BL-1, com verificação explícita de contrato.

---

## 1. Diff Final — Migrations vs. Modelo Aprovado

Verificação linha a linha contra `docs/BL2_MODELO_FINAL_APROVADO.md`.

### 1.1 Migration 273 (Schema)

| Item aprovado (§5.1 do modelo) | Implementado em 273? | Conforme? |
|---|---|---|
| `ADD COLUMN nome text` em `regras_preco` | Sim — `PARTE A`, `ALTER TABLE public.regras_preco ADD COLUMN nome text` (idempotente via `DO $$ IF NOT EXISTS`) | ✅ |
| `ADD COLUMN promocao_regra_id uuid REFERENCES regras_preco(id) ON DELETE SET NULL` em `itens_venda` | Sim — `PARTE B` | ✅ |
| `ADD COLUMN promocao_desconto_percentual numeric(10,4)` em `itens_venda` | Sim — `PARTE B` | ✅ |
| `ADD COLUMN promocao_nome_snapshot text` em `itens_venda` | Sim — `PARTE B` | ✅ |
| `ADD COLUMN max_desconto_total_percentual numeric(5,2) DEFAULT 60.00` em `pdv_config` | Sim — `PARTE C`, default 60.00 (aprovado) | ✅ |
| `tipo_preco` CHECK constraint — **sem mudança** | Confirmado — nenhuma referência a `tipo_preco` em 273 | ✅ |
| Nenhuma migração de dados necessária | Confirmado — todas as colunas nullable/DEFAULT, nenhum `UPDATE` em linhas existentes | ✅ |

**Item adicional não listado explicitamente no modelo, mas coerente com ele**: `CREATE INDEX idx_itens_venda_promocao_regra ... WHERE promocao_regra_id IS NOT NULL` — índice parcial para as queries de auditoria descritas no §4.4 do modelo ("quantas vendas tiveram a promoção X"). Aditivo, sem risco.

### 1.2 Migration 274 (RPCs + Trigger)

| Item aprovado (§2, §3.3, §5.2 do modelo) | Implementado em 274? | Conforme? |
|---|---|---|
| Nova RPC `calcular_promocao_aplicavel`, `STABLE`, `SECURITY INVOKER`, precedência PRODUTO > CATEGORIA > mais recente | Sim — `PARTE A`, `ORDER BY CASE tipo_regra WHEN 'PRODUTO' THEN 0 ELSE 1 END, quantidade_minima DESC, created_at DESC LIMIT 1` | ✅ |
| Autoridade real permanece na RPC de venda; frontend nunca decide | Sim — `calcular_promocao_aplicavel` é chamada e revalidada **dentro** de `finalizar_venda_transacional_canonica_v4` (PASSO 1 e PASSO 3); nenhum parâmetro novo permite ao chamador "declarar" uma promoção sem revalidação | ✅ |
| Trigger de limite manual (migration 122) ajustado: base de comparação passa a ser o preço pós-promoção quando `promocao_regra_id` está presente | Sim — `PARTE B`, `v_base := preco_unitario_original * (1 - promocao_desconto_percentual/100)` quando aplicável | ✅ |
| Promoção pré-autorizada (análoga a ATACADO) não conta para o teto de 15% manual | Sim — a promoção em si nunca passa pelo cálculo de `v_pct` do trigger; só o desconto manual **adicional** sobre a base pós-promoção é limitado | ✅ (validado em execução real, ver §4) |
| Teto agregado de 60% sobre `total_bruto` | Sim — `PARTE C`, leitura de `pdv_config.max_desconto_total_percentual`, exceção `FINALIZAR_VENDA_CANONICA_DESCONTO_TOTAL_EXCEDE_LIMITE` | ✅ |
| Snapshot de auditoria: `promocao_regra_id`, `promocao_desconto_percentual`, `promocao_nome_snapshot` | Sim — gravado no PASSO 3, incluindo normalização de `VALOR_FIXO` para percentual equivalente (§2.4 do modelo) | ✅ |
| `tipo_preco` **nunca** recebe `'PROMOCAO'` | Confirmado — em nenhum ponto da migration 274 o valor `'PROMOCAO'` é atribuído a `tipo_preco`; a branch `IF v_tipo_preco = 'MANUAL'` é a única exceção ao caminho VAREJO/ATACADO, e o literal `'PROMOCAO'` foi **removido** do `IN (...)` que existia em 272 (`IN ('MANUAL', 'PROMOCAO')` → `= 'MANUAL'`) | ✅ |
| Assinatura de `finalizar_venda_transacional_canonica_v4` inalterada (21 args) | Confirmado por diff textual — ver §2.1 abaixo | ✅ |

**Item fora do modelo original, mas necessário e documentado como tal**: restauração de `custo_unitario_snap` / `tipo_preco_fonte` / `regra_aplicada_id` no INSERT de `itens_venda` (mesma seção de código já sendo reescrita para os campos de promoção). Ver §3 abaixo — análise de contrato dedicada, conforme solicitado.

**Conclusão da Parte 1**: as duas migrations implementam exatamente o que foi aprovado em `BL2_MODELO_FINAL_APROVADO.md`, sem desvio de escopo além do item já sinalizado (e agora formalmente analisado em §3).

---

## 2. Verificação de Ausência de Alteração Destrutiva

### 2.1 Nenhum `DROP`

```bash
grep -n "^DROP\|DROP FUNCTION\|DROP TABLE\|DROP COLUMN\|ALTER COLUMN.*TYPE\|RENAME" \
  backend/supabase/migrations/273_bl2_promocao_schema_regra_aplicada.sql \
  backend/supabase/migrations/274_bl2_promocao_rpc_e_precedencia.sql
```
**Resultado**: nenhuma ocorrência. Nenhuma das duas migrations contém `DROP TABLE`, `DROP COLUMN`, `DROP FUNCTION`, `ALTER COLUMN ... TYPE` ou `RENAME`.

Isso é uma mudança em relação ao padrão usado na migration 272 (que fez `DROP FUNCTION` do overload de 19 args antes de recriar com 21) — não é necessário aqui porque **a assinatura não muda**.

### 2.2 Assinatura da RPC — Diff Byte a Byte

Comparação da assinatura completa de `finalizar_venda_transacional_canonica_v4` entre a migration 272 (baseline em produção) e a migration 274 (nova):

```
p_venda_id uuid,
p_caixa_id uuid,
p_operador_id uuid,
p_loja_id uuid,
p_forma_pagamento text DEFAULT 'DINHEIRO'::text,
p_total_bruto numeric DEFAULT NULL::numeric,
p_total_desconto numeric DEFAULT NULL::numeric,
p_total_liquido numeric DEFAULT NULL::numeric,
p_pagamentos jsonb DEFAULT NULL::jsonb,
p_itens jsonb DEFAULT '[]'::jsonb,
p_desconto_gerente_token text DEFAULT NULL::text,
p_desconto_gerente_percentual numeric DEFAULT NULL::numeric,
p_strict_manager_discount_auth boolean DEFAULT false,
p_fiscal_auto_enqueue boolean DEFAULT false,
p_ip_address text DEFAULT NULL::text,
p_user_agent text DEFAULT NULL::text,
p_device_id text DEFAULT NULL::text,
p_terminal_id text DEFAULT NULL::text,
p_cliente_id uuid DEFAULT NULL::uuid,
p_motivo_desconto public.motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::public.motivo_desconto_enum_tipo,
p_motivo_descricao text DEFAULT NULL::text
```
**Idêntica em 272 e 274** — confirmado por comparação textual direta dos dois arquivos. Também idênticos: `RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb, itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path TO 'public'`, e a cláusula `GRANT EXECUTE ... TO authenticated, anon`.

**Consequência prática**: nenhum caller existente (`caixaVendas.impl.ts`, PostgREST RPC endpoint, tipos gerados) precisa de qualquer mudança para continuar funcionando após esta migration — é um `CREATE OR REPLACE` puro sobre a mesma assinatura.

### 2.3 `CREATE OR REPLACE`, Nunca `DROP + CREATE`, Nas Duas Funções Alteradas

- `finalizar_venda_transacional_canonica_v4`: `CREATE OR REPLACE FUNCTION` direto (sem `DROP` prévio) — seguro porque a assinatura não muda; `CREATE OR REPLACE` preserva GRANTs existentes automaticamente no Postgres.
- `trg_fn_itens_venda_limite_desconto`: `CREATE OR REPLACE FUNCTION` — os triggers já vinculados (`trg_itens_venda_limite_desconto_bi/bu`, criados na migration 122) **não precisam ser recriados**; eles passam a executar o novo corpo automaticamente.
- `calcular_promocao_aplicavel`: função nova, sem consumidores prévios — não há o que quebrar.

### 2.4 Colunas Novas — Todas Aditivas

Todas as colunas criadas em 273 são `ADD COLUMN` com `nullable` ou `DEFAULT`, nunca `NOT NULL` sem default sobre tabela já populada. Nenhum `UPDATE` retroativo é executado. Vendas e regras já existentes ficam com as novas colunas em `NULL`/valor-default, semântica correta ("sem promoção aplicada" / "60% é o valor herdado por todos").

**Conclusão da Parte 2**: nenhuma operação destrutiva, nenhuma quebra de assinatura de RPC, nenhuma alteração incompatível de coluna. Migrations 273/274 são seguras para aplicação em qualquer ambiente com histórico de dados de produção real.

---

## 3. Achado da Migration 272 — Correção Complementar do BL-1

### 3.1 Registro

Este achado é **complementar ao BL-1**, não faz parte do escopo original de BL-2: a migration 272 (reconciliação de descontos do BL-1) reconstruiu o corpo de `finalizar_venda_transacional_canonica_v4` a partir da migration 268, que já não capturava `custo_unitario_snap`, `tipo_preco_fonte` e `regra_aplicada_id` — colunas adicionadas e populadas pela migration 235. O frontend nunca parou de enviar esses 3 campos por item (`caixaVendas.impl.ts:271-273`); a RPC em produção os recebia e os descartava silenciosamente desde a 268.

A migration 274 restaura a captura porque reescreve exatamente o mesmo `INSERT INTO itens_venda` para acomodar os novos campos de promoção — seria descuido deixar a regressão lado a lado com código novo tocando a mesma linha.

### 3.2 Revisão de Contrato — Consumidores Reais das 3 Colunas

Busca no repositório (`grep -rn "custo_unitario_snap\|tipo_preco_fonte"`) identificou os seguintes consumidores reais, cada um analisado abaixo:

#### (a) `relatorio_margem_por_venda_periodo` — RPC de relatório (migration 241, viva, não tocada por 273/274)

- **Assinatura**: inalterada por esta mudança (241 não é tocada pelas migrations 273/274).
- **Design existente**: a função já foi construída para degradar graciosamente na ausência do snapshot — calcula `qtd_com_custo / qtd_total` e só retorna `margem_estimada` quando a cobertura é ≥ 95%; caso contrário, `custo_confiavel = false` e `margem_estimada = NULL`.
- **Comportamento atual (antes de 274)**: como `custo_unitario_snap` está `NULL` desde a migration 268, a cobertura é 0% para vendas recentes → o relatório já retorna `custo_confiavel = false` para essas vendas hoje.
- **Comportamento após 274**: vendas novas (a partir da aplicação) passam a ter `custo_unitario_snap` preenchido → a cobertura volta a subir para essas vendas → `margem_estimada` volta a ser calculada com dado real.
- **Veredito**: **sem quebra de contrato**. Mesma assinatura, mesma lógica, mesmo comportamento de degradação — apenas os dados de entrada (que já eram esperados) voltam a existir. O efeito é estritamente uma correção (relatório que estava mostrando `custo_confiavel=false`/`NULL` para vendas recentes volta a mostrar números reais).

#### (b) `trg_detectar_anomalia_item_venda` — trigger de alerta leve (migration 236, não tocada por 273/274)

- **Natureza**: `AFTER INSERT`, não-bloqueante, com `EXCEPTION WHEN OTHERS THEN RETURN NEW` (erros nunca impedem a venda); grava apenas em `system_alerts`, tabela append-only explicitamente documentada como "não lida por nenhum fluxo crítico de venda ou estoque"; desligável via `pdv_config.alertas_leves_ativos` (default `true`).
- **Comportamento atual**: a condição `NEW.custo_unitario_snap IS NOT NULL AND NEW.preco_unitario < NEW.custo_unitario_snap` nunca é satisfeita hoje, porque a primeira metade é sempre falsa — o alerta de `margem_negativa` está **dormente** desde a migration 268.
- **Comportamento após 274**: o alerta **volta a funcionar de verdade** — vendas com preço abaixo do custo snapshotado passam a gerar linhas em `system_alerts`.
- **Veredito**: **sem quebra de contrato, mas é uma mudança de comportamento observável que deve ser sinalizada** (não é um bug introduzido, é a funcionalidade original sendo religada). Recomendação: monitorar `system_alerts` nos primeiros dias em staging/produção para confirmar que o volume de `margem_negativa` é plausível (não indica um problema não relacionado nos dados de custo).

#### (c) Admin UI — `actions.ts` / `VendaDetailSheet.tsx` (não tocados por 273/274)

- Tipos já declaram os 3 campos como `| null` (`VendaItemDetalhe.tipo_preco_fonte`, `.custo_unitario_snap`, `.regra_aplicada_id`) — já preparados para receber valor ou `null`.
- Exibição condicionada a `pdv_config.show_margin_visual` / `show_preco_fonte` (feature flags, default `false` desde a migration 235).
- **Veredito**: **sem quebra de contrato**. Com as flags desligadas (padrão), nada muda visualmente. Se algum ambiente já ligou essas flags manualmente, a tela passa a mostrar dado real em vez de vazio — comportamento desejado, não regressão.

#### (d) `dev-tools/pdv-stress-client.ts` / `pdv-gate-client.ts`

- Já enviam `tipo_preco_fonte: 'VAREJO'` como literal de teste — nenhum conflito, esses scripts já assumiam o campo em uso.

### 3.3 Conclusão da Revisão de Contrato

Nenhum dos 4 consumidores identificados tem seu contrato (assinatura, tipo de retorno, comportamento documentado) alterado por esta correção. O único efeito observável é que uma funcionalidade de observabilidade — feature-flagged ou não-bloqueante em todos os casos — volta a operar como originalmente projetado em migration 235/236/238/241. Recomenda-se acompanhar `system_alerts` (tipo `margem_negativa`) por alguns dias após aplicação em staging como parte da validação, não como bloqueio de aplicação.

---

## 4. Checklist de Aplicação em Staging

### 4.1 Pré-Aplicação

- [ ] Confirmar `project_ref` do ambiente de staging (Supabase) — **NÃO** aplicar no projeto de produção (jinlong) nesta etapa
- [ ] Confirmar que staging tem paridade de schema com produção até a migration 272 (rodar `migration list` remoto e comparar com o repositório)
- [ ] Snapshot/backup do banco de staging antes de aplicar (rotina padrão, mesmo em staging)
- [ ] Confirmar que `pdv_config.id = 1` existe em staging (todas as leituras de config assumem essa linha)

### 4.2 Aplicação (Ordem Sequencial Obrigatória)

- [ ] Aplicar migration **273** primeiro (schema) — `mcp__Supabase__apply_migration` ou `supabase db push`
- [ ] Verificar schema pós-273:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='regras_preco' AND column_name='nome';
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='itens_venda'
    AND column_name IN ('promocao_regra_id','promocao_desconto_percentual','promocao_nome_snapshot');
  SELECT max_desconto_total_percentual FROM public.pdv_config WHERE id=1;
  -- Esperado: 4 colunas confirmadas + valor 60.00
  ```
- [ ] Aplicar migration **274** (RPCs + trigger) — só depois de 273 confirmada
- [ ] Verificar corpo da função pós-274:
  ```sql
  SELECT pg_get_functiondef(oid) LIKE '%calcular_promocao_aplicavel%' AS chama_rpc_promocao,
         pg_get_functiondef(oid) LIKE '%FINALIZAR_VENDA_CANONICA_DESCONTO_TOTAL_EXCEDE_LIMITE%' AS valida_teto_60,
         pg_get_functiondef(oid) LIKE '%promocao_nome_snapshot%' AS grava_snapshot
  FROM pg_proc WHERE proname = 'finalizar_venda_transacional_canonica_v4' AND pg_function_is_visible(oid);
  -- Esperado: todas true

  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calcular_promocao_aplicavel') AS rpc_nova_existe;
  -- Esperado: true
  ```
- [ ] `NOTIFY pgrst, 'reload schema'` já incluído em ambas as migrations — confirmar que o PostgREST respondeu (chamar a RPC uma vez via REST/SDK)

### 4.3 Re-Execução dos Cenários de Validação (Ambiente Real)

Os 6 cenários já validados localmente (Postgres 16 descartável) devem ser repetidos em staging, com dados reais de catálogo (não sintéticos):

| # | Cenário | Resultado Esperado |
|---|---------|---------------------|
| 1 | `calcular_promocao_aplicavel` para produto com regra PRODUTO cadastrada | Retorna a regra correta |
| 2 | Venda com promoção aplicada, preço correto enviado | `CONCLUIDA`; `itens_venda.promocao_regra_id/percentual/nome_snapshot` preenchidos |
| 3 | Venda ignorando a promoção (preço divergente enviado) | Rejeitada com `FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE` |
| 4 | Desconto manual >15% sem promoção e sem token de gerente | Rejeitada com `DESCONTO_MANUAL_EXCESSIVO` |
| 5 | Desconto manual adicional sobre item com promoção, dentro de 15% da base pós-promoção | Aceita |
| 6 | Desconto manual adicional sobre item com promoção, acima de 15% da base pós-promoção | Rejeitada com `DESCONTO_MANUAL_EXCESSIVO` |
| 7 | Desconto agregado da venda acima de 60% do total bruto | Rejeitada com `FINALIZAR_VENDA_CANONICA_DESCONTO_TOTAL_EXCEDE_LIMITE` |

Adicionar em staging (não testado localmente, requer ambiente real):
- [ ] Fluxo completo via PDV real (não só chamada direta de RPC): operador escaneia produto com promoção cadastrada, finaliza venda, confirma preço exibido e preço cobrado batem
- [ ] Regressão: venda sem nenhuma promoção envolvida continua funcionando exatamente como antes (V AREJO/ATACADO/MANUAL puro)
- [ ] Split payment + promoção simultaneamente
- [ ] Verificar `system_alerts` após algumas vendas de teste com preço propositalmente abaixo do custo — confirmar que `margem_negativa` é registrada corretamente (achado §3.2b)
- [ ] Rodar `relatorio_margem_por_venda_periodo` para o período de teste e confirmar `custo_confiavel = true` para as vendas novas

### 4.4 Critério de Go/No-Go Para Produção

- [ ] Todos os 7 cenários da tabela acima + os 4 itens adicionais passam em staging
- [ ] Nenhuma regressão observada em fluxos sem promoção
- [ ] `system_alerts` mostra volume plausível de `margem_negativa` (não indica problema de dados de custo pré-existente e não relacionado)
- [ ] Sem erros inesperados em logs da Edge/PostgREST durante os testes
- [ ] Aprovação explícita do usuário após revisão dos resultados de staging

**Somente após todos os itens acima**: considerar aplicação em produção, com plano de rollback pronto (reversão das 2 migrations é aditiva — remover colunas novas e reverter função para o corpo da migration 272 é suficiente, sem impacto em dados históricos).

---

## 5. Rollback (Se Staging Revelar Problema)

```sql
-- Reverter função para o corpo da migration 272 (sem lógica de promoção)
-- (reaplicar o CREATE OR REPLACE de 272_reconciliacao_bl1_descontos_token_auditoria_motivo.sql)

-- Reverter trigger para o corpo da migration 122 (sem ajuste de base pós-promoção)
-- (reaplicar o CREATE OR REPLACE de 122_limite_desconto_manual_itens.sql)

DROP FUNCTION IF EXISTS public.calcular_promocao_aplicavel(uuid, uuid, numeric, timestamptz);

-- Colunas novas são opcionais de remover (dados não são referenciados por nada
-- fora do que 274 criou); se removidas, fazer DEPOIS de reverter a função que as escreve:
ALTER TABLE public.itens_venda
  DROP COLUMN IF EXISTS promocao_regra_id,
  DROP COLUMN IF EXISTS promocao_desconto_percentual,
  DROP COLUMN IF EXISTS promocao_nome_snapshot;
ALTER TABLE public.regras_preco DROP COLUMN IF EXISTS nome;
ALTER TABLE public.pdv_config DROP COLUMN IF EXISTS max_desconto_total_percentual;
```

Nota: a restauração de `custo_unitario_snap`/`tipo_preco_fonte`/`regra_aplicada_id` (achado §3) reverteria junto se a função voltar ao corpo da 272 — decisão separada, deveria ser mantida mesmo em rollback do BL-2 propriamente dito, já que é uma correção independente do BL-1.

---

**Status**: ✅ Revisão completa. Liberado para aplicar migration 273 em staging, seguido de 274, seguido da re-execução dos cenários.
**Autor**: Claude (claude-sonnet-5)
**Data**: 2026-07-25
