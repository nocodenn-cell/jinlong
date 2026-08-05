# Arquitetura da Camada de IA — Jinlong ERP

> 🟡 **PROPOSTA NÃO RATIFICADA — fora da fila de execução R1.**
> Condições e pré-requisitos: ver o cabeçalho de `AI_CONSTITUTION.md`.
>
> 🚫 **§3.1 é inexequível no estado atual do repositório.** A arquitetura alvo elege
> `.agents/skills/` como *"ÚNICO diretório de skills"* e coloca ali o skill árbitro `jinlong`.
> Esse diretório está no **`.gitignore:73`**, com comentário declarando intenção
> (*"Tooling local (skills/plans do Agent — não versionar)"*). Verificado por `git check-ignore`.
> Consequência: o árbitro não sobreviveria a `git clone`, CI ou worktree.
> **Adotar esta arquitetura exige revogar antes aquela decisão de `.gitignore`** — o que é
> decisão da direção, não efeito colateral. Achado `A-01` / `CIC-04` (Críticos) em
> `AUDITORIA_CONSTITUICAO_R2.md`.
>
> ✅ **O que já vale como decisão registrada:** §1.1 — PDV, fiscal, auditoria, observabilidade,
> eventos e multiempresa são **capítulos de um único skill**, não skills separados. Isso
> **revoga** a Onda 3 de `PLANO_CONSOLIDACAO_SKILLS.md` e o nível N4 de `MAPA_HIERARQUIA_SKILLS.md`.
> **Teto vigente: ≤4 skills internos** (não 6).

> **Natureza:** projeto arquitetural. Nenhum arquivo existente foi alterado; nenhum skill foi criado.
> **Base:** `AI_CONSTITUTION.md`, `AI_GOVERNANCE.md` · **Insumo:** auditoria de 2026-08-05

---

## 1. Crítica à auditoria (obrigatória antes de projetar)

A auditoria foi correta no diagnóstico e **errada na dose do remédio**. Três críticas.

### 1.1 Ela cria skills demais — sim

A auditoria propôs criar `jinlong-pdv`, `jinlong-fiscal`, `jinlong-auditoria`, `jinlong-golive`, `jinlong-producao`, mais seções, mais um canônico de Go-Live. Isso levaria a camada interna de 2 para 6–7 skills.

**Por que está errado:** o problema diagnosticado foi *proliferação sem hierarquia*. Responder com mais artefatos trata o sintoma (falta de cobertura) e agrava a causa (superfície de manutenção). Cobertura documental não foi o gargalo — **arbitragem** foi.

**Correção:** PDV, fiscal, auditoria, observabilidade, eventos e multiempresa são **capítulos de um único skill oficial**, não skills separados. Eles compartilham o mesmo vocabulário, a mesma precedência e o mesmo leitor. Separá-los recria o problema com nomes melhores.

### 1.2 Ela resolve sintomas onde deveria atacar causas

| Sintoma tratado | Causa real | Correção proposta aqui |
|---|---|---|
| C-02 rótulo `P4` ambíguo | Nenhuma reserva de vocabulário | Art. 3 reserva `P1`–`P6` + guard |
| C-04 stack divergente | Prosa autorizada a declarar stack | Art. 15 proíbe + guard |
| C-06 escopo obsoleto | Arquivo de ferramenta pôde declarar escopo | Art. 14 proíbe + guard |
| C-01 doc normativo untracked | Nenhuma verificação de versionamento | Guard de rota de instrução |
| 4 diretórios | Cada agente trouxe o seu | Anti-padrão explícito + teto |

A auditoria corrigiria os 9 conflitos atuais. Esta arquitetura impede que a **classe** deles reapareça — que é a diferença entre limpar e consertar.

### 1.3 Riscos que a auditoria não declarou

