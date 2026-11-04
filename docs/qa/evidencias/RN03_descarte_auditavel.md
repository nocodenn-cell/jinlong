# RN-03 — Descarte auditável de venda em espera (evidências, homologação local)

Data: 2026-11-04. Banco: `supabase_db_fastproduct` (stack local). Nada foi aplicado no remoto.
Script: `docs/qa/evidencias/rn03_testes_banco.sh`.

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 1 | Descarte pelo dono, motivo válido | DESCARTADA + autor + data gravados pelo servidor | PASS (`autor_ok=t`, `data_ok=t`) |
| 2 | Repetição do descarte | `venda_em_espera_nao_encontrada` | PASS |
| 3 | Motivo vazio / 2 caracteres | `motivo_obrigatorio` | PASS |
| 4 | Descarte por outro usuário | `permissao_negada` | PASS |
| 5 | Sem sessão | `sessao_expirada` | PASS |
| 6 | UPDATE direto para DESCARTADA sem autor | viola CHECK `vendas_em_espera_descarte_auditavel_chk` | PASS |
| 7 | Histórico preservado | descartes antigos continuam com autor NULL (não inventado) | PASS (2 linhas) |
| 8 | Descarte simultâneo da mesma espera (2 sessões) | só uma vence; a outra recebe `nao_encontrada` | PASS (autor único: "Corrida A") |
| 9 | Fechamento concorrente com descarte não commitado | fechamento bloqueado (vê a espera ainda EM_ESPERA) | PASS (`FECHAR_CAIXA_VENDAS_EM_ESPERA`) |
| 10 | Fechamento após descarte commitado | fechamento concluído | PASS (caixa FECHADO) |

Observações de concorrência:
- O descarte bloqueia a linha com `FOR UPDATE`; repetições concorrentes são serializadas.
- Um fechamento que executa durante um descarte ainda não commitado é bloqueado (leitura conservadora). O operador repete a ação depois.
- Risco residual conhecido: uma venda colocada em espera exatamente durante o fechamento (sem bloqueio na inserção) pode passar. A inserção em espera não trava o caixa; isso fica como pendência para a próxima rodada de RN-03/concorrência.

Dados de teste: esperas de fixture descartadas com motivo "Limpeza de fixture de teste RN-03 (homologação local)". Nenhum dado real foi alterado.
