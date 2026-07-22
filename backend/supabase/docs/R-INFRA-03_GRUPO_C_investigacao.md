# R-INFRA-03 — Grupo C: investigação (migrations no repo, não aplicadas em prod)

Escopo: `236`, `237`, `252`, `24702`. Evidência coletada via `pg_proc`/`pg_trigger`/
`to_regclass`/`information_schema` no projeto de produção `kbabmewnahysfvlybiak` e
`grep` de consumidores no repositório. **Nenhuma alteração feita em produção.**

## Cluster 1 — `system_alerts` (migrations 236 + 237)  →  FEATURE MEIO-IMPLANTADA

### Objetos que a migration cria
- `236`: tabela `public.system_alerts`; coluna `pdv_config.alertas_leves_ativos` (kill switch);
  funções/triggers `trg_detectar_anomalia_item_venda`, `trg_detectar_anomalia_estoque`.
- `237`: remove as triggers da 236; cria RPC `registrar_system_alert(...)`; redefine `pdv_config_flags_visuais()`.

### Estado real em produção
| Objeto | Existe em prod? |
|---|---|
| tabela `system_alerts` | ❌ ausente |
| coluna `pdv_config.alertas_leves_ativos` | ❌ ausente |
| RPC `registrar_system_alert` | ❌ ausente |
| RPC `pdv_config_flags_visuais` | ✅ existe, **mas seu corpo referencia `alertas_leves_ativos`** (coluna ausente) |

### Consumidores no código (vivos)
- `pdv-importados/app/caixa/server/registrarAlertasLevesVenda.ts` — em toda venda:
  chama `pdv_config_flags_visuais()` e, se `alertas_leves_ativos`, chama `registrar_system_alert`.
  Chamado por `caixaVendas.impl.ts:389`. Protegido por `try/catch` → **falha é engolida** (venda não quebra).
- `pdv-importados/app/admin/auditoria/actions.ts:270` — `.from('system_alerts')` na tela de Auditoria.
  Sem guarda → **a leitura quebra/vem vazia** em produção (tabela ausente).
- `lib/supabase/database.types.ts` — tipos gerados incluem `system_alerts` (repo assume que existe).

### Diagnóstico
Feature "alertas leves / auditoria de anomalias" está **codada e no repositório**, porém a
migration nunca foi aplicada em prod. Estado inconsistente: `pdv_config_flags_visuais()` (aplicada)
referencia coluna que a 236 (não aplicada) deveria ter criado.

### Recomendação: **APLICAR 236 + 237 em produção** (aditivo, baixo risco)
- Cria 1 tabela + 1 coluna + 1 RPC que o app já espera; restaura a tela de Auditoria e o kill switch.
- Alternativa (se a feature for para descartar): remover o código consumidor (auditoria + caixa) —
  maior superfície de mudança. **Não recomendado** frente ao Go-Live (perde rastreabilidade de anomalias).
- **Não** arquivar/remover do repo: é a fonte canônica de uma feature que o app usa.

## Cluster 2 — `venda_finance_context` (migration 252)  →  ABANDONADA/SUBSTITUÍDA

### Objetos: tabela `venda_finance_context` + `sincronizar_finance_context_venda()` + 2 triggers.
### Estado em prod: ❌ todos ausentes.
### Consumidores: apenas `database.types.ts` (tipo gerado) e um **comentário** dentro da v4 viva
(`-- PASSO 7: ... [já feito via trigger em migration 252]`). Nenhum acesso real à tabela.
### Diagnóstico: o "mirror" de contexto financeiro foi **substituído** pela escrita direta em
`contas_receber` dentro da própria v4 (ver Cluster 3). A tabela-espelho nunca foi necessária em prod.
### Recomendação: **ARQUIVAR 252** (mover para `migrations/_archive/` ou marcar como obsoleta).
Não aplicar. Limpar o comentário órfão na v4 e o tipo gerado em etapa de higiene (Grupo D).

## Cluster 3 — `24702_finalizar_venda_v4_contas_receber_automatico`  →  JÁ VIVA EM PROD

### Estado em prod: a v4 viva (`finalizar_venda_transacional_canonica_v4`, 1 overload) **contém**
`p_cliente_id` **e** a automação de `contas_receber` (INSERT ... ON CONFLICT (venda_id)).
Confirmado: corpo referencia `contas_receber`; `venda_finance_context` aparece só como comentário.
### Diagnóstico: a lógica da 24702 **está em produção** (via a versão canônica/reconciliada da v4,
provavelmente por `268_reconcile_finalizar_venda_v4_single_overload`, que É rastreada). Portanto a
24702 não é "ausente de prod" em efeito — é uma **etapa intermediária absorvida** (pertence ao Grupo D).
### Recomendação: **manter como histórica** (não aplicar, não remover). Garantir que o arquivo de v4
canônico no repo bata com o corpo vivo em prod (reconciliação de conteúdo na fase 3, sem tocar prod).

## Resumo de ações recomendadas (aguardando aprovação — nada executado)
| Migration | Classe efetiva | Recomendação |
|---|---|---|
| 236 | repo-only, feature meio-implantada | **Aplicar em prod** (aditivo) |
| 237 | idem (depende da 236) | **Aplicar em prod** junto da 236 |
| 252 | repo-only, substituída | **Arquivar** (não aplicar) |
| 24702 | absorvida na v4 viva | **Manter histórica** (Grupo D) |
