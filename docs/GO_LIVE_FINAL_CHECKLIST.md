# Go-Live — Checklist Final de Pendências

> **Natureza:** artefato de fechamento da Rodada R1. Somente leitura.
> **Data:** 2026-08-04
> **Escopo:** apenas quatro grupos. **Não repete o conteúdo das auditorias v1/v2/v3** — quem
> quer o detalhe de um ticket vai a `docs/auditoria/`. Aqui está o que ainda **falta acontecer**.
> **Regra de Evidência:** nada marcado como concluído sem evidência verificável.

---

## Grupo 1 — Decisões pendentes

**Três. Nenhuma é ADR. Nenhuma bloqueia os Pacotes 1–6.**

| # | Decisão | Quem decide | O que exatamente responder | Bloqueia |
|---|---|---|---|---|
| **PF-01** | Faixa válida de preço e comparador atacado × varejo | Direção (produto) | Preço válido é `> 0` ou `>= 0`? Atacado × varejo é `<` ou `<=`? | TB-02, TB-03 (fora de R1) |
| **PF-02** | Fuso horário de verdade na agregação diária de vendas | Direção (produto) | Fuso configurável da loja **ou** fuso do servidor? *Recomendação técnica registrada: fuso da loja* | SSOT-03 (fora de R1) |
| **PF-03** | Modo de crédito padrão no backfill de ADR-003 | Direção (produto) | Confirmar `AVISO` como padrão (já é o esclarecimento normativo de ADR-003) | parte de BR-01 |

**Custo de decidir:** uma sessão. **Custo de não decidir:** três tickets permanecem fora de R1
indefinidamente, e PF-03 força o Pacote 5 a parar no meio do backfill.

**Decisão de escopo — não é decisão funcional:** Go-Live com ou sem emissão fiscal (FLX-02).
A infraestrutura está construída; o cron está desagendado (mig 285). Não bloqueia código.

---

## Grupo 2 — Implementações pendentes

Os 7 pacotes (0–6) do `GO_LIVE_IMPLEMENTATION_GUIDE.md`. **Nenhum iniciado.** Ordem obrigatória.

| Pacote | Tickets | P | Estado |
|---|---|---|---|
| **0 — Dados e Parametrização** | **F3-001, F1-01, F1-02, F1-04, F1-06, F1-14** | **P0** | Não iniciado |
| 1 — Segurança de execução | SEC-01, SEC-02, SSOT-01, TB-01, **F1-07, F1-08, F6-PER-001, FRN-03** | P0 | Não iniciado |
| 2 — Integridade de dados | DAT-01, FLX-01, CA-01, DAT-03, DAT-02 | P0/P1 | Não iniciado |
| 3 — Fornecedor multi-tenant | TB-05, **F2-FOR-001** | P0/P1 | Não iniciado |
| 4 — Compra e Recebimento | FLX-04 | P1 | Não iniciado |
| 5 — Financeiro e Crédito | TB-07, BR-01, BR-03, **F1-05** | P1 | Não iniciado |
| 6 — Caixa, Cadastro, Auditoria e Coerência | BR-04, TB-04, TB-06, SSOT-04, FLX-03, SSOT-05, **F6-CMP-001, F6.1-VEN-001, F6-AUD-001, F6.1-VEN-002, F6-INF-001**, SSOT-02 | P1/P2 | Não iniciado |

### Pendências antes registradas **fora dos pacotes** — agora absorvidas

> **Atualização de 2026-08-05.** As quatro pendências operacionais abaixo estavam declaradas
> como "fora dos 6 pacotes". Na consolidação, **todas foram absorvidas** pelo guia de
> implementação. Deixam de ser pendência declarada e passam a ser item de pacote.

| # | Pendência | Origem | **Destino** |
|---|---|---|---|
| **OP-A** | 7 de 7 lojas sem CNPJ, razão social, IE e endereço | F1-01 | **Pacote 0** |
| **OP-B** | Formas de pagamento hardcoded — sem tabela parametrizável | F1-05 | **Pacote 5** |
| **OP-C** | 5 de 7 lojas sem linha em `pdv_config` | F1-04 | **Pacote 0** |
| **OP-D** | Trilha de auditoria não cobre cadastro (só 6 tipos, todos operacionais) | B1 / F6-AUD-001 | **Pacote 6** (após validação F5) |

**OP-A e OP-C são preenchimento de dados**, executáveis hoje, sem código — por isso abrem o
Pacote 0. **OP-B e OP-D são produto**, e por isso ficam mais adiante na fila.

**Restam fora de qualquer pacote (pós-R1):** os itens de qualidade de dado da série F
(F1-09..13, F1-15/16, F2-PROD-001/002/004..010, F2-CLI-001, F2-USR-001, F2B-01/02,
F5-VAL-01..15, F6-VAL-001, F6.1-PROD-001). Nenhum bloqueia Go-Live — ver mapa de absorção
em `GO_LIVE_IMPLEMENTATION_GUIDE.md` §4.

---

## Grupo 3 — Testes pendentes

**16 das 35 RNs sem teste automatizado.** Detalhe por RN em `docs/MATRIZ_RASTREABILIDADE.md` §4.

