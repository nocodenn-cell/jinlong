# Auditoria Go-Live — FRENTE 2UX: Cadastros Mestres (UX/UI e Usabilidade)

> **Prefixo de achado:** **`F2UX-XX`** (renomeado em 2026-08-05). Antes usava `F2-XX`, que
> colidia com `F2-PROD-XXX` / `F2-CLI-XXX` da auditoria **de dados**
> (`docs/auditoria/AUDITORIA_F2_CADASTROS_GO_LIVE.md`) — mesmo prefixo, escopos diferentes.
> **Fila de execução:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`. Achados desta frente são
> P2 (acessibilidade e polimento), **pós-R1**.

> **Pergunta central:** um operador de loja real consegue usar estas telas sem treinamento
> extenso, sem cometer erros caros e sem precisar perguntar "por que isso está assim"?
> **Resposta curta:** ⚠️ **Parcialmente.** Existe um padrão de qualidade alto no sistema —
> mas ele **não foi aplicado de forma uniforme**. A inconsistência entre telas é o problema
> dominante desta frente, não a falta de recursos.

| Campo | Valor |
|---|---|
| Data | 2026-08-03 |
| Método | Navegação runtime autenticada (perfil GERENTE) + medição de DOM/acessibilidade |
| Ambiente | `next dev` em `localhost:3001` · base real (113 produtos · 12 categorias · 9 funcionários) |
| Telas | Catálogo · Categorias de produtos · Marcas · Clientes · Fornecedores · Funcionários · Categorias financeiras |
| Alterações no sistema | **Nenhuma** — auditoria somente-leitura, nenhum registro criado ou editado |

---

## 1. A tese desta frente: existe padrão, falta uniformidade

A medição mais reveladora foi comparar acessibilidade dos botões entre telas equivalentes:

| Tela | Botões | Sem rótulo acessível | Situação |
|---|---:|---:|---|
| Catálogo | 92 | **0** | ✅ exemplar |
| Marcas | 10 | **0** | ✅ exemplar |
| Fornecedores | — | 0 | ✅ |
| Clientes | — | 0 | ✅ |
| Funcionários | — | 0 | ✅ |
| **Categorias financeiras** | 21 | **9** | 🔴 falha |

O Catálogo tem 92 botões e **zero** sem rótulo. Categorias Financeiras tem 21 e **nove**
sem rótulo. Isso prova que o design system e a régua de qualidade **existem e funcionam** —
uma tela específica ficou fora da curva. É um problema de aplicação, não de capacidade.

Esse padrão se repete em quase todos os achados abaixo: a solução boa já existe em alguma
tela do próprio sistema. **Corrigir a Frente 2 é majoritariamente propagar padrões internos,
não inventar soluções.**

---

## 2. Achados por severidade

### 🔴 F2UX-01 — Categorias Financeiras: 9 botões invisíveis para leitor de tela

**Evidência.** Medição no DOM da tela: 21 botões em `main`, **9 sem texto, sem `aria-label`
e sem `title`**. Um deles é literalmente:

```html
<button class="rounded p-1 text-jl-fg-3 transition-colors hover:bg-white/[0.04] …">
  <svg width="14" height="14" …>   <!-- ícone puro, nenhum texto acessível -->
```

Na árvore de acessibilidade, a coluna Ações aparece como `button "✓"` seguido de
`button` (vazio). O operador vê dois ícones sem legenda e **não tem como saber qual exclui**.

**Impacto na operação.** Ação destrutiva sem rótulo é convite a erro. Numa tela de
categorias financeiras, apagar a categoria errada desorganiza a classificação de despesas
de todo o histórico.

**Risco futuro.** Falha WCAG 2.1 (4.1.2 Nome, Função, Valor) — impeditivo em qualquer venda
para órgão público ou empresa com política de acessibilidade.

**Correção mínima.** Aplicar o padrão que **já existe em Marcas**: `aria-label="Editar marca
brastemp"` / `aria-label="Inativar brastemp"` — rótulo com o nome do registro, não genérico.

**Critério de aceite.** Zero botões sem nome acessível em `main`, verificável pela mesma
sonda usada nesta auditoria.

### 🔴 F2UX-02 — Duplicatas visualmente indistinguíveis

