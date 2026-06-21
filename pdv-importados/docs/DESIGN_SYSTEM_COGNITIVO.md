# Design System Cognitivo — FastProduct

**Status:** v1.0 — estável para implementação e validação em produção
**Escopo:** módulo `pdv-importados` (PDV, Recebimento, Importação NF-e, Estoque e telas correlatas)

> Princípio central: **toda tela nasce com uma intenção cognitiva explícita antes de
> qualquer decisão visual ou de componente.** A UI é derivada da intenção —
> nunca o inverso. Decisões de hierarquia, layout, densidade, confirmação e peso
> de ações não são tomadas isoladamente; são consequência da posição da tela no
> modelo abaixo.

---

## 1. O modelo (3 eixos contínuos)

O sistema **não** é uma taxonomia de arquétipos fixos. É um espaço contínuo de
três eixos. "Arquétipos" (operação, processo, híbrida, consulta) são apenas
**apelidos descritivos de regiões** do espaço — não molde rígido.

| Eixo | Faixa | Pergunta que responde |
|------|-------|-----------------------|
| **1. AÇÃO** | baixa → alta | Quanto a tela existe para o usuário **executar / decidir / mudar estado**? |
| **2. OBSERVAÇÃO** | baixa → alta | Quanto a tela existe para o usuário **ler / conferir / entender estado**? |
| **3. FREQUÊNCIA / URGÊNCIA** | baixa → alta | Com que pressão operacional a tela é usada no dia a dia? |

### Papel de cada eixo

- **Eixos 1 e 2 definem a estrutura** (hierarquia, grid, posição de componentes,
  o que é primário vs. subordinado).
- **Eixo 3 é um modulador** — não compete com 1 e 2, não cria categorias, não
  adiciona telas. Ele **ajusta como** ação e observação se manifestam, e explica
  por que duas telas na mesma posição A/O ainda exigem UX diferente.

> **Regra de estabilização:** este ciclo está fechado em 3 eixos. Não adicionar
> novos eixos, arquétipos ou dimensões cognitivas sem novo ciclo de validação.

---

## 2. O que cada posição dita

### Eixos 1 e 2 (estrutura)

| Posição | Consequência estrutural obrigatória |
|---------|-------------------------------------|
| **AÇÃO alta** | CTA dominante e sempre visível; a ação **não pode** se esconder (sem colapso por padrão); cabeçalho da ação é o nível mais forte depois do H1. |
| **AÇÃO baixa** | Sem CTA global dominante; ações são corretivas/pontuais (ex.: por linha). |
| **OBSERVAÇÃO alta** | Superfície de leitura é primária; densidade scaneável; filtros/contexto persistentes. |
| **OBSERVAÇÃO baixa** | Informação é feedback recessivo, subordinado à ação. |
| **AÇÃO alta + OBSERVAÇÃO alta** | Tensão: a observação precisa ser **resolvida antes** de habilitar a ação → emerge sequência/etapas, com **um CTA ativo por vez**. |

### Eixo 3 (modulador — regras fechadas)

| Fator | Alta frequência / urgência | Baixa frequência / eventual |
|-------|----------------------------|-----------------------------|
| **Densidade** | simplificação máxima, leitura instantânea | mais contexto, mais explicação, mais feedback |
| **Tolerância a erro** | erro evitado por design (anti-fricção) + reversível | erro **bloqueado antes** da ação |
| **Confirmação** | mínima ou implícita | explícita e estruturada |

Média frequência = ponto de equilíbrio: validar sem bloquear; confirmação
proporcional ao risco da operação.

---

## 3. Mapeamento das telas (validado para merge)

```
 OBSERVAÇÃO
   alta │  Hub Estoque ●              ● Importar NF-e
        │  (ler estado,               (conferir muito
        │   ação corretiva)            E agir muito → sequência)
   média│
        │                 ● PDV/Caixa
        │                   (agir rápido, observar carrinho)
   baixa│   ● Recebimento
        │     (agir, confirmar leve)
        └─────────────────────────────────────────────
           baixa        média          alta     AÇÃO
```

| Tela | AÇÃO | OBSERV. | FREQ. | Região | Leitura |
|------|------|---------|-------|--------|---------|
| **PDV / Caixa** | Alta | Média | **Alta** | operação | Cockpit de 3 colunas; CTA "Finalizar" dominante; confirmação só para destrutivo (sangria/cancelar/estorno); soft-undo em remoção. **Referência de alta frequência.** |
| **Recebimento** | Alta | Baixa | **Média** | ação-dominante | Form único cria a remessa; histórico é feedback read-only subordinado. Validação inline de divergência (não-bloqueante), escalando com a gravidade. |
| **Importar NF-e** | Alta | Alta | **Baixa** | processo | A/O ambos altos → sequência (conferir reconhecidos/desconhecidos antes de confirmar); gating explícito antes de executar. |
| **Hub Estoque** | Baixa/Média | Alta | **Média** | consulta/gestão | Tabela densa de saldos + filtros; ações de ajuste embutidas por linha; sem CTA global. |

---

## 4. Conflitos estruturais conhecidos (backlog derivado da intenção)

Itens abaixo são derivados do modelo — **não** ajustes cosméticos. Ainda **não
implementados**; aguardam validação/priorização por ciclo.

### Recebimento (A-alta / O-baixa / freq. média)
- **Hierarquia invertida:** cabeçalho da ação (`text-sm`, dentro de bloco
  colapsável) hoje é mais fraco que o do histórico (`text-lg`). A-alta exige o
  oposto. → ação não-colapsável + cabeçalho da ação ≥ histórico.
- **Superfícies indiferenciadas:** ação e histórico usam a mesma superfície. →
  ação com elevação dominante, histórico recessivo.
- **Confirmação plana → adaptativa (derivada do eixo 3):** divergência leve segue
  passando com aviso; divergência **grave** deve escalar para confirmação
  explícita antes de gravar (a operação muta estoque via RPC).

### Importar NF-e (A-alta / O-alta / freq. baixa)
- Sequência hoje invisível e dois CTAs accent de peso igual. → tornar etapas
  explícitas, um CTA ativo por etapa, manter/fortalecer o bloqueio antes de
  importar (correto para baixa frequência).

### Transferências (mesma posição que Recebimento)
- Herda as regras de A-alta. Mudanças aplicadas em Recebimento propagam aqui por
  consistência **de região, não de tela**.

### PDV e Hub Estoque
- **Sem mudança cognitiva.** O modelo valida a estrutura atual. (PDV tem dívida
  de paleta/superfície entre os dois layout variants — tratada fora desta camada,
  como dívida de tokens.)

---

## 5. Como usar este modelo em telas novas

1. Antes de desenhar, posicionar a tela nos 3 eixos.
2. Derivar estrutura de A/O (seção 2).
3. Modular densidade/erro/confirmação por frequência (seção 3).
4. Só então escolher componentes, hierarquia tipográfica e grid.
5. Conferir contra o mapeamento (seção 3) — telas na mesma região devem ser
   consistentes entre si.

> Mudanças de UI não podem ser justificadas por estética isolada. A justificativa
> válida é sempre: **intenção cognitiva (A/O) + pressão operacional (frequência)
> → estrutura → UI.**
