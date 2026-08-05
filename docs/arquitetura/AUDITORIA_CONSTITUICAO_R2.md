# Auditoria Crítica da Constituição da Camada de IA — R2 (adversarial)

> **Modo:** somente leitura. Nenhum arquivo foi alterado nesta auditoria.
> **Postura:** arquiteto independente contratado para derrubar a proposta, não para validá-la.
> **Data:** 2026-08-05 · **Alvo:** `AI_CONSTITUTION.md`, `AI_GOVERNANCE.md`, `ARQUITETURA_CAMADA_IA.md`, `LIFECYCLE_SKILLS.md` + os 4 documentos da auditoria R1
> **Método:** leitura integral + verificação empírica contra `.gitignore`, `git check-ignore`, `package.json`, `.github/workflows/`, `skills-lock.json`

---

## Resumo Executivo

A arquitetura proposta é **conceitualmente sólida e empiricamente inviável no estado atual do repositório**.

O achado que sozinho derruba a proposta não está em nenhum dos quatro documentos — está no `.gitignore`:

```
.gitignore:62  skills-lock.json
.gitignore:73  .agents/
```

**O diretório eleito como "ÚNICO diretório de skills" pela arquitetura alvo é ignorado pelo git.** Verificado por `git check-ignore -v`:

```
.gitignore:73:.agents/    .agents/skills/supabase/SKILL.md
```

Toda a arquitetura alvo — 2 diretórios, skill oficial `jinlong` como árbitro, capítulos em `references/` — foi projetada dentro de um diretório que não existe para nenhum agente que faça `git clone`. A R1 diagnosticou C-01 (autoridade normativa untracked) como "o achado mais grave" e então **construiu a solução inteira dentro do mesmo defeito**, sem detectá-lo. Isto é um erro de método: a R1 rodou `git status` (que mostra untracked) mas nunca rodou `git check-ignore` (que mostra ignorado deliberadamente).

Segundo achado de mesma gravidade: **os quatro documentos novos não são carregados por nenhum agente**. Verificação por grep em `.cursor/`, `.claude/`, `.agents/`, ambos `.cursorrules` e `skills-lock.json`: **zero referências** a `AI_CONSTITUTION` ou `docs/arquitetura`. Uma constituição que nenhum agente lê não governa nada — é literatura sobre governança. A própria métrica-mestra proposta pela R1 ("agente encontra a precedência em <2min de qualquer ponto de entrada") **falha hoje com valor infinito**.

Terceiro: a proposta apresenta como resultado a redução de "15 artefatos → 9" e "4 diretórios → 2", mas **adicionou 8 documentos** (4 na R1, 4 na R2) sem remover nenhum. O saldo real da governança até agora é **+8 artefatos, 0 conflitos resolvidos, 0 guards criados**. A arquitetura que prega "menor superfície" (Art. 9) aumentou a superfície em 53% antes de reduzir qualquer coisa.

**Veredito:** a camada conceitual está madura demais para o problema. O projeto é solo-dev pré-Go-Live com 3 conflitos críticos que se resolvem em ~1 hora. Recebeu 8 documentos de governança, ~68KB de norma, e nenhuma das 3 correções. O diagnóstico da R1 estava certo; a resposta foi desproporcional e, no ponto decisivo, construída sobre terreno que o git ignora.

### Achados por gravidade

| # | Achado | Gravidade |
|---|---|---|
| A-01 | `.agents/` está no `.gitignore` — a arquitetura alvo vive em diretório ignorado | **Crítico** |
| A-02 | Nenhum agente carrega `docs/arquitetura/**` — constituição inerte | **Crítico** |
| A-03 | `skills-lock.json` ignorado — Governance §5.1 ("hash de upstream") é inexequível | **Crítico** |
| A-04 | Governança cresceu 8 documentos e entregou 0 correções | **Crítico** |
| A-05 | Art. 8 ("executável vence prosa") violado pela própria entrega | **Alto** |
| A-06 | Circularidade Art. 12 ⇄ Art. 18 (guard vs. autoridade) | **Alto** |
| A-07 | Presunção de obsolescência exige telemetria que não existe | **Alto** |
| A-08 | Teto de 4 skills é arbitrário e não vinculante | **Alto** |
| A-09 | Modelo RIDE colapsa em solo-dev (mesma pessoa D/R/E) | **Alto** |
| A-10 | Guards não rodam em pre-commit — só em CI de 1 dos 3 módulos | **Alto** |
| A-11 | Art. 20 gate de 9 perguntas é inaplicável por tarefa | **Médio** |
| A-12 | Responsabilidade duplicada entre os 4 documentos (~30%) | **Médio** |
| A-13 | Artigos mortos (22, 24, partes do 5) | **Médio** |
| A-14 | Multiagente simultâneo não é tratado | **Médio** |
| A-15 | Conceitos sem owner (7 identificados) | **Médio** |
| A-16 | 4 documentos deveriam ser 2 | **Médio** |
| A-17 | `jinlong-design` no teto de skills sem justificativa de leitor | **Baixo** |
| A-18 | Ausência de plano de rollback da própria governança | **Baixo** |

