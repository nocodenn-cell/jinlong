# Certificado de Congelamento da Arquitetura — Rodada R1

> **Natureza:** certificado de fechamento. Somente leitura. Nenhuma regra, ADR ou decisão alterada.
> **Data de emissão:** 2026-08-04
> **Escopo certificado:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md` v2.1 (587 linhas), 35 RNs, 7 ADRs.
> **Método:** verificação cruzada entre o documento normativo, a validação de coerência, o guia de
> implementação, o encerramento de fase e os artefatos de rastreabilidade emitidos nesta missão.

---

## 1. Respostas objetivas

### 1.1 Existe alguma contradição restante?

**Não.**

Seis contradições foram identificadas ao longo da fase e **todas foram resolvidas** antes deste
congelamento:

| ID | Contradição | Resolvida em |
|---|---|---|
| C1 | Princípio de fonte única × espelho offline de pricing | v2.0 — exceção arquitetural documentada, com guard e golden tests |
| C2 | Cap. 3 definia 5 estados de Produto; banco tem 3 | v2.0 — alinhado a `DRAFT/PUBLICADO/INATIVO` |
| C3 | ADR-004 listada como pendente, mas já implementada | v2.0 — ratificada com referência à mig `20260801120000` |
| I-01 | Cap. 5 tratava ADR-001 aprovada como bloqueio | v2.1 |
| I-02 | Cap. 6 tratava ADR-004 aprovada como bloqueio; diagrama sem conferência | v2.1 |
| I-03 | Afirmava um único parâmetro pendente; são três | v2.1 |

**Verificação desta missão:** nenhuma contradição nova encontrada. As tensões que permanecem
entre regras (fonte única × espelho offline; venda sem NCM × exigência fiscal; produto sem custo ×
margem mínima; produto sem fornecedor × compra com fornecedor; reabertura de caixa × imutabilidade)
**não são contradições** — são resolvidas deterministicamente pela hierarquia P1–P6 do Cap. 1-A,
e estão registradas como tensões legítimas em §11.3.

### 1.2 Existe alguma ADR aberta?

**Não. Zero.**

ADR-001 a ADR-007 estão **aprovadas pela direção em 2026-08-04** e congeladas. Cada uma tem:
decisão, efeito normativo, camadas de implementação, ticket vinculado e bloco de esclarecimento
normativo que elimina ambiguidade de leitura sem alterar a decisão.

A série técnica `docs/adr/ADR-005..010` (fronteiras de domínio) é **disjunta** desta e está
declarada como tal no Cap. 8. Não há colisão de numeração na prática, apenas homonímia declarada.

### 1.3 Existe alguma regra duplicada?

**Não.**

- **Entre RNs:** as 35 são semanticamente distintas. Nenhum par descreve o mesmo fato.
- **Na implementação:** existe **uma** duplicação de cálculo — `calcular_preco_produto` (RPC) e
  `shared-core/src/pricing/calcularPrecoCanonico.ts`. **Não é violação:** é exceção arquitetural
  aprovada, declarada no Cap. 1, protegida por `scripts/pricing-rpc-guard.mjs` e por dois testes
  de paridade. A RPC é a autoridade; o espelho é derivado e bit-a-bit.
- **Regras ativas sem RN:** as 7 detectadas na validação foram catalogadas como RN-023…RN-029.
  A varredura desta missão não encontrou nenhuma outra.

### 1.4 Existe alguma autoridade conflitante?

**Não.**

O Cap. 2 nomeia **uma única autoridade por domínio de regra**, e cada uma foi verificada contra
as 239 migrations e `shared-core`. Nenhuma autoridade é fictícia.

Dois pontos que **parecem** conflito e não são:

| Aparência | Realidade |
|---|---|
| Quatro gerações de `finalizar_venda_transacional` (base, v2, v3, v4) | v2/v3 são stubs `LEGACY_DISABLED_USE_V4` com grants revogados; `guard:rpc` impede uso. Autoridade única = `_v4` (RN-020) |
| Duas RPCs de fechamento de caixa (`fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`) | Canais distintos (web × PDV-local), não implementações concorrentes da mesma regra |

### 1.5 Existe algum SSOT violado?

**Sim — um, conhecido, decidido e com correção liberada.**

| Violação | Onde | Estado |
|---|---|---|
| **`fornecedores` sem `loja_id`** — CNPJ único globalmente, policy filtrando só por perfil | mig `075` | **Decidido por ADR-001.** Ticket TB-05 (P0). Correção liberada no Pacote 3 |

Não é violação em aberto no sentido arquitetural: a decisão existe, o modelo-alvo está definido,
o backfill está especificado e a armadilha (`ON DELETE SET NULL`) está documentada. É **dívida de
execução**, não de arquitetura.

**Nenhum outro SSOT violado.** As demais 10 RNs `Divergente` são lacunas de *implementação* de uma
regra com autoridade única declarada — não são fontes de verdade concorrentes.

### 1.6 Existe alguma decisão arquitetural pendente além de PF-01, PF-02 e PF-03?

**Não.**

**Confirmação formal:** exceto os três parâmetros funcionais abaixo, nenhuma outra decisão
funcional ou arquitetural permanece aberta.

| # | Parâmetro | Natureza | Bloqueia |
|---|---|---|---|
| **PF-01** | Faixa válida de preço (`> 0` / `>= 0`) e comparador atacado × varejo (`<` / `<=`) | Valor numérico | TB-02, TB-03 |
| **PF-02** | Fuso de verdade na agregação diária | Escolha de parâmetro | SSOT-03 |
| **PF-03** | Modo de crédito padrão no backfill de ADR-003 | Confirmação de default (`AVISO`) | parte de BR-01 |

**Nenhum dos três é ADR** — são parâmetros de valor, não escolhas de estrutura. **Nenhum bloqueia
os Pacotes 1–6.**

Fora deste conjunto, um item de **escopo comercial** (não arquitetural): Go-Live com ou sem emissão
fiscal (FLX-02). A infraestrutura está pronta; o cron está desagendado (mig 285).

---

## 2. Quadro-resumo do certificado

| Pergunta | Resposta | Detalhe |
|---|---|---|
| Contradição restante? | **Não** | 6 identificadas, 6 resolvidas |
| ADR aberta? | **Não** | 7 aprovadas, 0 pendentes |
| Regra duplicada? | **Não** | 1 duplicação de cálculo, aprovada e blindada |
| Autoridade conflitante? | **Não** | Autoridade única por domínio, verificada no código |
| SSOT violado? | **Sim — 1** | `fornecedores` (TB-05, P0) — decidido por ADR-001, correção liberada |
| Decisão pendente além de PF-01/02/03? | **Não** | Confirmação formal |

---

## 3. O que este certificado NÃO declara

Delimitação explícita, para que ninguém leia mais do que está escrito.

1. **Não é certificado de Go-Live.** Os critérios de Go-Live (§8 do guia) incluem bloqueantes
   operacionais e comerciais não atendidos — restore não ensaiado, rollback não evidenciado,
   pilar Empresa em 1/5, 7 de 7 lojas sem CNPJ.
2. **Não é certificado de qualidade de código.** 29 tickets permanecem abertos, 6 deles P0.
   Zero corrigidos até esta data.
3. **Não é certificado de cobertura de teste.** 16 das 35 RNs não têm teste automatizado.
4. **Não declara que o cliente está atendido.** `COBERTURA_REQUISITOS_CLIENTE.md` registra
   9 requisitos parciais e 2 não iniciados.

**O que ele declara, e só isso:** a **arquitetura de regras de negócio** está fechada, coerente,
sem contradição e sem decisão pendente além dos três parâmetros nomeados. O implementador pode
executar os 7 pacotes (0–6) sem precisar decidir nada.

---

## 4. Escopo do congelamento

Congelados até o encerramento de R1:

| Documento | Papel |
|---|---|
| `docs/ARQUITETURA_REGRAS_NEGOCIO.md` (v2.1) | Fonte normativa das regras |
| `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` | Plano de execução em 7 pacotes (0–6) |
| `docs/ENCERRAMENTO_FASE_ARQUITETURA.md` | Relatório de encerramento da fase |

**Única alteração permitida durante R1:** a coluna **Estado** do Cap. 7
(`Divergente` → `Vigente`), e apenas mediante evidência verificável em produção.

Qualquer outra necessidade de mudança **encerra R1 e abre R2**.

Artefatos de apoio emitidos nesta missão (não normativos, não congelados):
`MATRIZ_RASTREABILIDADE.md` · `COBERTURA_REQUISITOS_CLIENTE.md` ·
`CATALOGO_EVENTOS_NEGOCIO.md` · `PLANO_MODULARIZACAO_DOCUMENTACAO.md` ·
`GO_LIVE_FINAL_CHECKLIST.md`.

---

# VEREDITO

## 🔒 ARQUITETURA CONGELADA — R1 APTA A EXECUTAR

A fase de arquitetura e preparação está **encerrada**. O indicador que importa a partir desta
data deixa de ser "tickets mapeados" e passa a ser **"tickets fechados com evidência verificada
em produção"**.

**Próxima medição:** ao fim do Pacote 1.
