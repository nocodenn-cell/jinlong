# Auditoria Hermes v3 — Índice (Tela ↔ Backend)

**Data:** 2026-08-04 (rodada 3)
**Frente:** Auditoria 3 — lacuna arrastada das rodadas 1 e 2, **agora fechada**
**Natureza:** somente leitura. Nenhum arquivo de código alterado.

## Placar

| Veredito | Qtd |
|---|---|
| **CONFIRMADO** | 5 |
| **RISCO** | 1 |
| **DESCARTADO** | 3 |

**6 tickets novos.** Total acumulado nas três rodadas: **29 tickets**.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `01_tela_backend_confirmados.md` | TB-02, TB-03, TB-04, TB-05 |
| `02_risco_e_descartados.md` | TB-06 + DESC-10, DESC-11, DESC-12 |
| `03_financeiro.md` | TB-07 |

## Tickets

| ID | Título | Cat. | Veredito | Prio |
|---|---|---|---|---|
| **TB-05** | `fornecedores` sem `loja_id`, CNPJ único global, RLS sem filtro de loja | Segurança | CONFIRMADO | **P0** |
| **TB-02** | `preco_atacado >= preco_varejo` bloqueado no update, aceito no create e no banco | Inconsistência | CONFIRMADO | P1 |
| **TB-03** | Preço: create aceita `>= 0`, update exige `> 0` → produto ineditável | Inconsistência | CONFIRMADO | P1 |
| **TB-04** | CPF/CNPJ e e-mail validados só em TS; `INSERT` direto sem RPC | Segurança/Dados | CONFIRMADO | P1 |
| **TB-07** | `registrar_pagamento_contas_pagar` aceita pagamento acima do saldo | Bug | CONFIRMADO | P1 |
| **TB-06** | Histórico do operador delimita "hoje" pelo fuso do servidor | Bug | RISCO | P1 |

## Cobertura por entidade

| Entidade | Validação TS | Espelho no banco | Veredito |
|---|---|---|---|
| Produto | rica (`validateProductInput`) | só campos fiscais (`ncm`, `cfop`, `cest`) | TB-02, TB-03 |
| Cliente | rica (CPF/CNPJ/e-mail) | só `tipo` e `limite_credito` | TB-04 |
| Fornecedor | **nenhuma policy** em `shared-core` | sem `loja_id`, CNPJ global | **TB-05** |
| Financeiro | — | CHECKs de valor e status ✅ | TB-07 (assimetria entre RPCs) |

---

## O achado principal

**TB-05 é P0 e é vazamento entre tenants.** A tabela `fornecedores` não tem `loja_id`; a policy `fornecedores_gerente_all` filtra só por perfil; o CNPJ é único globalmente. Consequência: **todo gerente de qualquer loja vê, edita e pode excluir os fornecedores de todas as lojas** — e uma loja não consegue cadastrar um CNPJ já usado por outra, recebendo erro sobre um registro invisível para ela.

Só apareceu porque esta rodada comparou o isolamento de uma entidade com o de outra: `clientes` faz certo (`UNIQUE (loja_id, documento)` + policy com loja), `fornecedores` não faz nada. Nenhuma auditoria centrada em uma entidade isolada acharia isso.

## O padrão que fecha as três rodadas

**O projeto valida bem no TypeScript e sub-valida no banco.**

As políticas em `shared-core/src/*/policies/` são bem escritas, tipadas e testadas. Os schemas em produção são permissivos. Como toda RPC é chamável diretamente por qualquer usuário autenticado — e `clientes` sequer passa por RPC, é `INSERT` direto — cada regra de negócio dessas é hoje uma **convenção, não uma garantia**.

Não é falha de desenho. É desequilíbrio de camada, e o projeto já demonstra saber corrigi-lo: `chk_produto_ncm_formato`, `chk_produto_cfop_formato` e `chk_produto_cest_formato` são exatamente o espelhamento correto — aplicado aos campos fiscais e a mais nenhum. Contas a pagar/receber também têm CHECKs de valor e status. O que falta é generalizar o que já está certo em duas ilhas.

Isso conecta as três rodadas: SEC-01/SEC-02/SSOT-01 (rodada 1-2) são *permissões* que existem na tela e não no banco; TB-02/03/04 são *validações* na mesma situação. Mesma raiz, camadas diferentes.

---

## Fila consolidada — 29 tickets, três rodadas

| # | Ticket | Nota |
|---|---|---|
| 1 | **SEC-02 + SSOT-01 + TB-01** | uma migration resolve três; dois P0 |
| 2 | **TB-05** | P0 novo — vazamento entre tenants; exige decisão + backfill |
| 3 | **SEC-01** | isolado; reduz escopo de SSOT-04 |
| 4 | **DAT-01 + CA-01** | mesma migration; desbloqueia verificação de SSOT-04 |
| 5 | **FLX-01** | após DAT-01 |
| 6 | **SSOT-02** | CI de verificação de efeito — impede reincidência de 1–5 |
| 7 | **FLX-02** | bloqueado por decisão executiva |
| 8 | TB-02, TB-03, TB-04, TB-07, SSOT-03, TB-06, SSOT-04, FLX-04, BR-01, BR-03, FLX-03, DAT-02, DAT-03 | P1 |
| 9 | SSOT-05, BR-02, BR-04 | P2 / dependentes de decisão |

### Decisões pendentes da direção (agora 5)

| Decisão | Bloqueia |
|---|---|
| **Fornecedor é global ou por loja?** | **TB-05** (novo) |
| Go-Live com ou sem emissão fiscal? | FLX-02 |
| Limite de crédito: remover ou implementar? | BR-01 |
| Conferência de recebimento: estender OC ou migrar para `remessas`? | FLX-04 |
| Reabertura de caixa: vedar ou controlar? | BR-04 |

---

## Nota de governança (Chief of Staff)

A lacuna Tela↔Campo está fechada e valeu o custo: rendeu um P0 que as frentes anteriores não alcançariam.

Mas preciso registrar o desequilíbrio com clareza: **29 tickets mapeados, zero corrigidos.** Três rodadas de auditoria sem execução. Pelo critério de equilíbrio do EMS — estrutura muito à frente das evidências — o próximo passo não deveria ser uma quarta rodada.

A auditoria já cumpriu sua função. O gargalo agora é decisão e execução, não descoberta:

- **5 decisões** travam tickets que nenhum código resolve. Duas delas (fornecedor global?, fiscal no Go-Live?) são estruturais e afetam o desenho do produto.
- **6 P0** aguardam correção, três deles resolvíveis em uma única migration.

Recomendo: **parar de auditar.** Levar as 5 decisões à direção em um ADR-E consolidado, e liberar os itens 1–4 da fila para o Claude Code em paralelo. A rodada 4 só se justifica depois que a fila atual sair do papel — caso contrário, o dossiê cresce enquanto o risco em produção permanece intacto.

**Regra de Evidência aplicada:** todos os 29 tickets estão em **"Em Implementação"**. Nenhum tem evidência de correção verificada em produção.