---

## Pontos Fortes

Registrados por honestidade intelectual, não por cortesia. São quatro, e apenas quatro.

1. **Art. 8 (executável vence prosa) é a tese correta.** Identifica que guards são a única camada não-ignorável. É o insight de maior valor de toda a proposta — e, ironicamente, o mais desrespeitado pela própria entrega (A-05).
2. **Art. 3 (reserva de vocabulário `P1`–`P6`) ataca classe, não instância.** Corrige C-02 permanentemente em vez de renomear um rótulo. É engenharia de verdade.
3. **A crítica embutida em `ARQUITETURA_CAMADA_IA.md` §1 é legítima.** Reduzir de 6–7 skills para 2 é a decisão correta, e o argumento (capítulos em `references/` já carregam sob demanda, logo separar traz custo sem benefício) é tecnicamente válido.
4. **Art. 14 e 15 (proibir regra de domínio e stack em arquivo de ferramenta) são regras estruturais** que impedem C-04 e C-06 por construção, e são automatizáveis.

Tudo o mais é ou redundante, ou inexequível, ou não verificado.

---

## Fragilidades

### A-01 🔴 Crítico — A arquitetura alvo vive em diretório ignorado pelo git

**Evidência:**
```
$ git check-ignore -v .agents/skills/supabase/SKILL.md
.gitignore:73:.agents/    .agents/skills/supabase/SKILL.md

$ sed -n '72,73p' .gitignore
# Tooling local (skills/plans do Agent — não versionar)
.agents/
```

`ARQUITETURA_CAMADA_IA.md` §3.1 declara `.agents/skills/` como "**ÚNICO diretório de skills**" e coloca ali o skill `jinlong` — o árbitro de toda a camada. Esse diretório é **deliberadamente** ignorado (o comentário no `.gitignore` prova intenção, não acidente).

**Consequências:**
- O skill árbitro não sobrevive a `git clone`, CI, worktree do Claude ou outra máquina
- Os 3 vendor skills também não estão versionados — a "camada C6" não existe fora desta máquina
- A R1 declarou C-01 (`ARQUITETURA_REGRAS_NEGOCIO.md` untracked) como o achado mais grave e **replicou o defeito na solução**

**Falha de método:** a R1 usou `git status` (mostra untracked) mas nunca `git check-ignore` (mostra ignorado por regra). São diagnósticos diferentes: untracked é esquecimento, ignorado é decisão. Auditar versionamento sem checar `.gitignore` é auditoria incompleta.

**Contradição adicional não resolvida:** existe um conflito de intenção real entre "skills são tooling local descartável" (posição do `.gitignore`) e "skills são a camada de governança do projeto" (posição da constituição). A proposta nunca reconheceu que precisa **revogar** uma decisão anterior deliberada.

### A-02 🔴 Crítico — A constituição é inerte

**Evidência:** grep por `AI_CONSTITUTION` e `docs/arquitetura` em `.cursor/`, `.claude/`, `.agents/`, `.cursorrules`, `pdv-importados/.cursorrules`, `skills-lock.json` → **zero ocorrências**.

Apenas 3 arquivos são carregados automaticamente por algum agente (`alwaysApply: true` nas 3 rules do Cursor). Nenhum deles menciona a constituição.

**Consequência:** os 4 documentos só governam se um humano colar o caminho no prompt. A própria métrica-mestra da R1 — "agente encontra a árvore de precedência em <2min de qualquer ponto de entrada" — falha com valor **infinito** no estado atual.

**Agravante conceitual:** uma constituição que depende de ser lembrada não é norma fundamental; é sugestão bem formatada. Art. 8 diz que "regra em documento é intenção". Por essa própria régua, **os quatro documentos inteiros são intenção**.

### A-03 🔴 Crítico — Governance §5.1 é inexequível

`AI_GOVERNANCE.md` §5.1 determina que vendor skills são versionados por "hash de upstream" e §3.1 que "ninguém altera vendor — lock por hash".

**Evidência:** `.gitignore:62 → skills-lock.json`. O lockfile que materializa esse controle **não é versionado**.

Sem lock versionado não há: detecção de drift de vendor, reprodutibilidade entre máquinas, nem verificação de que o vendor não foi editado localmente. A regra existe no papel e é impossível de cumprir no repositório.

### A-04 🔴 Crítico — Saldo negativo de superfície

