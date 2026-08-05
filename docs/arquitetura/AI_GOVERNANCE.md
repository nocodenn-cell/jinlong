# AI Governance — Jinlong ERP

> 🟡 **PROPOSTA NÃO RATIFICADA — fora da fila de execução R1.**
> Condições e pré-requisitos: ver o cabeçalho de `AI_CONSTITUTION.md`.
>
> 🔗 **Marcado para FUSÃO em `AI_CONSTITUTION.md`** como Título VI, quando a constituição for
> ratificada. Motivo: ~30% de sobreposição medida (camadas C0–C9, critérios de guard,
> anti-padrões, depreciação em 3 estágios aparecem nos dois). Ver `AUDITORIA_CONSTITUICAO_R2.md`
> §Regras Duplicadas e §Conclusão (*"quatro documentos são dois"*).
> Até lá, **`AI_CONSTITUTION.md` prevalece** em qualquer divergência.
>
> ⚠️ **§5.1 é inexequível hoje:** o versionamento de vendor "por hash de upstream" depende de
> `skills-lock.json`, que está no `.gitignore:62`. Achado `A-03` (Crítico).

> **Natureza:** modelo de governança da camada de IA. Nenhum arquivo existente foi alterado.
> **Base normativa:** `AI_CONSTITUTION.md` · **Companheiros:** `ARQUITETURA_CAMADA_IA.md` · `LIFECYCLE_SKILLS.md`

---

## 1. Modelo RIDE — quem decide, recomenda, informa, executa

Adotamos quatro papéis. Todo artefato da camada de IA tem **exatamente um**.

| Papel | Significado | Pode ser contrariado? |
|---|---|---|
| **D — Decide** | Sua palavra é final no seu domínio | Só por camada superior (Art. 12) |
| **R — Recomenda** | Orienta; pode ser contrariado com trade-off declarado | Sim, com justificativa registrada |
| **I — Informa** | Fornece fatos e contexto; não normatiza | Não se aplica — não manda |
| **E — Executa** | Aplica e verifica; não escolhe | Não decide nada |

### 1.1 Atribuição por artefato

| Artefato | Camada | Papel | Domínio de autoridade |
|---|---|---|---|
| `AI_CONSTITUTION.md` | C0 | **D** | Como se decide; precedência; parada |
| Guards (`npm run guard:*`) | C1 | **D** + **E** | Conformidade verificável |
| Regras de segurança e governança | C2 | **D** | Segredos, escopo, protocolo |
| Regras de Negócio congeladas | C3 | **D** | O que o negócio é |
| ADRs | C3 | **D** | Fronteiras e decisões estruturais |
| SSoT de entidades | C3 | **D** | Onde cada entidade se cadastra |
| Skill oficial Jinlong | C4 | **R** (+ arbitra) | Traduz C0–C3 para o agente |
| Skill de processo | C5 | **R** | Como trabalhar |
| Vendor skills | C6 | **I** | Como a tecnologia funciona |
| Contexto de módulo | C7 | **I** | Onde as coisas estão |
| Agente de IA | C8 | **E** | Propõe e executa; nunca decide |
| Documentos legados | C9 | — | Nada |

### 1.2 A regra que faltava

> **O agente de IA é sempre E. Nunca D.**

Toda a disfunção diagnosticada na auditoria decorre de agentes operando como **D** por ausência de **D** declarado. Onde não há autoridade, o executor assume — e cada agente assume diferente. A governança não restringe a IA: ela **libera** a IA de decidir o que não deveria.

---

## 2. Ownership

### 2.1 Papéis humanos

| Papel | Responsabilidade | Quem |
|---|---|---|
| **Direção / Arquiteto-Chefe** | Ratifica constituição, aprova ADR, resolve conflito entre iguais | Dono do produto |
| **Owner de domínio** | Mantém a autoridade de um domínio e seu guard | Definido por domínio |
| **Revisor** | Verifica evidência antes do merge | Qualquer humano com contexto |
| **Agente** | Propõe, implementa, verifica, reporta | Qualquer IA |

> Em operação solo-dev, um único humano acumula os três primeiros papéis. Isso é aceitável — **desde que os atos sejam distintos**. Aprovar e implementar na mesma ação é o que produz drift. O registro escrito é o que separa os papéis quando a pessoa é a mesma.

### 2.2 Ownership por domínio

Todo domínio tem: **1 autoridade** (arquivo), **1 owner** (humano), **≥1 guard** (quando aplicável). Domínio sem owner é domínio à deriva — e vira lacuna na próxima auditoria.

---

## 3. Autoridade e responsabilidade

| Princípio | Consequência prática |
|---|---|
| Autoridade é declarada, nunca inferida | Um agente não deduz autoridade a partir de código existente |
| Autoridade é única por domínio | Empate é defeito, não pluralismo |
| Autoridade sem enforcement é intenção | Rotular explicitamente como "recomendação" |
| Responsabilidade não delega para IA | O humano que aprova é o responsável, sempre |
| Autoridade tem custo | Quem declara autoridade assume manutenção perpétua |

---

## 4. Revisão

| Tipo | Gatilho | Profundidade |
|---|---|---|
| **Contínua** | Toda PR que toca instrução | O artefato alterado ainda é o mínimo necessário? |
| **Trimestral** | Calendário | Obsolescência, conflitos novos, skills não usados |
| **Por evento** | Troca de agente, upgrade major, incidente de produção | Camada afetada |
| **Auditoria completa** | Anual, ou quando conflitos Críticos > 2 | Tudo |