**Evidência (runtime).** Em Categorias de Produtos, a tabela exibe literalmente:

| Nome | Produtos | Situação |
|---|---|---|
| galo | 0 | Inativo |
| galo | 0 | Inativo |
| geladeira | 1 | Inativo |
| geladeira | 0 | Inativo |
| mobilia | 0 | Inativo |
| mobilia | 0 | Inativo |

Duas linhas "galo", ambas com 0 produtos, ambas inativas — **nenhum elemento visual as
distingue**. No Catálogo o mesmo ocorre com `cachorro grande` (×2) e `cadeira ferro` (×2),
com preços idênticos.

**Impacto na operação.** O operador não consegue decidir qual editar ou excluir. Em
Transferências (auditoria anterior) o combobox mostra 6× "caneta" — risco direto de
movimentar o item errado.

**Risco futuro.** Cada duplicata gera uma bifurcação silenciosa no histórico: parte das
vendas em uma categoria, parte na outra. Relatórios ficam incorretos sem parecer incorretos.

**Correção mínima.** Curto prazo: exibir um discriminador na tabela (SKU, código ou data de
criação) sempre que houver nomes repetidos. Definitivo: índice único por
`(lower(nome), loja_id)` — hoje inexistente para categorias e marcas.

**Critério de aceite.** Impossível criar categoria/marca com nome já existente na loja; nomes
repetidos legados exibem discriminador visível.

### 🟠 F2UX-03 — Sem validação de CPF/CNPJ

**Evidência.** No modal de Fornecedores, digitei `11111111111111` e o campo aceitou,
formatando para `11.111.111/1111-11` — um CNPJ com dígito verificador inválido.
Busca por validador (`validarCNPJ`, `isValidCNPJ`, `digitoVerificador`) em `app/`, `lib/` e
`shared-core/`: **nenhuma ocorrência**. O writer de clientes apenas remove a máscara:
`app/admin/clientes/customerWriter.ts:20` → `input.documento.replace(/\D/g, '')`.

**Nuance justa.** A máscara funciona bem e o `inputmode="numeric"` está correto (teclado
numérico em tablet). O problema é confundir **formatação** com **validação** — o campo
*parece* validado.

**Impacto na operação.** Documento inválido só será descoberto na emissão fiscal, quando a
SEFAZ rejeitar. Combinado com o achado F1-01 (nenhuma loja tem CNPJ), o risco é sistêmico.

**Correção mínima.** Validador de DV de CPF/CNPJ no blur do campo, com feedback imediato.

**Critério de aceite.** `11.111.111/1111-11` é rejeitado no formulário, antes do submit.

### 🟠 F2UX-04 — Botões desabilitados sem explicação

**Evidência.** Em Funcionários, **6 das 9 linhas** têm `Editar` e `Desativar` com
`[disabled]` — todas as de perfil Dono, Admin e Gerente. Nenhum `title`, tooltip ou nota
explica o motivo.

**Nuance importante:** a **regra está correta** — é a proteção contra escalada de privilégio
(gerente não altera Dono/Admin), e é um acerto de segurança. O defeito é puramente de
comunicação.

**Impacto na operação.** O usuário conclui que o sistema está quebrado, e abre chamado de
suporte para um comportamento intencional.

**Correção mínima.** `title="Somente o Dono pode editar este perfil"` nos botões desabilitados.

**Critério de aceite.** Todo controle desabilitado informa o motivo ao passar o mouse.

### 🟠 F2UX-05 — Inconsistência de recursos entre telas equivalentes

Medição comparativa das telas de cadastro:

| Tela | Busca | Filtro status | Ordenação | Paginação | Exportar | Ação em lote |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Catálogo | ✅ | ✅ (+origem, categoria, marca, fornecedor, estoque, imagem) | ✅ | ✅ | ✅ | ✅ |
| Categorias produtos | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Marcas | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Fornecedores | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ (checkbox presente, desabilitado) |
| Funcionários | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Clientes** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Categorias financeiras** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