| Momento | Artefatos de instrução/governança | Conflitos Críticos abertos | Guards novos |
|---|---|---|---|
| Antes da R1 | 15 | 3 | 0 |
| Depois da R1 (+4 docs) | 19 | 3 | 0 |
| Depois da R2 (+4 docs) | 23 | 3 | 0 |

Art. 9 exige "menor superfície" e Art. 24 exige que toda adição declare o que remove. **A própria entrega da governança viola os dois.** Nenhum dos 8 documentos declarou qual artefato existente removia, e nenhum removeu.

O trabalho produzido até aqui é **+53% de superfície, 0% de correção**. As três correções críticas (versionar autoridade, corrigir `C:\Naturecode`, remover escopo obsoleto) somam ~1h e continuam abertas após duas rodadas de arquitetura.

### A-05 🟠 Alto — A entrega viola seu próprio artigo central

Art. 8: *"Uma regra escrita em documento é intenção. Uma regra em guard executável é garantia. Toda regra crítica deve terminar em guard."*

A proposta identificou 5 guards necessários e criou **zero**. Produziu ~68KB de prosa normativa. Pela régua do próprio Art. 8, a totalidade da entrega está no lado fraco da distinção que ela mesma estabelece.

`ARQUITETURA_CAMADA_IA.md` §6 declara "ordem inegociável: guards antes de capítulos" — mas a sequência executada foi **texto antes de tudo**, duas vezes.

### A-10 🟠 Alto — Guards não são o backstop que a arquitetura presume

Toda a arquitetura repousa sobre "C1 Enforcement é a camada que decide de fato" e "não pode ser ignorada". Verificação:

- `guard:all` roda em **`.github/workflows/ci-pdv-importados.yml:55`** — apenas 1 dos 3 workflows de módulo
- **Não existe `.husky/`** nem hook de pre-commit configurado no `package.json`
- Logo, guards rodam **depois** do push, e só para um módulo

**Consequência:** alterações em `backend/` (migrations, RPCs — onde moram P1–P4) e em `pdv-local/` não passam por `guard:all`. A camada declarada "impossível de ignorar" é, na prática, **evitável por escolha de diretório**. A constituição confia num backstop que cobre parcialmente o repositório.

---

## Contradições

### C-R2-01 🟠 Alto — Circularidade Art. 12 ⇄ Art. 18

- **Art. 12:** "a camada de menor número vence" → C1 (guard) vence C3 (autoridade funcional)
- **Art. 12, exceção:** se guard contradiz autoridade, "presume-se que o guard está desatualizado"
- **Art. 18:** "o guard vence na prática"

Se o guard está *presumidamente errado* mas *vence na prática*, qual é a norma? O texto diz simultaneamente que a autoridade funcional é substantivamente superior e que o guard é operacionalmente superior, sem definir o que o agente faz quando isso importa: **implementa a regra correta e vê o CI falhar, ou implementa a regra errada e vê o CI passar?**

Art. 18 manda "cumprir o guard e registrar o conflito" — ou seja, **implementar conscientemente o que a autoridade funcional considera errado**. Isso contradiz Art. 3 (P1–P4 nunca cedem): se o guard desatualizado força violar integridade financeira, Art. 18 manda violar.

### C-R2-02 🟠 Alto — Art. 22 vs. todo o resto

Art. 22 autoriza o agente a parar quando "cumprir a letra causa dano, mesmo que todos os gates estejam formalmente satisfeitos".

Isso concede ao agente **juízo substantivo acima da norma** — exatamente o poder que `AI_GOVERNANCE.md` §1.2 nega: *"O agente de IA é sempre E. Nunca D."*

Um agente que decide que a constituição inteira produz dano tem, pelo Art. 22, autorização para ignorá-la. É uma cláusula de escape que engole a regra. Na prática nenhum agente a invocará (A-13), mas ela torna o modelo formalmente inconsistente.

### C-R2-03 🟡 Médio — "Menor superfície" vs. 8 documentos

Já detalhado em A-04. Registro como contradição porque Art. 9 e Art. 24 são normativos, não aspiracionais, e a entrega os viola literalmente.

### C-R2-04 🟡 Médio — Vendor "informa" mas decide

`AI_GOVERNANCE.md` §1.1 classifica vendor skills como **I (informa)**, "não normatiza". Mas `.agents/skills/supabase/SKILL.md` contém regras imperativas de segurança: *"Never use `user_metadata` in authorization"*, *"Enable RLS on every table"*, *"Never expose service_role"*.

Essas regras são **P1 (segurança)** pela escala da própria constituição — a camada mais alta. Um artefato classificado como "apenas informa" contém as regras de maior precedência do sistema. A taxonomia RIDE não acomoda o caso "vendor com autoridade de segurança".

