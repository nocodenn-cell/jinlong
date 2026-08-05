# Ciclo de Vida dos Skills — Jinlong ERP

> 🟡 **PROPOSTA NÃO RATIFICADA — fora da fila de execução R1.**
> Condições e pré-requisitos: ver o cabeçalho de `AI_CONSTITUTION.md`.
>
> 🔗 **Marcado para FUSÃO em `ARQUITETURA_CAMADA_IA.md`** quando a constituição for ratificada
> (sobreposição em teto de skills, critérios de guard e depreciação). Ver
> `AUDITORIA_CONSTITUICAO_R2.md` §Conclusão.
>
> ⚠️ **Duas regras inertes hoje:** §4.2 (presunção de obsolescência) exige telemetria de
> invocação que **não existe** (achado `A-07`); §7.2 (*"o melhor destino de um skill é virar
> guard e ser arquivado"*) conflita com `AI_GOVERNANCE.md` §5.3, que exige substituto legível
> antes de arquivar (achado `C-R2-05`). **Prevalece §5.3** — um guard não substitui julgamento.

> **Natureza:** projeto de processo. Nenhum arquivo existente foi alterado; nenhum skill foi criado.
> **Base:** `AI_CONSTITUTION.md`, `AI_GOVERNANCE.md`, `ARQUITETURA_CAMADA_IA.md`

---

## 1. Premissa

> **O estado saudável padrão é "não criar skill".**

A camada de IA do Jinlong tem teto de **4 skills internos**. Hoje o alvo usa **2**. Isso não é escassez — é projeto. Todo skill novo compete por um dos slots restantes e precisa provar que não cabe como capítulo.

---

## 2. Nascimento

### 2.1 O teste dos cinco portões

Um skill novo só nasce se passar **nos cinco**:

| # | Portão | Reprova se |
|---|---|---|
| 1 | **Não é capítulo?** | Compartilha vocabulário e leitor com skill existente |
| 2 | **Não é guard?** | A regra é objetiva e verificável por máquina |
| 3 | **Não é documentação?** | É conhecimento de referência, não decisão de agente |
| 4 | **Tem autoridade e owner?** | Ninguém assume a manutenção perpétua |
| 5 | **Cabe no teto?** | Já existem 4 internos e nenhum será arquivado |

Falhou em um: **não nasce**. O caminho correto está indicado na coluna de reprovação.

### 2.2 Ordem de preferência

```
1º  Guard          (executável, impossível ignorar)
2º  Capítulo       (reference dentro do skill oficial)
3º  Documentação   (docs/, referenciada sob demanda)
4º  Skill novo     (último recurso, consome um slot)
```

### 2.3 Quem faz o quê

| Ato | Quem | Registro |
|---|---|---|
| Propor | Qualquer um, inclusive agente | Proposta com os 5 portões respondidos |
| Revisar | Owner de domínio | Verificação dos portões |
| **Aprovar** | Direção / Arquiteto-Chefe | Decisão registrada |
| Redigir | Agente ou humano | Segue o padrão de estrutura |
| Verificar | Guards + revisor | Evidência antes do merge |

Nenhum agente cria skill por iniciativa própria em domínio de negócio. Pode **propor** — sempre.

### 2.4 Estrutura mínima

Todo skill nasce com: frontmatter (nome, descrição com gatilhos, versão, owner, precedência), gatilho de uso explícito, regras acionáveis, **comandos verificáveis**, pitfalls conhecidos e referências às autoridades (nunca cópias delas).

**Proibido no nascimento:** copiar ADR, copiar regra de negócio, declarar stack em prosa, hardcodar caminho de máquina ou ID de projeto, reutilizar rótulo reservado (`P1`–`P6`).

---

## 3. Evolução

### 3.1 Quem pode alterar

| Tipo | Quem altera | Aprovação |
|---|---|---|
| Vendor | **Ninguém** — só upgrade de upstream | Hash em lockfile |
| Skill oficial — PATCH | Agente ou humano | Revisão normal |
| Skill oficial — MINOR (capítulo novo) | Humano ou agente com proposta | Owner |
| Skill oficial — MAJOR (sentido muda) | Humano | **Direção** |
| Constituição | Humano | **Direção**, com emenda registrada |

### 3.2 Dever de correção imediata

Um agente que usa um skill e descobre instrução errada, comando que falha, passo faltando ou pitfall não documentado **corrige na hora** (PATCH), no mesmo trabalho. Skill não mantido vira passivo — pior que skill inexistente, porque induz confiança falsa.

Isso vale para PATCH. MINOR e MAJOR seguem aprovação.

### 3.3 Versionamento

`MAJOR.MINOR.PATCH` — MAJOR quando uma regra existente muda de sentido ou a precedência muda; MINOR para capítulo ou seção nova; PATCH para correção sem mudança de sentido.

Mudança **breaking** (Governance §5.2) exige verificar que nenhum outro artefato depende do sentido antigo.

---

## 4. Obsolescência

### 4.1 Sinais

| Sinal | Detecção | Gravidade |
|---|---|---|
| Comando não existe mais | Guard de comandos | Alta |
| Caminho não existe | Guard de rotas | Alta |
| Contradiz autoridade vigente | Revisão trimestral | **Crítica** |
| Stack citada ≠ manifesto | Guard de coerência | Alta |
| Não invocado em 90 dias | Registro de uso | Média |
| Duplica regra que virou guard | Revisão | Média |
| Owner ausente | Revisão | Média |

### 4.2 Presunção de obsolescência

> Skill sem alteração **e** sem invocação por 2 trimestres é **presumido obsoleto**. O ônus da prova passa para quem quiser mantê-lo.

Inverter o ônus da prova é o mecanismo que impede acúmulo. Sem ele, a camada só cresce — foi assim que se chegou a 15 artefatos e 4 diretórios.

---

## 5. Divisão

Dividir só quando **todos** ocorrerem:

1. O skill trata de domínios com **leitores distintos** (ex.: marca × arquitetura)
2. Os capítulos **não compartilham vocabulário nem precedência**
3. Existe **owner distinto** para cada parte
4. A divisão **cabe no teto** de 4

Não são motivos válidos: tamanho do arquivo, número de capítulos, ou preferência estética. Capítulos em `references/` já são carregados sob demanda — dividir por tamanho traz custo sem benefício.

---

## 6. Fusão

Fundir quando: dois skills têm ≥30% de conteúdo sobreposto, ou o mesmo leitor precisa dos dois sempre juntos, ou um virou majoritariamente capítulo do outro, ou um está sem owner.

**Regra:** ao fundir, o skill absorvido vira **ponteiro** por 1–2 releases antes de ser arquivado. Nunca remoção súbita.

---

## 7. Arquivamento

### 7.1 Três estágios

```
Vigente → Deprecated → Ponteiro → Arquivado
```

- **Deprecated:** aviso no topo, aponta o substituto, conteúdo intacto
- **Ponteiro:** ≤10 linhas apontando o sucessor
- **Arquivado:** movido para histórico; deixa de ser instrução

Só avança de estágio com **substituto vigente e verificado**.

### 7.2 Quando arquivar

Substituto vigente há ≥1 release · obsoleto e sem quem defenda · fundido · contradiz autoridade e não será corrigido · foi integralmente convertido em guard.

> **O melhor destino de um skill é virar guard e ser arquivado.** Isso não é fracasso — é a maturação esperada: a regra deixou de depender de leitura e passou a ser garantida.

---

## 8. Ciclo completo

```
 PROPOSTA ──5 portões──► reprovado ──► guard | capítulo | doc
     │ aprovado
     ▼
 NASCIMENTO (v1.0.0, owner, gatilho, comandos verificáveis)
     │
     ▼
 USO ──► defeito encontrado ──► PATCH imediato (dever do agente)
     │
     ├─ capítulo novo ─────► MINOR
     ├─ sentido muda ──────► MAJOR (direção)
     ├─ sobreposição ≥30% ─► FUSÃO ──► ponteiro
     ├─ leitores distintos ► DIVISÃO (se couber no teto)
     └─ 2 trimestres sem uso ► presunção de obsolescência
                                    │
                                    ▼
                    Deprecated → Ponteiro → Arquivado
                                    │
                              (ideal: virou guard)
```

---

## 9. Cadência

| Ritual | Frequência | Duração | Saída |
|---|---|---|---|
| Correção em uso | Contínua | minutos | PATCH |
| Revisão de PR de instrução | Por PR | minutos | Aprovação |
| Revisão trimestral | Trimestral | **<1h** | Lista de obsoletos + candidatos a guard |
| Auditoria completa | Anual ou 3+ Críticos | ~1 dia | Relatório |

Se a revisão trimestral não couber em 1h, a resposta é **remover artefatos** — nunca alocar mais tempo.

---

## 10. Aplicação ao estado atual

| Artefato | Portões | Destino |
|---|---|---|
| `jinlong-architecture` (incompleto, untracked) | Passa | **Nasce** como `jinlong` — o árbitro |
| `jinlong-design` | Passa (leitor distinto, owner distinto) | **Mantém** — 2º slot |
| `engineering-loop` | Falha portão 1 | **Capítulo** de `jinlong` + ponteiro |
| `production-debugger` | Falha portões 1 e 4 | **Capítulo** `operacao-e-incidentes.md` |
| `supabase*` (3) | Vendor | **Intocados** |
| PDV / fiscal / auditoria / observabilidade / eventos / tenant | Falham portão 1 | **Capítulos**, criados sob demanda real |
| Go-Live | Falha portão 3 | **Documentação** — eleger 1 canônico |
| Prompts V2/V3/COMPLETA | — | **Arquivar** |

Resultado: **2 skills internos**, 2 slots livres, nenhuma cobertura perdida.

---

## 11. Cláusula final

> Skill não é lugar de guardar conhecimento. É lugar de **mudar o comportamento de um agente**.
>
> Conhecimento vai para `docs/`. Garantia vai para guard. Skill é o que sobra — e deve sobrar pouco.