**Clientes** e **Categorias financeiras** são os pontos fora da curva. Clientes é um cadastro
que cresce indefinidamente e hoje **não tem paginação nem filtro** — com 1 registro funciona;
com 3.000 clientes, trava. Categorias financeiras **não tem sequer campo de busca**, e a
coluna `tipo` (receita/despesa) existe no banco mas **não é exibida nem filtrável**, embora
o subtítulo prometa "Gerenciar categorias de receitas e despesas".

**Correção mínima.** Definir um "contrato de tela de cadastro" (busca + filtro de status +
ordenação + paginação) e aplicá-lo às telas defasadas. O Catálogo já é a referência pronta.

### 🟡 F2UX-06 — Máscara inconsistente na mesma linha

**Evidência.** Em Clientes, a única linha exibe documento `999.999.888-52` (formatado) e
telefone `819886459993` (**cru, sem máscara**) — lado a lado, na mesma linha da tabela.

**Impacto.** Telefone sem formatação é difícil de ler e de ditar em voz alta ao ligar para o
cliente. Sugere descuido justamente na tela de relacionamento.

**Correção mínima.** Aplicar máscara `(81) 98864-5999` na exibição.

### 🟡 F2UX-07 — Contadores com plural incorreto

**Evidência.** Clientes exibe **"1 clientes"** como heading (`h2`).
Já Categorias exibe "12 categorias" e Marcas "2 marcas" — corretos por acaso, porque o
número é plural. Não há tratamento de singular em nenhuma delas.

**Correção mínima.** Helper de pluralização compartilhado (`1 cliente` / `2 clientes`).

### 🟡 F2UX-08 — Ordem dos botões de ação invertida entre telas

**Evidência.**
- Categorias de produtos: `[Ativar] [Editar categoria]`
- Marcas de produtos: `[Editar marca brastemp] [Inativar brastemp]`

Duas telas **irmãs**, criadas para a mesma finalidade, com a ordem dos botões trocada.

**Impacto.** Quebra a memória muscular. O operador que alterna entre as telas clica em
Ativar/Inativar quando queria Editar.

**Correção mínima.** Fixar a ordem: ação primária (Editar) primeiro, alternância de status
depois — em todas as telas de cadastro.

### 🟡 F2UX-09 — Empty state com texto enganoso

**Evidência.** Fornecedores (base **realmente vazia**, 0 registros, sem busca ativa) exibe:
*"Nenhum fornecedor encontrado — Tente outro termo de busca, ou cadastre um novo fornecedor."*

**Nuance:** este é, no mérito, o **melhor empty state do sistema** — tem título, orientação e
CTA. O defeito é só não distinguir "lista vazia" de "busca sem resultado".

**Correção mínima.** Dois textos: sem registros → *"Nenhum fornecedor cadastrado ainda.
Cadastre o primeiro para começar a registrar compras."*; com busca → manter o atual.

### 🟢 F2UX-10 — Rótulos de busca inconsistentes

`BUSCAR` (caixa alta, Categorias e Marcas) × *"Buscar por nome, CPF/CNPJ, e-mail ou
telefone…"* (Clientes) × *"Nome, SKU ou código de barras…"* (Catálogo).

O padrão descritivo do Catálogo/Clientes é superior — informa **por quais campos** a busca
funciona. Propagar.

---

## 3. O que está genuinamente bom (e deve ser preservado)

Auditoria honesta registra acertos com o mesmo rigor:

- **Catálogo é referência de mercado.** 9 filtros combináveis, ordenação por 3 colunas,
  paginação, CSV import/export, importação de NF-e, seleção em lote — com 92 botões e
  **zero** problema de acessibilidade. Supera o Bling em densidade de filtros.
- **Orientação de fluxo no lugar certo.** O Catálogo avisa no cabeçalho:
  *"Muitos produtos? Prefira Importar NF-e ou CSV. Use Cadastro rápido só para exceções."*
  Isso é UX madura: guia o usuário ao caminho eficiente **antes** de ele escolher o lento.
- **Formulário de fornecedor bem construído.** Radio PJ/PF que reconfigura o formulário,
  endereço agrupado com seção própria, UF como select (elimina digitação inválida),
  máscara automática e `inputmode="numeric"`.
- **Rótulos contextuais em Marcas e Catálogo.** `"Editar marca brastemp"` em vez de
  `"Editar"` — o leitor de tela informa exatamente qual registro será afetado. É o padrão
  correto, e já está implementado.
