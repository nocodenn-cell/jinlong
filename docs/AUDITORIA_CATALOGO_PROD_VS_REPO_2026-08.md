# Auditoria de catálogo — produção × repositório

**Data:** 2026-08-19
**Fase:** 0 do plano de fechamento de pendências para Go-Live (itens 0.1 e 0.2)
**Produção:** projeto Supabase `jinlong` (`kbabmewnahysfvlybiak`, Postgres 17.6)
**Repositório:** `origin/main` em `b9372e4c`, 307 migrations
**Natureza:** somente leitura em produção. Nenhuma migration, DDL, deploy ou alteração de dado foi executado no projeto remoto.

---

## Veredito

> # 🔴 SISTÊMICO
>
> A divergência entre produção e repositório **não é o objeto único** identificado no
> parecer de 2026-08-19. São **8 das 11 seções do catálogo**, e a direção é consistente:
> **produção tem objetos que o repositório não cria.**
>
> **O gate da Fase 0 fecha.** O plano não deve prosseguir para a Fase 1 como escrito.

A propriedade que a Fase 6 (§8.3) pôs como condição mínima para a janela crítica —
*produção é reproduzível a partir do repositório* — **é falsa**, e falsa por uma margem
grande. Um `db reset` a partir do Git hoje produz um banco com **10 funções, 3 tabelas e
15 políticas RLS diferentes** do que está em produção.

---

## 1. Como isto foi medido

O retrato do catálogo é `backend/scripts/catalog-snapshot.sql`: um `SELECT` único que
devolve `(section, obj_key, digest)` para funções, tabelas, colunas, índices, constraints,
triggers, políticas RLS, views, enums, extensões e o ledger de migrations. O digest é md5
do conteúdo comparável do objeto — para funções inclui `prosrc`, `proacl`, `prosecdef`,
`provolatile`, `proconfig` e o tipo de retorno.

Objetos pertencentes a extensões são excluídos via `pg_depend.deptype = 'e'`. Sem isso,
`pgcrypto`, `pg_trgm` e afins produziriam centenas de divergências falsas.

O mesmo SQL, byte a byte, foi executado nos dois lados:

- **LOCAL** — banco reconstruído do zero com `npx supabase db reset --local`, aplicando as
  307 migrations do repositório e o `seed.sql`.
- **PROD** — projeto `jinlong`, via consulta somente-leitura.

### Validação do método

O critério de aceite do item 0.1 exigia que o diff fosse determinístico. Foi verificado:
o retrato do LOCAL foi tirado **antes e depois** de um `db reset` completo, e os 11
digests de seção vieram **idênticos**. Isso prova as duas coisas necessárias para o
veredito ser confiável:

1. o script não tem falso-positivo dependente de estado; e
2. o banco local já era uma reconstrução fiel do repositório — a divergência medida
   abaixo **não é sujeira do ambiente de desenvolvimento**.

---

## 2. Panorama

| Seção | Repositório | Produção | Δ | Digest |
|---|---:|---:|---:|---|
| columns | 851 | 866 | **+15** | difere |
| constraints | 401 | 403 | **+2** | difere |
| enums | 2 | 2 | 0 | ✅ **idêntico** |
| extensions | 8 | 10 | +2 | difere *(ruído de plataforma — §4)* |
| functions | 140 | 144 | **+4** | difere |
| indexes | 269 | 279 | **+10** | difere |
| migrations | 307 | 305 | **−2** | difere *(esperado — §3.1)* |
| policies | 129 | 144 | **+15** | difere |
| tables | 84 | 87 | **+3** | difere |
| triggers | 35 | 35 | 0 | ✅ **idêntico** |
| views | 12 | 12 | 0 | ✅ **idêntico** |

Três seções batem perfeitamente. Não é caos generalizado — é uma divergência estruturada,
concentrada em funções, tabelas e autorização.

---

## 3. Divergências, uma a uma

### 3.1 Migrations ausentes em produção — `esperada`

| Versão | O que faz |
|---|---|
| `20260814015032` | Hardening de diagnósticos + fix P1-3 da idempotência de AP |
| `20260819000000` | Revoga `EXECUTE` de `PUBLIC` nos diagnósticos de consistência |

