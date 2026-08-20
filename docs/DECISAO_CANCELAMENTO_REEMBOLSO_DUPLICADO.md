# Decisão — Risco de Reembolso e Reposição de Estoque Duplicados no Cancelamento

**Data do achado:** 2026-08-20
**Data da correção:** 2026-08-20 (mesmo dia)
**Status:** ✅ **Corrigido e testado** — migration `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`
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

## ⚠️ Pendência real — aplicação em produção

**A correção está commitada no repositório (arquivo de migration) e testada localmente, mas isso não significa que já está em vigor no banco de produção.** Aplicar uma migration que substitui uma função financeira `SECURITY DEFINER` diretamente em produção, fora do processo normal de deploy, é uma decisão que não deve ser tomada silenciosamente — precisa de autorização explícita e, idealmente, passar pelo mesmo tipo de checklist que outras mudanças nessa família de funções já passaram (ver `docs/BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md`, item BL-1, "Risco: Alto").

**Enquanto a migration não for aplicada em produção, o comportamento antigo (reembolso e reposição duplicados) continua valendo lá.** A recomendação abaixo sobre não demonstrar o fluxo combinado amanhã continua de pé até que alguém confirme a aplicação em produção.

## Recomendação para amanhã

Mesmo com a correção pronta e testada, **recomenda-se não demonstrar deliberadamente, no treinamento de amanhã, o fluxo combinado "devolver parte de uma venda e depois cancelar a mesma venda"** — a menos que a aplicação da migration em produção seja confirmada antes do treinamento. Cada operação isoladamente (devolução completa OU cancelamento sem devolução prévia) sempre funcionou corretamente.

## Como aplicar em produção

1. Revisar a migration (`backend/supabase/migrations/20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`) — já commitada.
2. Aplicar via `supabase db push` (ou `apply_migration` via MCP) no projeto de produção.
3. Rodar a verificação pós-apply padrão do projeto (`verificacao-pos-apply.sql`, se aplicável).
4. Repetir manualmente o cenário de teste (venda → devolução parcial → cancelamento) em produção com um valor simbólico, confirmando que o comprovante de cancelamento mostra o valor descontado corretamente.

---

**Documentos relacionados:** `docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md` (achado original, com o recibo real capturado), `docs/STATUS_PROJETO_PRE_TREINAMENTO.md`, `docs/BACKLOG_TECNICO.md`, `GO_LIVE_CERTIFICATION_REPORT.md` §15.1.
