# P1/P2 — Restantes

## FLX-03

**Título:** Autorização de desconto de gerente pode ser desligada por variável de ambiente, sem trilha de que foi desligada

**Descrição do problema:**
A exigência de token do gerente para desconto é controlada por `p_strict_manager_discount_auth`, cujo **default no SQL é `false`** em todas as versões da RPC. O default seguro (`true`) existe apenas na camada TypeScript (`caixaSalesRuntimeConfig.ts:20`). Assim, qualquer chamada direta à RPC que omita o parâmetro **desliga a exigência de token**, e o valor efetivo depende de uma env var no runtime do Next.js.

**Impacto operacional:** O controle antifraude de desconto tem sua defesa real no frontend. Além disso, a auditoria de desconto (`tokens_desconto_gerente` + registro) só é acionada quando há token — se `strict` está `false` e nenhum token é passado, o desconto é aplicado **sem registro de quem autorizou**.

**Evidência encontrada:**
- Default inseguro no SQL: `272_reconciliacao_bl1_descontos_token_auditoria_motivo.sql:114` → `p_strict_manager_discount_auth boolean DEFAULT false` (idem `025:18`, `028:16`, `031:15`, `052:19`)
- Default seguro só no TS: `pdv-importados/lib/config/caixaSalesRuntimeConfig.ts:20` → `STRICT_MANAGER_DISCOUNT_AUTH: true`
- Auditoria condicionada ao token: `272:350-353` → `IF p_desconto_gerente_token IS NOT NULL THEN` ... consome token e audita
- Caminho que sempre passa `null`: `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts:116` → `p_desconto_gerente_token: null`

**Comportamento atual:** Segurança dependente de configuração de ambiente; default do banco é o inseguro.

**Comportamento esperado:** Inverter o default no SQL para `true` (*fail-closed*: na dúvida, exigir autorização). A flag de ambiente pode continuar existindo para relaxar conscientemente, nunca para endurecer.

**Risco:** Desconto não autorizado sem rastro de responsável; perda de margem sem accountability.

**Prioridade sugerida:** **P1**

**Arquivos prováveis para correção:**
- nova migration invertendo o default da RPC v4
- `pdv-importados/lib/config/caixaSalesRuntimeConfig.ts`

---

## DAT-02

**Título:** Numeração de migrations com três padrões conflitantes e colisões históricas — ordem de aplicação ambígua entre ambientes

**Descrição do problema:**
Coexistem três esquemas de nomenclatura: sequencial curto (`007_`, `285_`), timestamp Supabase (`20260730093000_`) e híbrido timestamp+sequencial (`20260717031500_248_`). Há colisões documentadas e ao menos uma numeração malformada (`24702_`). O próprio repositório reconhece o problema: `253_clientes_tipo_endereco_e_view_gerente.sql:5-8` registra "RENUMERADO: colidia com 245_... — quebrava `db reset`/replay sequencial com duplicate key em schema_migrations_pkey".

Existem inclusive **pares duplicados** de mesmo conteúdo com prefixos diferentes: `20260620200253_244_clientes_tipo_endereco_e_view_gerente.sql` e `253_clientes_tipo_endereco_e_view_gerente.sql`; `20260620222629_245_remover_venda_fiado.sql` e `246_remover_venda_fiado.sql`.

**Impacto operacional:** A ordem de replay num ambiente novo (staging, DR, novo tenant) pode divergir da ordem em que produção evoluiu. Este é o mecanismo mais provável por trás do drift do SEC-02.

**Evidência encontrada:**
- Colisão documentada: `253_clientes_tipo_endereco_e_view_gerente.sql:5-8`
- Numeração malformada: `24702_finalizar_venda_v4_contas_receber_automatico.sql`
- Duplicatas de conteúdo: pares `244/253` e `245/246` citados acima
- Reparo recente registrado: `backend/docs/auditoria/supabase-migration-repair-20260802/README.md`

**Comportamento atual:** Ordenação lexicográfica mistura os três padrões; sequenciais curtos ordenam *antes* dos timestamps.