Já diagnosticadas no parecer de 2026-08-19 e no item 7 do backlog. Nenhuma migration
existe em produção sem arquivo correspondente no repositório — **a divergência de chaves
do ledger está resolvida.** O que esta auditoria mostra é que a paridade de chaves
**não implica** paridade de catálogo: as chaves batem e os objetos não.

Esta é a correção mais importante ao parecer anterior. A conclusão de que "o P0 da
auditoria de drift de junho está resolvido" valia para a numeração, e só para ela.

### 3.2 Funções só em produção — `drift_manual`

Sete funções existem em produção e **nenhuma migration do repositório as cria**:

| Função | Observação |
|---|---|
| `caixa_integridade_gate_check()` | — |
| `finalizar_venda_transacional(7 args)` | sobrecarga legada |
| `finalizar_venda_transacional_canonica_v2(12 args, sem `p_event_source`)` | sobrecarga legada |
| `fiscal_marcar_erro(6 args)` | sobrecarga |
| `fiscal_marcar_erro_normalizado(6 args)` | sobrecarga |
| `listar_valores_sistema_dinheiro_caixas(uuid[])` | — |
| `shadow_validar_venda_engine_v4(jsonb)` | par da tabela `venda_engine_shadow_runs` (§3.4) |

### 3.3 Funções só no repositório — `drift_manual`

Três funções nascem do repositório e **não existem em produção**:

| Função | Impacto |
|---|---|
| `relatorio_consistencia_vendas(p_caixa_id, p_from, p_to)` | 🔴 faz a `20260819000000` abortar — §3.6 |
| `fiscal_enfileirar_documento_venda(p_venda_id, p_tipo_doc, p_payload, **p_loja_id**)` | 🔴 quebra silenciosa em produção — §3.5 |
| `registrar_conferencia_remessa(p_remessa_id, p_itens, p_divergencia_motivo)` | 🟡 sem consumidor: só aparece em `database.types.ts` |

As duas primeiras são criadas por migrations que **estão no ledger de produção** —
`20260621004000` e `20260707020000` no caso do relatório. Produção executou aquelas
versões e mesmo assim não tem os objetos. Ou o objeto foi removido à mão depois, ou o
conteúdo daquela chave de migration no repositório **não é o que produção executou**.