### C-R2-05 🟡 Médio — Lifecycle §7.2 vs. Governance §5.3

Lifecycle diz que o melhor destino de um skill é "virar guard e ser arquivado". Governance §5.3 exige que nada seja arquivado sem "substituto vigente e verificado" passando por 3 estágios. Um guard não é substituto legível de um skill — cobre a parte verificável, não o julgamento. Os dois textos descrevem transições incompatíveis para o mesmo evento.

---

## Regras Mortas

Artigos que, por construção, nunca serão invocados na prática.

| Regra | Por que é morta | Deve ser removida? |
|---|---|---|
| **Art. 22** (vedação à obediência cega) | Nenhum agente invoca "todos os gates passaram mas vou parar" — e se invocasse, seria indistinguível de falha. Além disso contradiz o modelo RIDE (C-R2-02) | **Sim** — remover; o efeito desejado já está em Art. 21 |
| **Art. 24** (cláusula de simplicidade) | Violada na própria entrega que a criou (A-04). Regra que o autor não cumpre no ato de escrevê-la não vincula ninguém | **Converter em guard** (contagem de artefatos) ou remover |
| **Art. 5** (primazia do operador) | Enunciado auto-neutralizante: "vence a operação" seguido de "isto não contradiz Art. 3, UX cede em regra". Depois da ressalva não sobra critério decidível | Fundir em Art. 3 como nota |
| **Art. 23** (emenda) | Em solo-dev, quem emenda é a mesma pessoa que ratifica. Formalidade sem contraparte | Manter (custo zero, valor futuro se houver equipe) |
| **Governance §4 "revisão por evento"** | Não há gatilho automatizado; depende de alguém lembrar num incidente | Morta na prática |
| **Lifecycle §4 (divisão)** | Exige 4 condições simultâneas incluindo "cabe no teto de 4". Com 2 skills e teto de 4, o cenário de divisão é remoto | Manter como referência |
| **Lifecycle presunção de obsolescência** | Ver A-07: exige telemetria de invocação que não existe | Morta até haver instrumentação |

**Total: 2 artigos a remover, 2 a fundir, 3 inertes até haver infraestrutura.**

---

## Regras Duplicadas

Sobreposição medida entre os 4 documentos novos: **~30%**.

| Conteúdo | Aparece em | Gravidade |
|---|---|---|
| Precedência P1–P6 | Constitution Art. 3; Governance §1.1 (implícito); Arquitetura §5; R1 `MAPA_HIERARQUIA` §4 | Alta |
| Camadas C0–C9 | Constitution Art. 11; Governance §1.1 (tabela quase idêntica); Arquitetura §3.1 | **Alta** |
| Hierarquia N0–N9 (R1) × C0–C9 (R2) | `MAPA_HIERARQUIA_SKILLS.md` × `AI_CONSTITUTION.md` | **Crítica** — duas numerações concorrentes para a mesma hierarquia |
| Critérios de guard | Governance §7.2; Arquitetura §5; Lifecycle §2.2 | Alta |
| Anti-padrões | Governance §8; Arquitetura §5 (tabela "impede reincidência") | Alta |
| Depreciação em 3 estágios | Governance §5.3; Lifecycle §7.1 | Alta |
| Crítica à auditoria R1 | Arquitetura §1; parcialmente em Lifecycle §10 | Média |
| Teto de skills | Arquitetura §3.2; Lifecycle §1; Governance §6 | Média |
| Critérios de sucesso | Arquitetura §7; R1 `PLANO_CONSOLIDACAO` §6 | Média |

**A duplicação mais grave é N0–N9 × C0–C9.** A R1 estabeleceu uma hierarquia de 10 níveis com prefixo `N`; a R2 estabeleceu outra de 10 níveis com prefixo `C`. Elas são *parecidas mas não idênticas* (a R2 promove enforcement de N0 para C1 e insere a constituição em C0). Nenhum documento declara qual substitui qual. **Este é exatamente o defeito C-02 que a constituição criou o Art. 3 para impedir — rótulo reutilizado com sentido diferente — cometido pela própria constituição, uma seção depois de proibi-lo.**

---

## Lacunas

O que não foi tratado.