- **Bilinguismo consistente.** Alternância PT/普通话 presente em todas as telas, com
  categorias bilíngues (`数码配件 · Acessórios eletrônicos`). Diferencial real para o
  público-alvo, e mantido sem quebrar layout.
- **Skip link** (*"Ir para conteúdo principal"*) presente em todas as telas — detalhe de
  acessibilidade que muitos ERPs comerciais não têm.

---

## 4. Sinal de qualidade de dados visível na interface

Não é UX, mas apareceu na navegação e afeta diretamente a experiência:

- **Dados de teste em produção**, visíveis ao operador na primeira página do Catálogo:
  `[CTR:DONE] pdv`, `[SMOKE:DONE] [SMOKE] draft`, `[TX270] com estoque`.
- **Categorias digitadas à mão estão órfãs**: "galo" (0 produtos), "mobilia" (0), "casa" (1)
  — enquanto as bilíngues concentram o catálogo (4, 4, 4, 5 produtos). Indica que o cadastro
  manual de categoria foi usado para teste e nunca limpo.
- **89 de 113 produtos sem categoria** (soma das colunas "Produtos" = 24), o que torna o
  filtro por categoria pouco útil na prática.

---

## 5. Prontidão para operação real de loja

| Tela | Veredito | Justificativa |
|---|:--:|---|
| Catálogo | ✅ Pronto | Completo e consistente; só precisa expurgo de dados de teste |
| Marcas | ✅ Pronto | Pequeno, coerente, acessível |
| Fornecedores | ⚠️ Com restrições | Tela boa; falta validação de CNPJ |
| Funcionários | ⚠️ Com restrições | Falta tooltip nos desabilitados e campo de comissão (ver F1) |
| Categorias de produtos | ⚠️ Com restrições | Duplicatas indistinguíveis |
| Clientes | ⚠️ Com restrições | Sem paginação/filtro — não escala; máscara inconsistente |
| Categorias financeiras | ❌ Não pronto | 9 botões sem rótulo; sem busca; coluna tipo não exibida |

**Veredito da Frente 2:** ⚠️ **Pronto com restrições.** Nenhum achado desta frente é, por si
só, bloqueador legal — diferente da Frente 1. O conjunto, porém, produz atrito diário e
risco de erro humano em operação real.

---

## 6. Plano de correção (ordenado por custo/benefício)

### Bloco A — Baixo esforço, alto impacto
1. F2UX-01 · `aria-label` nos 9 botões de Categorias Financeiras *(copiar padrão de Marcas)*
2. F2UX-04 · `title` explicativo nos botões desabilitados de Funcionários
3. F2UX-07 · helper de pluralização
4. F2UX-08 · unificar ordem dos botões de ação
5. F2UX-09 · separar empty state de "sem dados" e "sem resultado"

### Bloco B — Consistência estrutural
6. F2UX-05 · paginação + filtro de status em Clientes
7. F2UX-05 · busca + coluna/filtro de tipo em Categorias Financeiras
8. F2UX-06 · máscara de telefone na exibição
9. F2UX-10 · padronizar placeholders de busca

### Bloco C — Prevenção de erro
10. F2UX-03 · validação de DV de CPF/CNPJ
11. F2UX-02 · discriminador visual para duplicatas + índice único

---

## 7. Limites desta auditoria

Declarados para não superestimar a confiança do relatório:

- **Avaliação visual de pixels não foi possível**: o modelo de visão retornou erro 404 nesta
  sessão. Portanto **não** avaliei cor, contraste real, alinhamento, tipografia renderizada
  nem hierarquia visual percebida. Tudo acima é medido via DOM e árvore de acessibilidade —
  são fatos estruturais, não impressões estéticas. **Recomendo uma passagem visual
  complementar** antes de fechar a frente.
- **Responsividade mobile/tablet não verificada** — relevante, já que PDV costuma rodar em
  tablet.
- **Navegação por teclado e ordem de foco não testadas.**
- Perfil auditado: **GERENTE**. A experiência de OPERADOR pode diferir.
- **Nenhum registro foi criado ou alterado**: preenchi um formulário para testar máscara, mas
  **não submeti** — a base permanece intacta.
