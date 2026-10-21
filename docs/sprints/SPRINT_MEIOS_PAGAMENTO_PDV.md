# Sprint — Meios de pagamento do PDV Jinlong (dinheiro, PIX, crédito, débito, misto)

Base: `origin/main` em 21/10/2026. Sem TEF/gateway/integração bancária. Nenhuma migration nova, nenhuma edge alterada.

## 1. Auditoria (antes de implementar)

RPC canônica de finalização: `public.finalizar_venda_transacional_canonica_v4` (wrapper SECURITY DEFINER,
`backend/supabase/migrations/20260916120000_sec04_token_gerente_vinculo_loja_v4.sql:73`) →
`finalizar_venda_transacional_canonica_v4_unscoped` (`20260902140300_fiscal_payload_snapshot_icms_origem.sql:34`).
PDV desktop (offline): outbox → edge `sync-outbox` → `registrar_venda_com_itens` (`functions/sync-outbox/index.ts:720`).
Tabela SSOT de pagamentos: `public.vendas_pagamentos` (CHECK nas 4 formas, `valor numeric(10,2) > 0`, UNIQUE (venda_id, forma)).

| Item | Situação | Evidência |
|---|---|---|
| Seleção rápida dos 4 meios — caixa web | Funciona | `pdv-importados/app/caixa/CaixaPdvMetodoPagamentoSelector.tsx:23` (atalhos 1–4) |
| Seleção dos 4 meios — **PDV desktop (Tauri)** | **Faltava** (fixo em DINHEIRO) | `pdv-local/src/hooks/usePdvLocalVendaCaixaFlow.ts` (`forma_pagamento: 'DINHEIRO'` antes deste PR) |
| Pagamento combinado (web) | Funciona | `app/caixa/hooks/useCaixaPagamentos.ts:71`; RPC grava 1 linha por forma (`…icms_origem.sql:348-356`) |
| Pagamento combinado (desktop) | Não suportado (SQLite guarda forma escalar) | `pdv-local/src-tauri/src/db.rs:29,196` — ver pendências |
| Dinheiro exato (servidor) | Funciona | `numeric(10,2)`, `round_abnt`, recusa >2 casas (`…v4.sql:166-171`) |
| Troco só em dinheiro e só se houver dinheiro suficiente | Funciona | `app/caixa/caixaPagamentoSaldo.ts:56,85`; `CaixaPageClient.tsx:1081-1101`; servidor recusa qualquer excesso (`…icms_origem.sql:255`) |
| Excedente em cartão/PIX | Bloqueado (UI + servidor) | idem |
| Pagamento insuficiente | Só a prazo com cliente + limite/token gerente | `…icms_origem.sql:271` (`SALDO_PENDENTE_EXIGE_CLIENTE`) |
| Idempotência | Funciona | `idempotencyKey` → `p_venda_id` (`finalizarVendaValidation.ts:66`); `pg_advisory_xact_lock` (`…icms_origem.sql:110`); replay divergente recusado (`:126`) |
| Integridade transacional | Funciona | função única; falha ⇒ rollback total (teste T10) |
| Registro usuário/loja/caixa/operação | Funciona | `vendas.operador_id/caixa_id` (loja via caixa), `venda_eventos` (device/terminal), auth.uid() conferido no wrapper (`…v4.sql:106-129`) |
| Declarado → liquidado | Funciona (financeiro) | `vendas_pagamentos` = declarado no PDV; `financeiro_recebiveis_venda` PENDENTE→RECEBIDO (`20261005004647_financeiro_loja_contas_ledger.sql:136-160,333`); PIX liquida automático quando há conta configurada (`20261006180000…:122`) |
| "Confirmado" como estado separado | Parcial (por desenho) | sem TEF, a confirmação é o operador finalizar após aprovação na maquininha/app; não há 3º estado persistido |
| Parcelamento no crédito | Parcial | existe no financeiro (`CONFIGURAR_RECEBIVEL`, 1–60 parcelas, `…ledger.sql:318`); o PDV não captura o nº de parcelas |
| Cancelamento/estorno rastreável | Funciona | `cancelar_venda_transacional` (gerente da loja; auditoria + `devolucoes` por forma) `20261007171000…:7`; `ESTORNAR_RECEBIVEL` no financeiro |
| Conferência/fechamento por forma | Funciona no repo | `calcular_valor_sistema_por_forma_caixa` (`20261007180000…:66`), snapshot `caixas_fechamento_formas` (`20261007190000…:161`) — **dependem de migrations ainda listadas como pendentes em produção** |
| Conciliação bancária | Funciona | `IMPORTAR_EXTRATO` / `CONCILIAR` (`…ledger.sql:357`) |
| pt/zh | Funciona (web: 57 chaves de pagamento com zh); desktop sem i18n — rótulos pt+zh adicionados | `pdv-importados/src/lib/i18n/{pt,zh}.json` |
| RLS / isolamento | Funciona | `vendas_pagamentos` policies + `tenant_guard` RESTRICTIVE; teste T13 |

## 2. Implementado (somente a lacuna comprovada e compatível)

PDV desktop: seletor das 4 formas (Dinheiro 现金 / PIX / Crédito 信用卡 / Débito 借记卡) ao lado de "Finalizar".
- Envia `forma_pagamento` escalar — campo que o SQLite, a outbox, a edge `sync-outbox` e `registrar_venda_com_itens` **já** aceitam (sem mudança em Rust, edge ou banco).
- Sem forma informada ⇒ `DINHEIRO` (comportamento anterior idêntico). Volta para Dinheiro a cada cupom novo.
- Desconto de gerente fora de dinheiro é bloqueado **antes** de gravar (o servidor recusaria na sync e o evento ficaria preso na outbox).
- Forma desconhecida é recusada sem gravar.

## 3. Testes (evidência)

- `backend/scripts/pdv-meios-pagamento.test.sql` — cadeia real de migrations em Postgres 17 local: T1–T8, T9a, T10–T15.
- `backend/scripts/pdv-meios-pagamento-concorrencia.sh` — T9 dupla finalização simultânea em 2 sessões reais.
- `pdv-local/src/hooks/usePdvLocalVendaCaixaFlow.test.tsx` — 7 casos novos (forma default, 4 formas, desconto × forma, forma inválida).

## 4. Pendências (exigem decisão/autorização)

1. Pagamento combinado e nº de parcelas no PDV desktop: exige coluna nova no SQLite (Rust), payload `pagamentos[]` na outbox (a edge já aceita) e novo instalador — validar no PDV do cliente (acesso presencial).
2. Capturar parcelas do crédito no caixa web: exige alteração da RPC canônica + migration (label `deploy-prod:aprovado`).
3. Confirmar em produção (leitura) se as migrations de conferência por forma (20261007180000/190000) e financeiro (20261006120000) estão aplicadas.