| # | Lacuna | Gravidade |
|---|---|---|
| L-01 | **Carregamento**: nenhum mecanismo faz a constituição chegar ao agente (A-02) | **Crítica** |
| L-02 | **Versionamento da própria camada**: `.agents/` e `skills-lock.json` ignorados (A-01, A-03) | **Crítica** |
| L-03 | **Multiagente simultâneo**: nenhuma palavra sobre 2+ agentes concorrentes (ver §Cenários) | **Alta** |
| L-04 | **Telemetria de uso**: presunção de obsolescência sem dado (A-07) | **Alta** |
| L-05 | **Custo de contexto**: nenhum orçamento de tokens; capítulos podem inchar sem limite | Média |
| L-06 | **Conflito humano × agente**: se o humano manda violar a constituição, o que o agente faz? | Média |
| L-07 | **Onboarding de agente novo**: nenhum "ponto de entrada" definido | Média |
| L-08 | **Métrica de eficácia**: mede-se conformidade, nunca se a governança melhorou o output | Média |
| L-09 | **Rollback da governança**: nenhum critério para abandonar o modelo se falhar | Baixa |
| L-10 | **Idioma normativo**: PT/EN misturados sem regra; vendor em EN, constituição em PT | Baixa |

**L-06 merece destaque:** a constituição regula agente-vs-documento e documento-vs-documento, mas nunca humano-vs-constituição. Em solo-dev esse é o conflito mais frequente que existirá — o dono pedindo algo que a norma proíbe. O silêncio significa que, na prática, o pedido humano vence sempre, e a constituição só vincula quando ninguém está pedindo o contrário. Isso a torna decorativa exatamente no momento em que seria útil.

---

## Conceitos sem dono

Governance §2.2 exige que todo domínio tenha **autoridade + owner + enforcement**. Nenhum dos três está preenchido para:

| Conceito | Autoridade | Owner | Enforcement |
|---|---|---|---|
| A própria constituição | ela mesma (circular) | "Direção" (genérico) | ❌ nenhum |
| Camada de IA como sistema | ❌ | ❌ | ❌ |
| Vendor skills (upgrade/drift) | lock ignorado | ❌ | ❌ |
| Telemetria de uso de skill | ❌ | ❌ | ❌ |
| Orçamento de contexto | ❌ | ❌ | ❌ |
| Idioma normativo | ❌ | ❌ | ❌ |
| Go-Live | 8 docs concorrentes (herdado R1) | ❌ | ❌ |

Sete conceitos importantes sem os três atributos que a própria governança exige. O modelo aplica a outros um critério que não aplica a si mesmo.

---

## Conceitos circulares

| # | Ciclo | Gravidade |
|---|---|---|
| CIC-01 | Constituição funda a autoridade → autoridade da constituição vem de sua ratificação → ratificação prevista pela própria constituição (Art. 23) | Baixa (normal em constituições) |
| CIC-02 | Art. 12 (guard vence) → exceção (guard presumido errado) → Art. 18 (guard vence na prática) → sem saída | **Alto** |
| CIC-03 | Constitution → Governance (§1 aplica camadas) → Arquitetura (§2 aplica governança) → Lifecycle (§2 aplica arquitetura) → Lifecycle §10 redefine o skill que a Arquitetura pressupõe | Médio |
| CIC-04 | Skill `jinlong` arbitra conflitos → mora em `.agents/` → `.agents/` ignorado → skill não existe → sem árbitro | **Crítico** (materialização de A-01) |
| CIC-05 | Guard é a garantia → guards são criados por decisão arquitetural → decisão arquitetural depende do skill árbitro → árbitro depende de guard para ser respeitado | Médio |
| CIC-06 | R1 `MAPA_HIERARQUIA` (N0–N9) ↔ R2 `AI_CONSTITUTION` (C0–C9): cada um se apresenta como a hierarquia, nenhum revoga o outro | **Alto** |

**CIC-04 é o mais grave** — é o A-01 expresso como ciclo lógico: a arquitetura precisa de um árbitro que, pela própria arquitetura, não pode existir.

---

## Riscos de Governança

| # | Risco | Gravidade |
|---|---|---|
| RG-01 | **Governança teatral** — norma existe, ninguém a carrega (A-02), ninguém a verifica. Produz falsa sensação de controle, pior que ausência de norma | **Crítico** |
| RG-02 | **RIDE colapsa em solo-dev** (A-09) — a mesma pessoa é D, R e E. Governance §2.1 reconhece e pede "atos distintos", mas sem enforcement o único efeito é cerimônia autoimposta que será abandonada na primeira semana de pressa | **Alto** |
| RG-03 | **Autoridade sem contraparte** — "Direção" e "Owner de domínio" são a mesma pessoa; não há a quem escalar. Art. 16 (dever de parar) manda escalar para si mesmo | **Alto** |
| RG-04 | **Ratificação como ponto único de falha** — nada é vinculante sem ratificação, e nada força a ratificação a ocorrer | Médio |
| RG-05 | **Deriva silenciosa do vendor** — sem lock versionado (A-03), um upgrade de vendor pode inverter regra de segurança sem sinal | Médio |

## Riscos de Manutenção

