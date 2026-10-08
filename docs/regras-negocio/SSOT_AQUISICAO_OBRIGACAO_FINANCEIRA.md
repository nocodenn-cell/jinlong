# SSoT — Aquisição → Estoque → Obrigação financeira (SSOT-003)

Status: **política de produto (2026-10-07)** — remediação fechada com guard na NF-e.

## Cadeia econômica

```
OC (pedido)
  → recebimento físico (estoque)
  → documento / obrigação reconhecida
  → conta a pagar (origem)
  → liquidação
```

## Resposta por via

| Via | Quando nasce estoque | Quando nasce obrigação / AP | Como detectar “recebido sem obrigação” | Rastreio até obrigação futura |
|-----|----------------------|-----------------------------|----------------------------------------|-------------------------------|
| **OC** `receber_ordem_compra` | No receber (`ENTRADA_OC` + `ordens_compra`) | **Não nasce** nesta via | `movimentos_estoque_log.tipo_codigo = 'ENTRADA_OC'` e **zero** `contas_pagar` ligadas a esse evento | OC id; NF-e posterior via `importacoes_nfe.ordem_compra_id` → AP com `nfe_importacao_id` |
| **Remessa** `criar_confirmar_remessa_entrada` | Na confirmação (`ENTRADA_REMESSA_*` + `remessa_id` no kardex) | **Não nasce** | `tipo_codigo` remessa + sem AP | `remessa_id`; vínculo OC ainda textual (`origem_ref`) — dívida UX-03 remessa |
| **NF-e** `confirmar_importacao_nfe` | Se sem remessa prévia (`ENTRADA_NFE`) | **No confirm**, **somente** com ≥1 linha em `importacoes_nfe_duplicatas` → N APs com `nfe_importacao_id` | N/A após remediação: confirm com valor econômico > 0 e 0 duplicatas **é rejeitado** | `nfe_importacao_id` nas APs |

## Ponto de reconhecimento da obrigação

**Único ponto canônico hoje:** confirmação de NF-e de compra **com duplicatas**.

Não inventamos vencimento/parcela/AP fictícia para OC ou remessa.

## Caso crítico — NF-e sem duplicatas

> Se uma NF-e de compra é confirmada, existe consequência econômica, mas não vierem duplicatas, como o Jinlong representa a obrigação?

**Antes:** estoque subia; AP=0 (zona cinzenta).

**Depois (SSOT-003):** se \(\sum qtd\_conferida \times custo > 0\) e `count(duplicatas)=0` → exceção `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`. Confirm **não** conclui. Operador deve: (a) registrar duplicatas, ou (b) usar OC/remessa se a entrada for sem documento fiscal econômico.

Valor econômico 0 (amostra/sem custo) sem duplicatas continua permitido (sem obrigação a reconhecer).

## Distinção explícita

| Estado | Representação |
|--------|----------------|
| Mercadoria recebida, obrigação **não** reconhecida | Kardex `ENTRADA_OC` / `ENTRADA_REMESSA_*` (e OC/remessa abertas) |
| Mercadoria recebida, obrigação **reconhecida** | Kardex `ENTRADA_NFE` + ≥1 `contas_pagar.nfe_importacao_id` |

## Evidência

- Guard: `backend/supabase/migrations/20261007163100_ssot_003_nfe_obrigacao_duplicata.sql`
- FK OC↔NF-e: mig. `20260918100000_oc_recebimento_parcial.sql` (`ordem_compra_id`)