**Comportamento esperado:** Congelar o padrão (timestamp Supabase), e — mais importante que renomear o histórico — ter um teste de CI que faça `db reset` do zero num banco limpo e compare o schema resultante com o dump de produção. Isso captura drift automaticamente.

**Risco:** Ambiente novo com schema diferente de produção; DR que restaura errado; drift silencioso (SEC-02 já é uma materialização).

**Prioridade sugerida:** **P1**

**Arquivos prováveis para correção:**
- `pdv-importados/scripts/` — script de verificação de colisão (já existe algo similar, ver `check-entity-ssot-boundary.mjs` como modelo)
- pipeline de CI

---

## DAT-03

**Título:** `documentos_fiscais_dlq` é a única tabela sem RLS, e a migration de habilitação referenciada não existe no repositório

**Descrição do problema:**
Varredura comparando `CREATE TABLE` contra `ENABLE ROW LEVEL SECURITY` em todas as migrations retorna exatamente uma tabela descoberta: `public.documentos_fiscais_dlq`. O cabeçalho da própria migration que a cria diz textualmente que ela "deve existir antes de `098_documentos_fiscais_dlq_enable_rls.sql`" — **arquivo que não existe** no repositório (`ls | grep dlq` retorna só um arquivo).

**Impacto operacional:** A DLQ fiscal guarda payloads de documentos que falharam — potencialmente com dados de cliente e valores. Sem RLS, o isolamento entre lojas depende exclusivamente dos grants de tabela.

**Evidência encontrada:**
- Criação: `backend/supabase/migrations/098_documentos_fiscais_dlq.sql:4`
- Referência ao arquivo ausente: `098_documentos_fiscais_dlq.sql:1` → "Deve existir antes de 098_documentos_fiscais_dlq_enable_rls.sql"
- Ausência confirmada: `ls backend/supabase/migrations | grep -i dlq` → apenas `098_documentos_fiscais_dlq.sql`
- Única tabela sem RLS na varredura `comm -23` entre tabelas criadas e tabelas com RLS

**Comportamento atual:** Tabela sem RLS.

**Comportamento esperado:** `ENABLE ROW LEVEL SECURITY` + policy de isolamento por loja, alinhada às demais tabelas fiscais.

**Risco:** Vazamento de dados fiscais entre tenants. Severidade atenuada hoje porque o módulo fiscal está inativo (FLX-02) e a tabela deve estar vazia — mas vira P0 no momento em que o fiscal for religado.

**Prioridade sugerida:** **P1** (P0 condicional a religar o fiscal)

**Arquivos prováveis para correção:**
- nova migration `293_documentos_fiscais_dlq_enable_rls.sql`

---

## BR-04

**Título:** Ausência de regra de reabertura de caixa — não há RPC nem bloqueio explícito

**Descrição do problema:**
Existe fechamento atômico (`207_fechar_caixa_atomico_rpc.sql`, `227_fechar_caixa_pdv_atomico.sql`) e status de fechamento (`230`). Busca por `reabrir`/`REABERT` nas migrations retorna **zero** resultados: não existe RPC de reabertura, e também não existe regra que declare a reabertura proibida.

**Impacto operacional:** Cenário operacional real e frequente (fechamento por engano, divergência a corrigir antes do encerramento do turno) não tem caminho previsto. Na prática, resolve-se por acesso direto ao banco — o pior desfecho possível, sem trilha.

**Evidência encontrada:**
- Fechamento existe: `207_fechar_caixa_atomico_rpc.sql`, `227_fechar_caixa_pdv_atomico.sql:36`, `230_caixa_status_fechamento.sql:33`
- Reabertura ausente: varredura por `reabrir|REABERT` em `backend/supabase/migrations/*.sql` → 0 ocorrências
- Imutabilidade da venda pós-caixa: `206_vendas_caixa_imutabilidade_trigger.sql` (impede venda em caixa fechado, mas não trata reabertura)

**Comportamento atual:** Indefinido — nem suportado, nem explicitamente vedado.