| # | Risco | Gravidade |
|---|---|---|
| RM-01 | **8 documentos com 30% de sobreposição** — toda mudança de precedência exige editar 3–4 arquivos; a chance de esquecer um é alta e produz exatamente os conflitos que a R1 catalogou | **Alto** |
| RM-02 | **Duas hierarquias vivas (N × C)** — nenhuma revoga a outra (CIC-06). O próximo leitor não sabe qual seguir | **Alto** |
| RM-03 | **Revisão trimestral <1h é irreal** — 8 documentos + 5 skills + 15 guards + verificação de obsolescência não cabem em 1h. A meta será descumprida no primeiro ciclo, e metas descumpridas erodem todo o resto | Médio |
| RM-04 | **Documento longo envelhece invisível** — 68KB de norma sem nenhum guard que detecte contradição interna | Médio |

## Riscos de Escalabilidade

| # | Risco | Gravidade |
|---|---|---|
| RE-01 | **Teto de 4 skills é arbitrário** (A-08) — não deriva de nenhuma medida (contexto, cognição, ownership). Um número inventado tende a ser rompido sem discussão, e quando romper, o teto inteiro perde autoridade | **Alto** |
| RE-02 | **Um skill com N capítulos degrada** — a defesa "references carregam sob demanda" pressupõe que o agente escolha o capítulo certo. Com 10+ capítulos, a escolha erra; a economia de contexto vira omissão de contexto | Médio |
| RE-03 | **Sem orçamento de contexto** (L-05) — nada impede um capítulo de crescer até dominar a janela | Médio |
| RE-04 | **Guards crescem sem teto** — cada guard custa tempo em cada commit; 15 hoje, sem política de poda | Baixo |

## Riscos para Solo Developer

Este é o cenário **real e atual** do projeto, e onde a proposta é mais frágil.

| # | Risco | Gravidade |
|---|---|---|
| RS-01 | **Desproporção** — 8 documentos de governança, ~68KB, para 1 pessoa pré-Go-Live com 3 conflitos de 1h. O custo cognitivo de manter a norma excede o de corrigir os defeitos que ela descreve | **Crítico** |
| RS-02 | **Governança compete com Go-Live** — cada hora em constituição é uma hora fora do primeiro cliente. A R1 já identificou que o gargalo do projeto é *execução*, não descoberta; a R2 adicionou mais descoberta | **Crítico** |
| RS-03 | **Cerimônia autoimposta é abandonada** — "propor → revisar → aprovar → redigir" com uma pessoa vira overhead puro; será pulado, e a norma vira letra morta, contaminando a credibilidade das partes úteis | **Alto** |
| RS-04 | **Nenhum benefício imediato** — nada nos 4 documentos melhora o produto hoje; todo o valor é condicional a adoção futura | **Alto** |

## Riscos para Equipes Grandes

| # | Risco | Gravidade |
|---|---|---|
| RQ-01 | **Teto de 4 skills não escala** — 5 times não cabem em 4 skills; o teto forçará capítulos gigantes ou será rompido | **Alto** |
| RQ-02 | **Sem concorrência editorial** — nada trata merge conflict em skill, ownership disputado, ou dois times alterando a mesma precedência | **Alto** |
| RQ-03 | **"Direção" como gargalo** — toda mudança MAJOR e todo conflito entre iguais sobe para uma pessoa | Médio |
| RQ-04 | **Idioma misto** (L-10) — vendor em EN, norma em PT; time internacional lê metade | Médio |

## Riscos para Agentes de IA

| # | Risco | Gravidade |
|---|---|---|
| RA-01 | **A norma não chega ao agente** (A-02) — risco que anula todos os outros | **Crítico** |
| RA-02 | **Art. 20 (9 perguntas) é caro por tarefa** (A-11) — responder 9 critérios para renomear uma variável é desproporcional; agentes aprenderão a responder pró-forma, tornando o gate ruído | **Alto** |
| RA-03 | **Art. 12 vs. 18 sem saída** (CIC-02) — o agente trava exatamente no caso que a norma existe para resolver | **Alto** |
| RA-04 | **Excesso de "PARE"** — Art. 16, 17, 21 (8 condições), 22. Um agente conforme para com frequência alta; um agente que para demais é substituído pelo usuário, que então desliga a norma inteira | **Alto** |
| RA-05 | **Conflito com system prompts nativos** — cada agente já tem instruções próprias; a constituição não define como se relaciona com elas | Médio |
| RA-06 | **Sem formato legível por máquina** — precedência só em prosa e tabelas markdown; nenhum agente pode verificá-la programaticamente | Médio |

---

## Cenários — 5 agentes simultâneos

Simulação: Claude Code, Cursor, Hermes, Copilot e Codex trabalhando ao mesmo tempo no monorepo.

### Estado atual (sem a proposta)

