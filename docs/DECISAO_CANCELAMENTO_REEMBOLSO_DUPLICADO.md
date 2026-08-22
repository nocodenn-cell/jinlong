# Decisão — Risco de Reembolso e Reposição de Estoque Duplicados no Cancelamento

**Data do achado:** 2026-08-20
**Data da correção:** 2026-08-20 (mesmo dia)
**Status:** ✅ **Corrigido, testado e aplicado em produção** — migration `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql` (rastreada remotamente como `20260820233832`; reconciliação de drift na PR #316)
**Achado em:** teste ao vivo de impressão de recibos (ver `docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md`)

---

## O problema (original)

`cancelar_venda_transacional` (RPC `SECURITY DEFINER`, usada pelo botão "Cancelar venda" em `/admin/vendas`) **não verificava se algum item da venda já tinha sido devolvido antes de cancelar a venda inteira.**

Confirmado por dois caminhos:

1. **Ao vivo:** numa venda de teste (R$ 89,90, 1 item), foi feita primeiro uma devolução parcial daquele item (recibo mostrou "Total estornado: R$ 89,90", correto para a devolução isolada). Em seguida, a mesma venda foi cancelada — e o recibo de cancelamento mostrou **"Total estornado: R$ 89,90" de novo**, o valor cheio original, sem descontar o que já tinha sido devolvido.
2. **Leitura do código-fonte** (`cancelar_venda_transacional`, corpo completo lido via `pg_get_functiondef`): confirmou a causa raiz, com um problema **duplo**, não só financeiro:
   - **Estoque:** o laço que devolve estoque iterava `SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = ...` — usava a **quantidade original de cada item**, sem descontar quanto já tinha sido devolvido por `devolver_ou_trocar_venda`. Resultado: o estoque era reposto **duas vezes** para os itens já devolvidos.
   - **Caixa/estorno:** quando a forma de pagamento era dinheiro sem split, `v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido,0),2)` — usava o **total original da venda**, sem descontar valores já estornados em devoluções anteriores.

## A correção

**Migration:** [`backend/supabase/migrations/20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`](../backend/supabase/migrations/20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql)

`CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional` — mesma assinatura, mesmo retorno, sem quebra de compatibilidade para quem já chama a função. Duas mudanças:

1. **Estoque:** antes de repor, calcula por produto quanto já foi reposto via `estoque_reposicoes_devolucao` (join em `venda_pos_venda_operacoes` pela venda) e repõe só o saldo remanescente (`GREATEST(0, quantidade_original - já_reposto)`).
2. **Caixa/estorno:** calcula `SUM(valor_estornado)` já registrado em `venda_pos_venda_operacoes` para a venda, e usa `pendente = GREATEST(0, total_liquido - já_devolvido)` como base do estorno — nos três ramos existentes (split, dinheiro sem split, outras formas sem split). No ramo split (múltiplas formas de pagamento), o valor pendente é distribuído proporcionalmente entre as formas de pagamento originais. Se a venda já foi 100% devolvida antes, o cancelamento muda o status para CANCELADA e ainda repõe o estoque remanescente (se houver), mas não gera novo lançamento de devolução nem debita o caixa.

Quando não há devolução prévia (`já_devolvido = 0`), o comportamento é **idêntico** ao original — a correção só muda o resultado quando de fato existe uma devolução anterior na mesma venda.

## Evidência de teste (Supabase local, isolado, zero contato com produção)

Aplicada a migration e executados dois cenários via chamada direta às RPCs (mesmo código que a UI usa):

| Cenário | Antes da correção | Depois da correção |
|---|---|---|
| **Venda R$ 4.000,00 (2 un.) → devolve 1 un. (R$ 2.000,00) → cancela o restante** | `valor_estornado` no cancelamento = R$ 4.000,00 (❌ deveria ser R$ 2.000,00) | `valor_estornado` = **R$ 2.000,00** ✅ |
| Estoque após o ciclo completo | repunha 2 unidades (1 a mais que o devido) | repõe exatamente **1 unidade** (a que faltava) — estoque volta ao valor original ✅ |
| Saldo do caixa após o ciclo completo | debitado duas vezes pelo mesmo valor | volta **exatamente** ao saldo de antes da venda (50.000,00 → +4.000 venda → −2.000 devolução → −2.000 cancelamento = 50.000,00) ✅ |
| **Teste de regressão — venda R$ 500,00 (5 un.) cancelada sem devolução prévia** | `valor_estornado` = R$ 500,00 | `valor_estornado` = **R$ 500,00** (idêntico — comportamento original preservado) ✅ |

Os três pontos de verificação (`valor_estornado` retornado pela RPC, `estoque.quantidade_atual`, `estoque_reposicoes_cancelamento.quantidade`) bateram exatamente com o esperado nos dois cenários.

## ✅ Aplicada em produção

**A migration foi aplicada em produção via MCP `apply_migration`** durante a investigação da PR #314 (mesmo dia do achado). Como toda aplicação via MCP (em vez de CLI), `schema_migrations.version` gravou o timestamp real da aplicação — `20260820233832` — em vez do timestamp do nome do arquivo (`20260820150000`); o `name` gravado bate exatamente com o arquivo (confirmado via `mcp__supabase__list_migrations`).

Essa diferença de timestamp fazia o gate `migration-remote-drift` da CI classificar o par como drift bloqueante — reconciliado na PR #316 (`backend/supabase/migration-human-gates.json`), com equivalência semântica comprovada de forma reproduzível (`backend/scripts/verify-cancelar-venda-equivalencia.mjs`): SHA-256 do corpo local normalizado e do `pg_get_functiondef` remoto normalizado batem em `d4f4f7a76d1492079b159bb46e5f22b48a72e23da7ad880568220dbbd549e27e`.

**O comportamento antigo (reembolso e reposição duplicados) não está mais em vigor em produção.** O fluxo combinado "devolver parte de uma venda e depois cancelar a mesma venda" já pode ser demonstrado com segurança.

## Verificação pós-apply

1. Migration revisada e aplicada (`backend/supabase/migrations/20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`).
2. Equivalência entre o arquivo local e a função implantada reverificada de forma reproduzível e documentada — ver PR #316.
3. Reconciliação de drift registrada em `backend/supabase/migration-human-gates.json`, atômica por par (só é aceita se ambos os lados — `git_only` e `remote_only` — aparecerem juntos como divergência no ambiente avaliado; um ambiente que nunca recebeu esta migration continua bloqueando corretamente).
4. Pendência restante: repetir manualmente o cenário de teste (venda → devolução parcial → cancelamento) em produção com um valor simbólico, confirmando visualmente que o comprovante de cancelamento mostra o valor descontado corretamente.

---

**Documentos relacionados:** `docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md` (achado original, com o recibo real capturado), `docs/STATUS_PROJETO_PRE_TREINAMENTO.md`, `docs/BACKLOG_TECNICO.md`, `GO_LIVE_CERTIFICATION_REPORT.md` §15.1.