**Comportamento esperado:** Decisão de produto registrada. Recomendo **vedar** a reabertura (fechamento é fato contábil) e, no lugar, oferecer RPC de *ajuste pós-fechamento* com motivo obrigatório, autorização de GERENTE+ e registro em auditoria.

**Risco:** Intervenção manual no banco sem trilha; quebra da conciliação de caixa.

**Prioridade sugerida:** **P2**

**Arquivos prováveis para correção:**
- nova migration com RPC de ajuste pós-fechamento
- `pdv-importados/app/admin/diagnostico-caixa/`

---

## CA-01

**Título:** `estoque_baixas.quantidade` é `numeric` sem escala definida, divergindo do padrão `numeric(10,3)` do restante do módulo de estoque

**Descrição do problema:**
A coluna é declarada como `numeric` puro (precisão arbitrária), enquanto todo o módulo de estoque padroniza `numeric(10,3)` — visível em `movimentos_estoque_log.quantidade_delta` e nos casts da view de divergência.

**Impacto operacional:** Baixo hoje, dado que a coluna nem é preenchida (DAT-01). Torna-se relevante ao corrigir DAT-01: comparar `numeric` livre com `numeric(10,3)` pode gerar diferença de arredondamento na reconciliação.

**Evidência encontrada:**
- `remote_schema.sql:7380-7386` → `"quantidade" numeric DEFAULT 0`
- Padrão do módulo: `remote_schema.sql:8513` → cast `::numeric(10,3)`; `remote_schema.sql:1418` → `(-p_quantidade)::numeric(10,3)`

**Comportamento atual:** Escala indefinida.

**Comportamento esperado:** `numeric(10,3)`, coerente com o kardex. Corrigir **junto** com DAT-01, na mesma migration.

**Risco:** Divergência de arredondamento na reconciliação de estoque.

**Prioridade sugerida:** **P2** (agrupar com DAT-01)

**Arquivos prováveis para correção:**
- mesma migration de DAT-01 (`291_fix_estoque_baixas_quantidade.sql`)

---

## TB-01

**Título:** `criar_produto_com_estoque_inicial` — defesa de papel existe só na Server Action; RPC aceita OPERADOR

**Descrição do problema:**
Manifestação, na camada Tela→Backend, do drift do SEC-02. A tela e a Server Action exigem `assertGerenteSession`; a RPC em produção aceita `OPERADOR`. O próprio comentário da migration `20260718135138` assume esse desenho: "CRUD completo do catálogo continua gated na Server Action assertGerenteSession".

**Quadro comparativo:**

| Campo | Valor |
|---|---|
| **Tela** | `/admin/catalogo` (criar produto) |
| **Campo/ação** | Criação de produto |
| **Frontend** | GERENTE+ (`assertGerenteSession`) |
| **Backend (produção)** | `OPERADOR`, `GERENTE`, `DONO`, `ADMIN` |
| **Problema** | Autorização mais permissiva no backend; chamada direta à RPC contorna a tela |

**Impacto operacional:** Confiar em *gate* de Server Action é confiar no cliente. Com a chave `anon` pública e um usuário OPERADOR autenticado, a RPC é invocável diretamente.

**Evidência encontrada:**
- Desenho assumido: `backend/supabase/migrations/20260718135138_criar_produto_permite_operador_pdv.sql:1-2`
- Estado em produção: `remote_schema.sql`, função `criar_produto_com_estoque_inicial` → `IF v_perfil NOT IN ('OPERADOR','GERENTE','DONO','ADMIN')`
- Correção existente porém sem efeito: `20260730093000_revoga_operador_cadastro_produto_pdv.sql` (ver SEC-02)

**Comportamento atual:** Backend mais permissivo que a tela.

**Comportamento esperado:** Paridade — RPC restrita a GERENTE+, igual à Server Action.

**Risco:** Bypass de política de produto (SSoT de entidades).

**Prioridade sugerida:** **P2** — o ticket **P0 é o SEC-02**; este existe para registrar a manifestação na auditoria Tela→Backend. **Corrigir uma resolve as duas.**

**Arquivos prováveis para correção:** ver SEC-02