| Risco | Avaliação | Mitigação adotada |
|---|---|---|
| **Burocracia** | **Real e alto.** 4 documentos de governança para um projeto solo-dev pré-Go-Live é desproporcional se virarem processo | Constituição é curta e estável; o trabalho vivo são os guards. Revisão trimestral com teto de 1h |
| **Manutenção excessiva** | **Real.** Cada artefato tem custo perpétuo | Teto rígido: ≤4 skills internos, ≤2 diretórios |
| **Arquitetura bonita e pouco usada** | **O maior risco de todos** | Métrica-mestra de 2 minutos; skill não invocado em 90 dias vira candidato a arquivamento |
| **Governança competir com entrega** | Real em pré-Go-Live | Onda 0 (4 correções de uma linha) entrega 80% do valor; o resto é incremental |

> **Julgamento honesto:** se apenas a Onda 0 for executada e o resto destes documentos ficar parado, o projeto ainda assim terá melhorado substancialmente. Uma arquitetura que só funciona se tudo for implementado é uma arquitetura frágil.

---

## 2. Princípio de projeto

> **A menor camada de IA que ainda impede regressão arquitetural.**

Três consequências:

1. **Guards absorvem o máximo.** Texto é o que sobra do que não dá para verificar.
2. **Um skill oficial, muitos capítulos.** Domínio novo = capítulo, não arquivo.
3. **Dois diretórios, teto rígido.** Agente novo não traz diretório: usa os existentes.

---

## 3. Arquitetura alvo

### 3.1 Estrutura

```
Jinlong — Camada de IA (alvo)

.agents/skills/                    ← ÚNICO diretório de skills
│
├── jinlong/                       ← 1 SKILL OFICIAL (interno) — o árbitro
│   ├── SKILL.md                   ← constituição operacional + gates + precedência
│   └── references/
│       ├── dominio-pdv.md         ← capítulo: bip, ACK, latência, offline
│       ├── dominio-fiscal.md      ← capítulo: fila, DLQ, idempotência, P4
│       ├── dominio-financeiro.md  ← capítulo: caixa, E(c), atomicidade
│       ├── dominio-estoque.md     ← capítulo: writers, kardex, movimento
│       ├── auditoria-e-observabilidade.md
│       ├── multiempresa-e-eventos.md
│       └── operacao-e-incidentes.md ← absorve o debug de produção
│
├── jinlong-design/                ← 2 apresentação (marca, UI kit)
│
├── supabase/                      ← vendor (lock por hash, não editar)
├── supabase-postgres-best-practices/
└── supabase-server/

.cursor/rules/                     ← ÚNICO outro diretório: 3 rules alwaysApply
├── governance.mdc
├── security.mdc
└── entity-ssot.mdc

docs/                              ← DOCUMENTAÇÃO (autoridade, não skill)
├── arquitetura/                   ← constituição, governança, esta arquitetura
├── adr/                           ← decisões estruturais
├── ARQUITETURA_REGRAS_NEGOCIO.md  ← autoridade funcional congelada
└── _historico/                    ← legado, nunca instrução

scripts/ + pdv-importados/scripts/ ← GUARDS (a camada que decide de fato)
```

### 3.2 Respostas diretas

| Pergunta | Resposta |
|---|---|
| **Quantos diretórios?** | **2** — `.agents/skills/` e `.cursor/rules/` |
| **Quantos skills?** | **5** — 2 internos + 3 vendor |
| **Quais oficiais?** | `jinlong` (árbitro) e `jinlong-design` |
| **Quais vendors?** | `supabase`, `supabase-postgres-best-practices`, `supabase-server` |
| **Quais internos?** | Os 2 oficiais; nenhum outro |
| **Quais só documentação?** | Constituição, governança, ADRs, Regras de Negócio, `docs/**` |
| **Onde vive o processo?** | Capítulo de `jinlong` + `governance.mdc`; não é skill próprio |
| **Onde vive o debug de produção?** | Capítulo `operacao-e-incidentes.md` |

### 3.3 Comparativo

| Métrica | Hoje | Auditoria propunha | **Alvo** |
|---|---|---|---|
| Diretórios de descoberta | 4 | 2 | **2** |
| Skills internos | 3 dispersos | 6–7 | **2** |
| Vendor | 3 | 3 | **3** |
| Autoridade declarada | ❌ | Parcial | **Constituição** |
| Conflitos Críticos | 3 | 0 (pontual) | **0 + classe impedida** |
| Guards de instrução | 0 | 3 | **5** |

