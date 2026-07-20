# Critérios de aceite — 1º cliente (War Room)

| Campo | Valor |
|--------|--------|
| **Modo** | War Room — só correção de P0 da homologação |
| **PR base** | [#220](https://github.com/nocodenn-cell/fastproduct/pull/220) |
| **Gate UI** | `/admin/implantacao` |
| **Regra** | Go-Live **só** com todos os cenários obrigatórios = **PASS** |

## Modo War Room (obrigatório)

- Não implementar features novas.
- Não refatorar / não aumentar escopo.
- A cada bug: reproduzir → causa raiz → P0/P1/P2 → corrigir **somente P0** → teste de regressão → validar → PR pequeno → atualizar este doc.
- P1/P2: registrar, não bloquear Go-Live.
- Ciclo termina quando a tabela abaixo estiver 100% PASS **sem intervenção técnica** na operação normal.

## Matriz de aceite (mensurável)

Marcar `PASS` / `FAIL` / `N/A`. Em FAIL: ID do bug + PR de correção.

| # | Cenário | Critério de PASS (mensurável) | Status | Evidência |
|---|---------|-------------------------------|--------|-----------|
| 1 | Login | DONO/GERENTE → `/admin/dashboard`; OPERADOR → `/caixa`; conta `ativo=false` bloqueia | ☐ | |
| 2 | Abrir caixa | Sessão aberta; saldo/fundo registrados; UI permite vender | ☐ | |
| 3 | Venda DINHEIRO | Venda finaliza; recibo/feedback OK; cupom limpa | ☐ | |
| 4 | Venda PIX | Idem com forma PIX | ☐ | |
| 5 | Venda cartão | Idem com cartão (débito/crédito conforme formas da loja) | ☐ | |
| 6 | Desconto | Desconto autorizado aplica; total líquido coerente; venda finaliza | ☐ | |
| 7 | Baixa de estoque | Saldo do SKU cai pela qtd vendida (conferir `/admin/estoque`) | ☐ | |
| 8 | Contas a receber | Se parcial/fiado gerou título: aparece em `/admin/financeiro?tab=receber` e liquida | ☐ / N/A | |
| 9 | Contas a pagar | Título originado de NF-e: pagar e/ou cancelar amostra | ☐ / N/A | |
| 10 | Fiscal Stub | Doc `NFC_E_STUB` na fila (`?tab=fiscal`); UI sem erro; reprocessar se ERRO | ☐ | |
| 11 | Auditoria | Eventos da venda/cancelamento visíveis em `/admin/auditoria` | ☐ | |
| 12 | Cancelamento | Cancelamento GERENTE+; estoque/caixa revertem conforme regra | ☐ | |
| 13 | Devolução | Devolução/troca em `/admin/vendas`; saldos revertem | ☐ | |
| 14 | Sangria / suprimento | Movimentação registra; saldo de gaveta coerente | ☐ | |
| 15 | Fechar caixa | Fechamento com conferência; caixa não aceita nova venda | ☐ | |
| 16 | Cadastro mínimo | Cliente + produto (+ estoque se preciso) pelas telas oficiais | ☐ | |
| 17 | P0-DADOS | `/admin/implantacao` → Validar dados → `homologacao.dados` = CONCLUIDO | ☐ | |
| 18 | Autorizar GO-LIVE | Checklist obrigatórios CONCLUIDO; GO autorizado na UI | ☐ | |

**Decisão Go-Live:** todos obrigatórios = **PASS** (itens 8–9 podem ser N/A se o cenário não gerar título / não houver NF-e de amostra).

## Log de bugs da War Room

| Data | Cenário # | Severidade | Causa raiz | PR | Status |
|------|-----------|------------|------------|-----|--------|
| — | — | — | Aguardando achados da homologação | — | — |

## Como reportar um bug (para o agente)

1. Cenário # da tabela  
2. Esperado × obtido  
3. Loja / usuário / horário  
4. Screenshot ou ID venda/documento  
5. Passos de reprodução  

O agente responde só no protocolo War Room acima.