**Regra de economia:** a revisão trimestral deve ser capaz de rodar em menos de 1 hora. Se não rodar, a camada está grande demais — e a resposta é **remover**, não alocar mais tempo.

---

## 5. Versionamento e compatibilidade

### 5.1 Versionamento

| Artefato | Esquema | Muda quando |
|---|---|---|
| Constituição | `MAJOR.MINOR` | MAJOR: precedência muda · MINOR: esclarecimento |
| Skill oficial | SemVer | MAJOR: regra existente muda de sentido · MINOR: novo capítulo · PATCH: correção |
| Autoridade funcional congelada | Rodada (`R1`, `R2`) | Só por decisão da direção |
| Vendor | Hash de upstream | Nunca editado localmente |
| Guard | Junto com o código | Sempre com teste |

### 5.2 Compatibilidade

Uma mudança de instrução é **breaking** quando inverte precedência, remove autoridade, ou muda o sentido de um rótulo já em uso (o caso `P4` da auditoria é exatamente isso).

Mudança breaking exige: registro do que muda, período de convivência quando viável, e — **obrigatoriamente** — verificação de que nenhum outro artefato depende do sentido antigo.

### 5.3 Depreciação

Três estágios, nunca remoção súbita:

1. **Deprecated** — marcado no topo, aponta o substituto, ainda legível
2. **Ponteiro** — conteúdo removido, resta ≤10 linhas apontando o sucessor
3. **Arquivado** — movido para histórico; deixa de ser instrução

Um artefato só passa de estágio quando o **substituto está vigente e verificado**. Nada é apagado sem sucessor.

---

## 6. Auditoria da própria governança

| Indicador | Meta | Sinal de alarme |
|---|---|---|
| Conflitos Críticos abertos | 0 | ≥1 por mais de um ciclo |
| Domínios sem autoridade declarada | 0 | Qualquer |
| Diretórios de descoberta | ≤2 | ≥3 |
| Skills internos | ≤4 | ≥6 |
| Regras críticas sem guard | ↓ a cada trimestre | Crescendo |
| Skills não invocados em 90 dias | 0 | ≥1 → candidato a arquivamento |
| Tempo da revisão trimestral | <1h | >1h → camada grande demais |

**Métrica-mestra:** *"um agente novo, sem contexto, encontra a árvore de precedência a partir de qualquer ponto de entrada em menos de 2 minutos?"* Se não, a governança falhou — independentemente de quão bons sejam os documentos.

---

## 7. Guards — transformando decisão em garantia

### 7.1 Por que guards são o centro

Guards são a única camada que não depende de o agente ler, entender, lembrar ou obedecer. Documento é intenção; guard é garantia. **A meta da governança é converter o máximo de decisão arquitetural em guard, e reduzir o texto ao mínimo indispensável.**

### 7.2 O que merece guard

Uma regra merece guard quando é: **objetiva** (verificável por máquina), **estável** (não muda toda sprint), **crítica** (violação causa dano real) e **recorrente** (já foi violada ou tem alta chance).

| Regra | Guard? | Racional |
|---|---|---|
| Fronteira entre domínios | ✅ existe | Objetiva, crítica, recorrente |
| Autoridade de pricing (RPC × espelho) | ✅ existe | Paridade verificável |
| Telas oficiais de CRUD | ✅ existe | Padrão detectável |
| Sequência de migration | ✅ existe | Puramente sintática |
| Coerência stack docs × manifesto | 🎯 criar | Objetiva; resolve C-04 permanentemente |
| Regra de negócio duplicada fora da autoridade | 🎯 criar | Ataca a causa do SSoT |
| Autoridade de domínio declarada em arquivo de ferramenta | 🎯 criar | Torna o Art. 14 executável |
| Reserva do rótulo `P1`–`P6` | 🎯 criar | Trivial; resolve C-02 para sempre |
| Rota de instrução não versionada | 🎯 criar | Teria detectado C-01 |
| "Reduz complexidade?" | ❌ | Subjetivo — é gate de revisão |
| "Melhora coesão?" | ❌ | Julgamento humano |
| "Existe solução mais simples?" | ❌ | Não computável |
| Qualidade de prosa da documentação | ❌ | Custo > benefício |

### 7.3 Regra de conversão

> **Toda regra que aparecer em 2 ou mais artefatos de instrução é candidata obrigatória a guard.**

Duplicação de texto é sintoma de que a regra é importante *e* de que ninguém confia que ela seja lida. A resposta correta não é escrever uma terceira vez — é torná-la executável e apagar as cópias.

### 7.4 O que NÃO fazer com guards

- Não criar guard para regra instável (vira ruído e é desabilitado)
- Não criar guard sem mensagem de erro que ensine a correção
- Não criar guard que só roda em CI (deve rodar local, senão é descoberto tarde)
- Não somar guards indefinidamente: cada um tem custo de tempo em cada commit

---

## 8. Anti-padrões proibidos

| Anti-padrão | Por que é proibido |
|---|---|
| Novo agente traz novo diretório de instrução | Foi exatamente assim que a camada chegou a 4 diretórios |
| Copiar ADR dentro de skill | Cria segunda fonte que envelhece em silêncio |
| Regra de negócio em arquivo de ferramenta | Viola Art. 14; produziu C-06 |
| Versão de stack em prosa | Viola Art. 15; produziu C-04 |
| Reutilizar rótulo de escala com outro sentido | Produziu C-02 |
| Autoridade normativa fora do versionamento | Produziu C-01 — o achado mais grave |
| Criar skill para tudo | Superfície cresce, uso cai |
| Documento longo sem comando verificável | Não é instrução; é literatura |