### 3.4 Por que um skill com capítulos vence vários skills

| Critério | Vários skills | Um skill + capítulos |
|---|---|---|
| Precedência entre eles | Precisa ser declarada e mantida | Implícita: um documento, uma ordem |
| Conflito interno | Possível e invisível | Detectável na leitura |
| Vocabulário | Diverge com o tempo | Compartilhado por construção |
| Descoberta pelo agente | Precisa escolher o certo | Um ponto de entrada |
| Custo de manutenção | N arquivos, N frontmatters | 1 índice, capítulos sob demanda |
| Carregamento de contexto | Igual (capítulos são lidos sob demanda) | Igual |

O único argumento real a favor de separar seria economia de contexto — e ele **não se aplica**, porque capítulos em `references/` já são carregados sob demanda. Separar traria o custo sem o benefício.

---

## 4. Fluxo de decisão do agente

```
Tarefa recebida
   │
   ├─ 1. Qual domínio?  → capítulo correspondente em jinlong/references/
   ├─ 2. Existe autoridade declarada?  → NÃO ⇒ PARAR (Art. 21)
   ├─ 3. Conflito entre autoridades?   → SIM ⇒ Art. 12; empate ⇒ PARAR (Art. 17)
   ├─ 4. Gate universal (Art. 20)      → critério falho ⇒ declarar trade-off
   ├─ 5. Implementar mínimo suficiente
   ├─ 6. Guards + testes               → vermelho ⇒ corrigir, NUNCA contornar (Art. 18)
   └─ 7. Reportar com evidência        → sem evidência ⇒ "Em Implementação" (Art. 7)
```

Sete passos, cabem na cabeça, não dependem de fornecedor.

---

## 5. Como esta arquitetura impede reincidência

| Falha histórica | Impedimento estrutural |
|---|---|
| Agente novo traz diretório novo | Teto de 2 + anti-padrão + guard |
| Regra duplicada em 3 lugares | Art. 6 + guard de duplicação |
| Rótulo reutilizado com outro sentido | Art. 3 reserva vocabulário + guard |
| Stack em prosa envelhece | Art. 15 + guard de coerência |
| Escopo declarado em arquivo de ferramenta | Art. 14 + guard |
| Autoridade fora do git | Guard de rota de instrução |
| Proliferação de skills | Teto ≤4 + regra "capítulo, não arquivo" |
| Documento vira literatura | Todo gate termina em comando verificável |

---

## 6. Trajetória

| Etapa | Esforço | Entrega |
|---|---|---|
| **0 — Destravar** | ~1h | Versionar autoridade; corrigir caminho; remover escopo obsoleto |
| **1 — Ratificar** | ~2h | Direção aprova a constituição |
| **2 — Consolidar o árbitro** | ~4h | Skill `jinlong` com gates + precedência |
| **3 — Guards de instrução** | ~1 semana | 5 guards que tornam os artigos executáveis |
| **4 — Absorver capítulos** | incremental | Um capítulo por vez, sob demanda real |
| **5 — Unificar diretórios** | ~3h | Ponteiros nos caminhos antigos |

**Ordem inegociável:** guards (etapa 3) **antes** de capítulos (etapa 4). Escrever mais texto antes de tornar o texto existente executável repete o erro que a auditoria diagnosticou.

---

## 7. Critérios de sucesso

- [ ] Agente encontra a precedência em <2min de qualquer ponto de entrada
- [ ] Nenhum domínio sem autoridade declarada
- [ ] ≤2 diretórios, ≤4 skills internos
- [ ] Toda regra crítica com guard ou rotulada como recomendação
- [ ] 0 conflitos Críticos, e a classe impedida por construção
- [ ] Revisão trimestral em <1h
- [ ] Constituição sobrevive à troca de qualquer fornecedor sem emenda

> Enquanto qualquer item estiver aberto, o status é **"Em Implementação"** (Art. 7).