A segunda hipótese é a mais provável e reencontra o achado-raiz de
[`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md) §4:
colisão de numeração com conteúdo diferente nas migrations `113`/`114`. O comentário do
próprio código de produção aponta para lá — ver §3.5.

### 3.4 Tabelas só em produção — `drift_manual` + `ruído`

| Tabela | Linhas | Políticas RLS | Classificação |
|---|---:|---:|---|
| `perfis` | **3** | **4** | `drift_manual` — tabela de domínio com dado e autorização |
| `venda_engine_shadow_runs` | 11 | 0 | `drift_manual` — par de `shadow_validar_venda_engine_v4` |
| `_backup_schema_migrations_20260802` | 100 | 0 (RLS ligada, sem policy) | `ruído` — backup da reconciliação de 02/08 |

Nenhuma tabela do repositório falta em produção. `perfis` é o caso que merece atenção:
tem dado, tem quatro políticas RLS, e um banco reconstruído do Git não a teria.

### 3.5 🔴 `fiscal_enfileirar_documento_venda` — falha silenciosa em produção

A Edge Function `sync-outbox` chama a RPC com **quatro** argumentos:

```ts
// backend/supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.ts:97
const { error: rpcErr } = await supabase.rpc("fiscal_enfileirar_documento_venda", {
  p_venda_id: payload.venda_id,
  p_tipo_doc: tipoDoc,
  p_payload: fiscalPayload,
  p_loja_id: loja_id,  // valida que a venda pertence à loja deste worker (migration 114)
});
```

Produção só tem a sobrecarga de **três** argumentos. O PostgREST resolve por argumentos
nomeados: passar `p_loja_id` a uma função que não o declara devolve `PGRST202`.

**O erro não falha o batch.** O cabeçalho do `index.ts` registra o comportamento:
*"erro só em log; não falha o batch"*. Ou seja: **toda venda sincronizada do `pdv-local`
deixa de enfileirar seu documento fiscal em produção, e ninguém vê erro.**

O comentário `(migration 114)` é a evidência direta: produção executou uma `114` diferente
da que está no repositório. Este é o mesmo par `113`/`114` que a auditoria de junho já
havia identificado como colisão de conteúdo — e que nunca foi reconciliado.

**Condição de disparo:** o caminho só roda com `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true`
na Edge, e só para vendas vindas do `pdv-local`.

**Dano até hoje: zero — o defeito é latente.** Medido em produção:

```sql
SELECT source, count(DISTINCT sale_id) FROM venda_eventos
WHERE event_type = 'SALE_REGISTERED' GROUP BY source;
--  backfill   | 25
--  web_caixa  | 29
```

Nenhuma venda com origem no sync offline chegou a produção. O caminho quebrado **nunca
executou com venda real**. Ele arma no dia em que o `pdv-local` entrar em operação —
e, por ser silencioso, armaria sem aviso.

O caminho web (`/caixa`) chama com três argumentos e **funciona** em produção.

> **Não confundir com o fiscal em geral.** 28 das 29 vendas `web_caixa` também não têm
> documento em `documentos_fiscais_pendentes`, mas isso é outra coisa: o grupo fiscal do
> checklist de implantação está declarado como `fiscal.stub`, e o enfileiramento
> automático do caminho web depende de `AUTO_ENQUEUE_FISCAL_ON_SALE`. Ausência de
> documento no caminho web **não é evidência deste defeito**.

### 3.6 🔴 `relatorio_consistencia_vendas(3 args)` — bloqueia a migration de segurança

Confirmado nos dois lados: o banco reconstruído do repositório tem **as duas** sobrecargas
(3 e 4 argumentos); produção tem **só a de 4**. Como `REVOKE EXECUTE ON FUNCTION` não
aceita `IF EXISTS`, a `20260819000000` aborta inteira em produção — e com ela o
fechamento do vazamento em `verificar_consistencia_venda`, que segue executável por
`authenticated`.

Já previsto no item 1.1 do plano. A correção (`DO` guardado por `to_regprocedure`)
continua válida e necessária.

### 3.7 🔴 Produção tem mais políticas RLS que o repositório

| Tabela | Repositório | Produção |
|---|---:|---:|
| `perfis` | **0** | **4** |
| `transferencias_idempotencia` | 1 | **4** |
| `pdv_config` | **0** | **2** |
| `tokens_desconto_gerente` | **0** | **1** |
| `clientes` | 4 | 5 |
| `contas_receber` | 2 | 3 |
| `documentos_fiscais_pendentes` | 4 | 5 |
| `itens_venda` | 2 | 3 |
| `liquidacoes_receber` | 2 | 3 |
| **total** | **129** | **144** |

Esta é a divergência mais séria da auditoria, por duas razões independentes:

1. **Recuperação de desastre produz um banco menos protegido.** Reconstruir produção a
   partir do Git hoje entregaria `tokens_desconto_gerente`, `pdv_config` e `perfis` **sem
   nenhuma política RLS** — inclusive a tabela dos tokens de autorização gerencial.

2. **A suíte de RLS valida a postura errada.** `npm run test:rls-scope` roda contra o
   banco local e passa 42/42. Mas o banco local tem 129 políticas e produção tem 144: as
   42 regras verdes descrevem um sistema de autorização **que não é o de produção**.

---

## 4. O que é ruído, e por quê

| Item | Por que não é drift |
|---|---|
| `extensions` +2 (`hypopg`, `index_advisor`) | Ferramentas do painel Supabase gerenciado; não existem no stack local. Objetos delas já são excluídos das demais seções via `pg_depend`. |
| `_backup_schema_migrations_20260802` | Backup deliberado da reconciliação de 02/08. Cruft conhecido, sem consumidor. Aparece nos advisors como "RLS sem policy". |
| Deltas em `columns`, `indexes`, `constraints` | Não auditados objeto a objeto nesta rodada. São, em grande parte, consequência das 3 tabelas e das sobrecargas de função só-produção. Precisam de drill-down antes de qualquer baseline — ver §6. |

---

## 5. Classificação por bloqueio

| # | Divergência | Classificação |
|---|---|---|
| 1 | `fiscal_enfileirar_documento_venda` — assinatura divergente, falha silenciosa | 🟠 **bloqueia janela** — latente hoje (zero vendas do sync em produção); vira 🔴 no dia em que o `pdv-local` entrar |
| 2 | Produção com 15 políticas RLS a mais; 3 tabelas sem policy no repo | 🔴 **bloqueia go-live** |
| 3 | `relatorio_consistencia_vendas(3 args)` ausente → `20260819000000` aborta | 🔴 **bloqueia go-live** |
| 4 | `verificar_consistencia_venda` executável por `authenticated` | 🔴 **bloqueia go-live** (depende de 3) |
| 5 | 7 funções e 2 tabelas de domínio só em produção | 🟠 **bloqueia janela** |
| 6 | `20260814015032` ausente — fix P1-3 de AP fora do ar | 🟠 **bloqueia janela** (latente: `contas_pagar` = 0) |
| 7 | Deltas de colunas/índices/constraints não auditados objeto a objeto | 🟠 **bloqueia janela** |
| 8 | `registrar_conferencia_remessa` só no repositório, sem consumidor | 🟡 não bloqueia |
| 9 | `_backup_schema_migrations_20260802`, extensões de plataforma | 🟢 ruído |

---

## 6. Consequência para o plano

O gate da Fase 0 previa exatamente este desfecho e definiu a resposta: com veredito
**sistêmico**, o caminho não é aplicar duas migrations e seguir — é **reconciliação de
schema**, na forma que a auditoria de junho já havia proposto e que nunca foi executada
([`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md) §8):

