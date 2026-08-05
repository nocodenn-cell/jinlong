# Auditoria Frente 5 — Trilha Operacional (Revisada)

> Pergunta central: **"Consigo reconstruir tudo que aconteceu no sistema?"**
> Análise somente-leitura, evidência de banco (`service_role`) em 2026-08-03.
> **Revisão:** separa falha comprovada em runtime de ausência por falta de operação real.

## Nova classificação

| Símbolo | Significado |
|---|---|
| ✅ VALIDADO | Evento executado em runtime e evidência encontrada (trilha completa). |
| 🟡 PARCIAL | Evento executado, gerou trilha, mas faltam campos obrigatórios. |
| 🔴 FALHA CONFIRMADA | Evento executado e deveria gerar trilha, mas não gerou. |
| ⚪ NÃO VALIDADO | Tabela/fluxo existe, mas não houve operação suficiente para confirmar. |

## Contexto da base

A base atual é **100% de testes internos** (Frente 3): 113 produtos via import/seed,
56 vendas, 39 caixas, todos por contas E2E/Probe/Smoke. A ausência de registros em
algumas tabelas de trilha pode ser **consequência de falta de uso real** e não
necessariamente defeito do sistema. Por isso, o veredito abaixo é **técnico**, não absoluto.

**Tabelas de trilha e contagens reais:**
- `venda_eventos`: 61 registros (vendas)
- `movimentos_estoque_log`: 51 registros (entrada/saída/ajuste)
- `vendas_canceladas_auditoria`: 5 registros
- `descontos_venda`: 2 registros
- `caixas`: 39 registros (abertura/fechamento), sendo 38 fechados e 2 com divergência
- `historico_precos_produto`: **0 registros** (tabela existe)
- `venda_pos_venda_operacoes`: **0 registros** (tabela existe)
- `movimentos_caixa`: **0 registros** (tabela existe)

**Evidência de execução em runtime:** 23/113 produtos têm `updated_at ≠ created_at`
(foram alterados); 2/39 caixas têm `fechamento_diferenca ≠ 0` (divergência real ocorreu).

---

## Matriz de eventos (revisada)

| Grupo | Evento | Estado | Evidência | Fonte | Executado RT? | Registro? | Ausência = bug ou falta validação? |
|---|---|:--:|---|---|:--:|:--:|---|
| **Cadastro** | produto criado | ⚪ NÃO VALIDADO | 113 produtos existem (origem `china_manual`) | `produtos` | Sim (import) | Não há tabela de auditoria | Falta validação (criação via UI/Server Action) |
| | produto alterado | ⚪ NÃO VALIDADO | 23/113 com `updated_at≠created_at` | `produtos` | Sim (23) | Não há trilha | Falta validação (não se sabe se Server Action grava) |
| | produto excluído | ⚪ NÃO VALIDADO | nenhum exclusão observada | — | Não confirmado | — | Falta validação |
| | alteração de preço | ⚪ NÃO VALIDADO | `historico_precos_produto` vazio (0) | `historico_precos_produto` | Não comprovado | Vazio | Falta validação (não provado que houve alt. de preço) |
| **Estoque** | entrada | 🟡 PARCIAL | 51 movimentos (tipo ENTRADA) | `movimentos_estoque_log` | Sim | Sim | — (falta valor anterior) |
| | saída | 🟡 PARCIAL | 51 movimentos (tipo SAIDA) | `movimentos_estoque_log` | Sim | Sim | — (falta valor anterior) |
| | ajuste | 🟡 PARCIAL | 51 movimentos (tipo AJUSTE) | `movimentos_estoque_log` | Sim | Sim | — (falta valor anterior) |
| | inventário | ⚪ NÃO VALIDADO | sem tabela/contagem | — | Não confirmado | — | Falta validação |
| **Financeiro** | lançamento | ⚪ NÃO VALIDADO | sem tabela de trilha fin. | — | Não exercitado | — | Falta validação |
| | pagamento | ⚪ NÃO VALIDADO | sem tabela de trilha fin. | — | Não exercitado | — | Falta validação |
| | alteração | ⚪ NÃO VALIDADO | sem tabela de trilha fin. | — | Não exercitado | — | Falta validação |
| **Caixa** | abertura | 🟡 PARCIAL | 39 caixas abertos | `caixas` | Sim | Sim (em `caixas`) | — (sem trilha de auditoria dedicada) |
| | fechamento | 🟡 PARCIAL | 38 caixas fechados | `caixas` | Sim | Sim (em `caixas`) | — (sem trilha de auditoria dedicada) |
| | divergência | 🟡 PARCIAL | 2 caixas com `fechamento_diferenca≠0` | `caixas` | Sim (2) | Sim (campo em `caixas`) | — (sem justificativa/autorização) |
| | autorização | ⚪ NÃO VALIDADO | `movimentos_caixa` vazio | `movimentos_caixa` | Não exercitado | Vazio | Falta validação (sangria/suprimento) |
| **Venda** | criação | 🟡 PARCIAL | 61 eventos | `venda_eventos` | Sim | Sim | — (falta valor anterior/motivo) |
| | desconto | 🟡 PARCIAL | 2 registros | `descontos_venda` | Sim | Sim | — (falta "onde"/loja) |
| | cancelamento | 🟡 PARCIAL | 5 registros | `vendas_canceladas_auditoria` | Sim | Sim | — (falta valor anterior) |
| | devolução | ⚪ NÃO VALIDADO | sem tabela de devolução | — | Não exercitado | — | Falta validação |

---

## Resumo por classificação

- ✅ **VALIDADO**: 0 eventos
- 🟡 **PARCIAL**: 11 eventos (estoque×3, caixa×3, venda×4, + desconto/cancelamento/criação)
- 🔴 **FALHA CONFIRMADA**: 0 eventos
- ⚪ **NÃO VALIDADO**: 8 eventos (cadastro×4, financeiro×3, inventário, autorização caixa, devolução)

**Total:** 19 eventos · 0 falhas confirmadas · 11 parciais · 8 não validados.

---

## Conclusão técnica (substitui veredito absoluto)

Não existem evidências suficientes para aprovação completa da trilha operacional.
Parte dos eventos possui validação parcial (venda, estoque e caixa básico geraram
trilha em runtime) e parte aguarda teste controlado (cadastro, financeiro, inventário,
autorização de caixa e devolução).

**Não foi confirmada nenhuma falha de instrumentação em runtime.** Toda ausência de
registro observada é explicável por um de dois fatores, e ambos exigem validação antes
de classificar como defeito:

1. **Falta de operação real** — os eventos não foram exercitados nos testes internos
   (ex.: não houve lançamento financeiro, devolução, sangria autorizada nem contagem de inventário).
2. **Criação via import/seed** — os 113 produtos vieram de import em lote (`origem=china_manual`),
   e não se sabe se esse caminho passa pela Server Action que deveria gravar auditoria.

Portanto, o mapa de problemas reais para o Claude Code nesta frente é: **zero correções
imediatas; dezenas de validações pendentes.** As lacunas estruturais conhecidas (ex.:
nenhuma tabela registra "valor anterior") devem ser confirmadas por teste controlado antes
de virarem ticket de correção.

➡️ Plano de validação: `docs/auditoria/PLANO_VALIDACAO_F5_RUNTIME.md`
➡️ Fila de tickets (somente validação): `docs/auditoria/tickets/GO_LIVE_TICKETS_F5_TRILHA.md`