| Agente | Carrega automaticamente | Vê a constituição? |
|---|---|---|
| Cursor | `.cursorrules` + 3 `.mdc` (`alwaysApply`) | ❌ |
| Claude Code | `.claude/agents/` sob demanda; `.agents/skills/` | ❌ |
| Hermes | memória de perfil + skills próprios | ❌ |
| Copilot | `.github/copilot-instructions.md` — **não existe** | ❌ |
| Codex | `AGENTS.md` — **não existe** | ❌ |

**Resultado: 5 agentes, 5 contextos diferentes, 0 constituições carregadas.** Copilot e Codex operam com **zero** instrução de projeto — nenhum arquivo que eles leem nativamente existe no repo. A proposta não trata isso: `ARQUITETURA_CAMADA_IA.md` §3.1 não prevê `AGENTS.md` nem `copilot-instructions.md`.

### Com a proposta implementada

Melhora para Cursor e Claude (se `.agents/` sair do `.gitignore`). **Não melhora para Copilot e Codex** — continuam sem ponto de entrada nativo. A arquitetura "2 diretórios" é incompatível com o fato de que **cada fornecedor tem seu próprio caminho de descoberta**, e esses caminhos são 5, não 2.

### Conflitos de concorrência não tratados (L-03)

| Cenário | Comportamento previsto | Real |
|---|---|---|
| 2 agentes editam o mesmo skill | — | Merge conflict silencioso |
| Agente A cria guard que reprova o trabalho de B | — | B fica bloqueado sem saber por quê |
| Dois agentes param por conflito (Art. 16) simultaneamente | — | 2 relatórios, nenhum árbitro disponível |
| Agente lê a constituição enquanto outro a emenda | — | Decisão sob norma obsoleta |
| Agente A arquiva skill que B está usando | — | Lifecycle não trata concorrência |

**Veredito do cenário:** a arquitetura foi projetada para **um agente por vez**. Sob concorrência real ela não é inconsistente por design — ela é **omissa**, o que na prática produz o mesmo resultado: cada agente resolve à sua maneira, que é precisamente o problema original.

---

## Achados classificados

### 🔴 Crítico (6)
`A-01` diretório alvo ignorado pelo git · `A-02` constituição inerte · `A-03` lock não versionado torna §5.1 inexequível · `A-04` +53% superfície / 0 correções · `CIC-04` árbitro que não pode existir · `RS-01/RS-02` desproporção e competição com Go-Live

### 🟠 Alto (12)
`A-05` viola o próprio Art. 8 · `A-06`/`CIC-02` Art. 12⇄18 sem saída · `A-07` obsolescência sem telemetria · `A-08` teto arbitrário · `A-09` RIDE colapsa em solo · `A-10` guards só em 1 de 3 CIs, sem pre-commit · `C-R2-02` Art. 22 engole a regra · `CIC-06` duas hierarquias vivas · `L-03` multiagente omisso · `RM-01` sobreposição 30% · `RA-02` gate de 9 perguntas · `RA-04` excesso de condições de parada

### 🟡 Médio (11)
`A-11` · `A-12` · `A-13` · `A-14` · `A-15` · `C-R2-03` · `C-R2-04` · `C-R2-05` · `CIC-03` · `CIC-05` · `L-05`/`L-06`/`L-07`/`L-08`

### 🟢 Baixo (4)
`A-17` `jinlong-design` no teto · `A-18` sem rollback · `L-09` · `L-10` idioma

---

## Revisão adversarial — o que eu atacaria sem filtros

Contratado apenas para provar que esta arquitetura está errada, eu diria o seguinte:

1. **"Vocês construíram a catedral no terreno que o próprio git recusa."** O diretório do árbitro está no `.gitignore`, com comentário explicando que é descartável. Nenhuma das duas rodadas rodou `git check-ignore`. Isso não é um detalhe — invalida a arquitetura alvo inteira.

2. **"Vocês escreveram uma constituição que ninguém lê."** Zero referências em qualquer caminho de carregamento automático. É um documento sobre governança, não um instrumento de governança.

3. **"O artigo mais importante da constituição é violado pela constituição."** Art. 8 diz que prosa é intenção e guard é garantia. Foram entregues 68KB de prosa e zero guards. Se o autor não segue o próprio artigo central no ato de escrevê-lo, por que um agente seguiria?

4. **"Vocês proibiram no Art. 3 exatamente o que fizeram no Art. 11."** Art. 3 reserva vocabulário para impedir rótulos ambíguos — corrigindo C-02. Oito artigos depois, criam `C0–C9` concorrendo com o `N0–N9` da R1, sem revogar. Reincidência no defeito que a norma existe para prevenir, dentro do mesmo documento.

