# Plano de Modularização da Documentação de Regras de Negócio

> **Natureza:** plano. **Nada é executado nesta rodada.**
> `docs/ARQUITETURA_REGRAS_NEGOCIO.md` permanece **congelado e íntegro** (587 linhas, v2.1).
> **Data:** 2026-08-04
> **Gatilho de execução:** início de R2, após o Pacote 6 fechar com evidência.

## 1. Por que ainda não dividir

Registrado para que a divisão não seja antecipada por impulso de organização.

| Motivo | Detalhe |
|---|---|
| **O documento está congelado** | Dividir é alterá-lo. Congelamento vale até o fim de R1 |
| **Claude Code implementa contra ele agora** | Trocar a referência no meio da execução é o cenário clássico de agente lendo arquivo superado |
| **11 RNs vão mudar de estado durante R1** | `Divergente → Vigente`. Dividir antes multiplica o número de arquivos que precisam ser atualizados a cada evidência |
| **500 linhas não é o problema real** | 587 linhas com índice e capítulos numerados ainda é navegável. O custo aparece por volta de 900–1000 |
| **`docs/` já tem alta densidade de documentos sobrepostos** | Observação registrada no encerramento da fase. Dividir agora *aumenta* a superfície antes de resolver a causa |

**Critério objetivo para executar a divisão** — todos simultaneamente:

1. R1 encerrada com os 7 pacotes (0–6) fechados e evidência verificada em produção;
2. Cap. 7 estabilizado (nenhuma RN em `Divergente` sem ticket ativo);
3. O documento tiver ultrapassado **900 linhas** ou algum capítulo isolado passar de 250.

Enquanto os três não coincidirem, **manter arquivo único**.

---

## 2. Divisão proposta

Estrutura futura: `docs/regras/` (nova pasta; não confundir com `docs/regras-negocio/`, que
guarda material histórico de autoridades P1 e **não deve ser reutilizada** — nomes parecidos
com conteúdos diferentes são exatamente a armadilha que a modularização deve evitar).

| # | Arquivo | Conteúdo de origem | Linhas aprox. |
|---|---|---|---|
| **01** | `01-REGRAS-GERAIS.md` | Cap. 1 (Princípios 1–6), Cap. 1-A (precedência P1–P6), "Como usar" | ~130 |
| **02** | `02-COMERCIAL.md` | Venda, preço, promoção, desconto, comissão: RN-001, 006, 007, 020, 024, 028, 029, 035 · fluxo de Venda (Cap. 6) | ~90 |
| **03** | `03-ESTOQUE.md` | RN-005, 011, 013, 033 · fluxo de Compra · estados de OC e Recebimento | ~80 |
| **04** | `04-FINANCEIRO.md` | RN-003, 025, 026, 032, 034 · estados de Caixa, Contas a Pagar/Receber | ~80 |
| **05** | `05-FISCAL.md` | RN-002, 014, 027 · máquina de estados fiscal · justificativa de Fiscal em P4 | ~60 |
| **06** | `06-MULTITENANT.md` | Cap. 5 · RN-009, RN-016 · padrão `loja_id` + FK + UNIQUE + RLS | ~50 |
| **07** | `07-AUDITORIA.md` | RN-015, RN-021, RN-022 · imutabilidade de histórico (ADR-005) | ~50 |
| **08** | `08-ADRS.md` | Cap. 8 integral: ADR-001…007 + esclarecimentos normativos + PF-01/02/03 | ~120 |
| **09** | `09-TESTES-E-GATES.md` | Cap. 9 · os 10 gates executáveis · Regra de Evidência | ~60 |

**Total estimado:** ~720 linhas distribuídas — menos que as 587 atuais somadas ao índice, porque
a divisão elimina repetição de contexto entre capítulos.

---

## 3. Regras invioláveis da divisão futura

Sem elas, modularizar cria o problema que pretende resolver.

1. **O arquivo-mãe não desaparece.** `ARQUITETURA_REGRAS_NEGOCIO.md` vira **índice normativo**:
   Cap. 1 resumido, tabela de autoridade (Cap. 2) **integral** e ponteiros para os 9 arquivos.
   Cap. 2 é a peça que não pode fragmentar — é o mapa de fonte única.
2. **Cada RN vive em exatamente um arquivo.** RN citada em outro módulo é **link**, nunca cópia.
   Duplicar uma RN é criar duas fontes de verdade sobre a fonte de verdade.
3. **Numeração permanente preservada.** `RN-014` continua `RN-014` esteja onde estiver. A divisão
   é física, não semântica.
4. **Um único histórico de versão**, no arquivo-mãe. Nove históricos paralelos é rastreabilidade
   perdida.
5. **A divisão é uma PR única**, sem alteração de conteúdo normativo — `git diff` deve mostrar
   apenas movimentação de texto. Qualquer mudança de regra na mesma PR invalida a revisão.
6. **Atualizar todas as referências cruzadas na mesma PR:** `GO_LIVE_IMPLEMENTATION_GUIDE.md`,
   `ENCERRAMENTO_FASE_ARQUITETURA.md`, `MATRIZ_RASTREABILIDADE.md`, `.cursor/rules/entity-ssot.mdc`,
   `docs/INDEX.md`. Referência quebrada é o modo de falha mais provável desta operação.

---

## 4. Sequência de execução (quando autorizada)

| Passo | Ação | Verificação |
|---|---|---|
| 1 | Criar `docs/regras/` com os 9 arquivos, **recortando** texto — nunca reescrevendo | `git diff --stat` mostra só movimentação |
| 2 | Reduzir o arquivo-mãe a índice + Cap. 2 integral | Cap. 2 idêntico ao original |
| 3 | Atualizar as 5 referências cruzadas do §3.6 | `grep -rn "ARQUITETURA_REGRAS_NEGOCIO" docs/` sem link órfão |
| 4 | Conferir que as 35 RNs aparecem **uma vez cada** | contagem por `grep -c "RN-0"` por arquivo |
| 5 | Registrar no histórico do arquivo-mãe como **v3.0 — modularização, zero mudança normativa** | — |

**Risco principal da operação:** perda silenciosa de conteúdo no recorte. Mitigação: contar as
35 RNs, as 7 ADRs e os 6 princípios antes e depois. Se qualquer contagem divergir, reverter a PR
inteira — não corrigir pontualmente.

---

## 5. O que este plano NÃO propõe

- Não propõe reorganizar `docs/` como um todo (105 arquivos na raiz de `docs/` é assunto
  separado, já registrado como observação no encerramento da fase).
- Não propõe mover ADRs técnicas de `docs/adr/` — as duas séries permanecem disjuntas.
- Não propõe renomear nem consolidar `docs/regras-negocio/`, `docs/architecture/` ou
  `docs/auditoria/`.
- Não propõe alterar **uma linha** de conteúdo normativo.