| Prioridade | RNs sem teste | Por que importa |
|---|---|---|
| **Alta — serão tocadas em R1** | RN-009 (P4c.3), RN-031/032/035 (P4c.5), RN-034 (P4c.6), RN-033 (P4c.4) | Correção sem teste = status "Em Implementação" permanente pela Regra de Evidência |
| **Média — regra vigente sem rede de proteção** | RN-002, RN-008, RN-011, RN-014, RN-027 | Regra correta hoje; nada impede regressão silenciosa amanhã |
| **Baixa — invariante estável de banco** | RN-015, RN-017, RN-024, RN-026, RN-030 | CHECK/trigger já protege; teste é confirmação, não defesa |

### Testes de sistema ainda não evidenciados

| Item | Estado |
|---|---|
| Ensaio de **restore** de backup (RPO ≤ 24h, RTO ≤ 4h) | **Nunca executado com evidência** |
| Ensaio de **rollback** em staging | Playbook existe (`ROLLBACK_HOTLINE_PLAYBOOK.md`); ensaio não evidenciado |
| `relatorio_consistencia_vendas` sem divergência no período de homologação | Não verificado |
| CI do GitHub Actions | Sem runner por billing — validação hoje é local |

**Regra que decorre disso:** enquanto o restore não for ensaiado, o pilar Operação SaaS não sai
de 1/5, independentemente de quantos pacotes fecharem.

---

## Grupo 4 — Riscos conhecidos

Somente riscos **reais e ativos**. Riscos já mitigados foram removidos desta lista.

| # | Risco | Severidade | Por que é real | Mitigação prescrita |
|---|---|---|---|---|
| **R1** | Migration que "consta aplicada" sem efeito no banco | **Alta** | **Já aconteceu** com `20260730093000` — duas partes falharam em silêncio | Aceite por introspecção (`pg_get_functiondef`, `pg_constraint`, `pg_policies`), nunca por registro de migration |
| **R2** | Backfill de `fornecedores.loja_id` sem loja inferível | **Alta** | `ordens_compra.fornecedor_id` é `ON DELETE SET NULL`; operação irreversível | Parar e reportar. Nunca atribuir loja por conveniência |
| **R3** | Quebrar o PDV offline ao "corrigir" o espelho de pricing | **Alta** | Um agente obediente ao Princípio 1 remove o espelho | `pricing-rpc-guard.mjs` + golden tests obrigatórios em qualquer PR de preço |
| **R4** | Custo zero fantasma escapando por relatório/export | Média | 66 de 113 produtos sem custo; ADR-007 é absoluta e ainda não propagada | Varredura de `relatorio_margem_por_venda_periodo` e `relatorio_curva_abc_periodo` |
| **R5** | Numeração de migrations com 3 padrões conflitantes | Média | Ordem de aplicação ambígua entre ambientes (DAT-02) | `npm run guard:migrations` antes de escrever qualquer migration |
| **R6** | Correção sem teste em RN não coberta | Média | 16 RNs sem teste; 6 delas serão tocadas em R1 | Criar o teste junto com a correção (Cap. 9, item 3) |
| **R7** | Regressão de imutabilidade de caixa ao implementar ADR-005 | Média | Reabertura conflita com a mig 206 se mal implementada | Teste de que histórico não é apagado; trilha obrigatória |
| **R8** | Agente refatorando além do pedido | Baixa | Base legada extensa e tentadora | Regra 6 de conduta + `.cursor/rules/governance.mdc` |
| **R9** | Documento superado sendo consultado como autoridade | **Reduzida** | `docs/` tem ~105 arquivos na raiz, vários `GO_LIVE_*` sobrepostos | Congelamento declara os 3 documentos de referência de R1. **Mitigado em 2026-08-05:** existe agora **uma única fila de execução** (`GO_LIVE_IMPLEMENTATION_GUIDE.md`); a fila concorrente (`GO_LIVE_MASTER_FIX_PLAN.md`) foi rebaixada a catálogo e suas §§2 e 5 revogadas; `docs/INDEX.md` declara a hierarquia |
| **R10** | Go-Live tecnicamente pronto e comercialmente impossível | **Alta** | Pilar Empresa em 1/5: sem contrato, preço, onboarding ou cancelamento — e loja sem CNPJ (OP-A) | Critério §8.3 do guia é bloqueante; não pode ser dispensado por progresso técnico |

**R10 é o risco que a execução técnica não resolve.** Os 7 pacotes (0–6) podem fechar 100% e o
Go-Live continuar bloqueado. É o mesmo desequilíbrio que o EMS aponta: Produto 4/5 e
Engenharia 4/5 contra Operação 1/5 e Empresa 1/5.

---

## Condição de encerramento deste checklist

Este documento é considerado resolvido quando:

1. PF-01, PF-02 e PF-03 tiverem decisão registrada;
2. os 7 pacotes (0–6) estiverem fechados com evidência verificada em produção;
3. OP-A a OP-D tiverem sido **executados** dentro dos Pacotes 0, 5 e 6 (destino já definido em 2026-08-05);
4. restore e rollback tiverem sido ensaiados com evidência;
5. os critérios §8.3 do guia (pilar Empresa) estiverem atendidos.

Enquanto qualquer um dos cinco estiver aberto, o status correto do Go-Live é
**"Em Implementação"** — nunca "Pronto".