5. **"O saldo é +8 documentos e 0 correções."** Duas rodadas de arquitetura, três conflitos críticos de ~1h ainda abertos. `C:\Naturecode` continua no `production-debugger`. A autoridade normativa continua fora do git. Isso não é governança; é adiamento com boa apresentação.

6. **"A camada que sustenta tudo não sustenta."** Guards são declarados "impossíveis de ignorar", mas rodam só no CI de `pdv-importados`, sem pre-commit. Todo `backend/` — onde vivem P1 a P4 — está fora. O backstop tem buraco no meio.

7. **"Vocês criaram um dever de parar sem ter para quem escalar."** Art. 16 e 21 mandam escalar ao humano. Em solo-dev, o agente escala para a mesma pessoa que pediu a tarefa, que responderá "faça". A parada é ritual.

8. **"O Art. 22 é uma cláusula de escape que engole a norma."** Se o agente pode ignorar tudo quando julga que há dano, ele é decisor — contradizendo o pilar "agente é sempre E, nunca D".

9. **"Quatro documentos são dois."** Constituição+Governança tratam do mesmo objeto (quem decide, como se resolve, como se versiona). Arquitetura+Lifecycle também (como fica, como evolui). A separação em 4 gerou 30% de duplicação e quadruplicou o custo de manutenção da precedência.

10. **"Copilot e Codex não existem nesta arquitetura."** Nenhum `AGENTS.md`, nenhum `copilot-instructions.md`. Dois dos cinco agentes que a missão pediu para simular operam com zero instrução, e a arquitetura de "2 diretórios" não os contempla.

11. **"O teto de 4 é um número inventado."** Não deriva de janela de contexto, de carga cognitiva nem de ownership. Números arbitrários são rompidos, e quando rompem levam junto a credibilidade das regras que não eram arbitrárias.

12. **"Vocês mediram conformidade, nunca eficácia."** Todos os indicadores de `AI_GOVERNANCE.md` §6 medem se a norma é cumprida. Nenhum mede se o código ficou melhor. Uma governança pode atingir 100% dos indicadores e não ter evitado uma única regressão.

13. **"O gargalo diagnosticado era execução, e vocês entregaram mais descoberta."** A própria memória do projeto registra: *"gargalo = execução + decisão, não descoberta"*. Duas rodadas depois: mais descoberta, mesma execução.

---

## Conclusão Final

**A arquitetura não é mínima, não é consistente e, no estado atual, não é sustentável.**

- **Não é mínima:** 8 documentos, ~68KB, 30% de sobreposição, para um problema de 3 conflitos que se resolvem em 1 hora. Quatro documentos deveriam ser dois.
- **Não é consistente:** viola o próprio Art. 8 (prosa vs. guard), o próprio Art. 3 (rótulo reutilizado, N vs. C), o próprio Art. 9/24 (menor superfície), e contém circularidade sem saída entre Art. 12 e 18.
- **Não é sustentável hoje:** o diretório do árbitro é ignorado pelo git, o lockfile de vendor é ignorado, nenhum agente carrega a norma, e o backstop de guards cobre 1 de 3 módulos.

**O que sobrevive ao ataque** — e deve ser preservado numa eventual R3 — são quatro coisas: Art. 8 (executável vence prosa), Art. 3 (reserva de vocabulário), Art. 14/15 (proibição de autoridade difusa) e a decisão de reduzir de 6–7 skills para 2. São insights corretos e automatizáveis.

**O que deve desaparecer:** `AI_GOVERNANCE.md` e `LIFECYCLE_SKILLS.md` como documentos independentes (fundir na constituição como títulos); `MAPA_HIERARQUIA_SKILLS.md` (revogado por Art. 11); Art. 22 e Art. 24; e a numeração `N0–N9`.

**Ordem correta de trabalho, que ambas as rodadas inverteram:**

```
1. git rm --cached / ajustar .gitignore    (sem isso, nada mais importa)
2. 3 correções de 1 hora                    (C-01, C-03, C-06)
3. 3 a 5 guards                             (tornam Art. 3, 14, 15 executáveis)
4. 1 skill árbitro, versionado, carregado   (com ponto de entrada por fornecedor)
5. Só então: o texto que sobrar
```

**Julgamento final:** o pensamento arquitetural é de qualidade alta; a **calibração** está errada por uma ordem de grandeza. Este é o volume de governança de uma organização com múltiplos times e compliance externo, aplicado a um desenvolvedor solo antes do primeiro cliente. A recomendação não é refinar os documentos — é **executar 1 hora de correção e 1 dia de guards, arquivar metade do texto, e só reabrir a discussão normativa quando existir um segundo humano no projeto.**

Enquanto isso não ocorrer, o status honesto desta arquitetura, pela régua do seu próprio Art. 7, é **"Em Implementação"** — e, mais precisamente, **não iniciada**.