1. `supabase db pull` — baseline a partir do estado real de produção;
2. baseline adotada como ponto zero do repositório, com os `.sql` antigos preservados;
3. os deltas legítimos que hoje só existem no repositório reautorados sobre a baseline;
4. só então as correções de segurança e o gate de CI passam a significar alguma coisa.

**Os itens 1.1 a 1.5 do plano continuam válidos e necessários** — o vazamento em
`verificar_consistencia_venda` e o fix de AP precisam entrar de qualquer forma. O que muda
é que eles deixam de ser suficientes para declarar Go-Live, e a Fase 5 (staging) deixa de
ser opcional: sem um ambiente de ensaio, uma reconciliação de baseline não tem onde ser
testada.

**Sobre a §3.5:** medida e sem dano até hoje. Não é incidente — é uma armadilha com data
marcada. Deve ser corrigida **antes** de qualquer loja usar o `pdv-local`, e a correção
sai de graça junto da reconciliação de baseline, já que o objeto divergente é a própria
migration `114`.

**Ordem sugerida para a decisão do dono:** o bloqueio real e imediato do Go-Live é §3.7
(políticas RLS) somado a §3.6 + §3.4 (vazamento aberto e migration que não aplica). Esses
três não dependem da reconciliação completa e podem ser fechados antes dela. A
reconciliação de baseline é o que destrava a **janela crítica** e a **segunda loja** — não
necessariamente o piloto de loja única.

---

## 7. Reprodução

```bash
# 1. reconstruir o banco local a partir do repositório
cd backend && npx supabase db reset --local --yes

# 2. impressão digital do catálogo local
SNAP=$(cat scripts/catalog-snapshot.sql)
printf 'SELECT section, count(*), md5(string_agg(obj_key || %s || digest, chr(10) ORDER BY obj_key)) FROM (\n%s\n) s GROUP BY section ORDER BY section;\n' "'|'" "$SNAP" > /tmp/fp.sql
docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/fp.sql

# 3. o MESMO SQL contra produção, somente leitura, e comparar seção a seção
```

Seções com digest divergente são drilhadas com
`SELECT obj_key FROM (<snapshot>) s WHERE section = '<seção>' ORDER BY obj_key`
nos dois lados, e a diferença de conjuntos dá a lista de objetos.

---

## 8. Referências

- [`GO_LIVE_CERTIFICATION_REPORT.md`](../GO_LIVE_CERTIFICATION_REPORT.md) — autoridade de go-live
- [`FASE_6_GATE_FINANCEIRO_VALIDACAO.md`](./FASE_6_GATE_FINANCEIRO_VALIDACAO.md) §4, §8.3 — origem do item 7 do backlog
- [`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md) — auditoria de 2026-06-20; §4 (colisão `113`/`114`) é a raiz de §3.5 desta auditoria
- [`BACKLOG_TECNICO.md`](./BACKLOG_TECNICO.md) item 7 — pedido que originou esta rodada
- `backend/scripts/catalog-snapshot.sql` — retrato do catálogo (novo)
