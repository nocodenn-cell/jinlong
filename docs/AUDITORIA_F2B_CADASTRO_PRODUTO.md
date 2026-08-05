# Auditoria Go-Live — F2B: Cadastro de Produtos (perfil DONO)

> Complemento da Frente 2, auditado como **DONO** para fechar a lacuna de perfil
> declarada nas auditorias F1 e F2 (só tinha testado como GERENTE).
> Foco: a tela de **Cadastro de Produto** — criação, campos, obrigatórios, campos
> escondidos, ordem, mensagens de erro.

| Campo | Valor |
|---|---|
| Data | 2026-08-03 |
| Perfil | **Dono** (`aoliveiradamata@gmail.com`) |
| Método | Navegação runtime autenticada + leitura do `ProdutoFormModal.tsx` / `ProdutoForm.tsx` |
| Telas | `/admin/catalogo` → "Cadastro rápido" + formulário completo (Mais detalhes) |
| Alterações | **Nenhuma** — preenchi o formulário para testar validação, mas **não submeti**. `produtos` continua sem o registro de teste |

---

## 0. Comparação DONO × GERENTE (fecha a lacuna de perfil)

| Dimensão | GERENTE | DONO (verificado agora) |
|---|---|---|
| Itens na sidebar | 15 (CORE + SISTEMA) | **15 idênticos** — nenhum a mais |
| Aba Provisionamento (`/admin/provisionamento`) | ❌ ausente | ❌ ausente na UI — confirmado via F1-07: não está no mapa de rotas (`adminPolicy.ts`) |
| Botões do Catálogo | Publicar/Editar/Duplicar/Excluir | idênticos |
| Cadastro de produto | mesmo modal | mesmo modal |

**Conclusão:** para o operador, **DONO e GERENTE enxergam o mesmo sistema**. A única
diferença real está no backend (o Dono consegue criar outros Donos/Admins — **F1-07**;
a citação original a "F1-04" estava errada: F1-04 é `pdv_config` ausente em 5/7 lojas). Na
interface de cadastro de produtos, **não há nada que o Dono veja e o Gerente não veja**.
A auditoria F2 (feita como Gerente) **se mantém válida para o Dono** também.

---

## 1. Visão geral do fluxo de cadastro

O sistema oferece **três entradas** para criar produto (bom — cobre volumes diferentes):

1. **Importar NF-e XML** — via de maior volume, puxa NCM/categoria/fornecedor do XML.
2. **Importar produtos (CSV)** — lote.
3. **Cadastro rápido** — modal inline, para exceções. O cabeçário avisa:
   *"Muitos produtos? Prefira Importar NF-e ou CSV. Use Cadastro rápido só para exceções."*
   → **excelente UX**: antecipa o caminho eficiente antes do usuário escolher o lento.

O modal "Cadastro rápido" tem **dois níveis**:
- **Nível 1 (fechado):** 10 campos, agrupados em ESSENCIAL / PRECIFICAÇÃO / ESTOQUE.
- **Nível 2 (botão "Mais detalhes"):** expande para **26 campos** em 8 seções
  (CLASSIFICAÇÃO, FAIXAS DE PREÇO ATACADO, COMPRA, DADOS FISCAIS).

---

## 2. Campos do nível 1 (Cadastro rápido) — medição real

| # | Campo | Obrigatório? | Label acessível? | Observação |
|---|---|:--:|:--:|---|
| 1 | Código de barras | não | ✅ | placeholder explica GTIN |
| 2 | Nome | **sim** (asterisco) | ✅ | foco cai aqui ao abrir |
| 3 | Unidade de medida | não | ✅ | select UN/KG/CX/FD/M |
| 4 | Código interno | não | ✅ | "SKU interno da loja" |
| 5 | Preço de custo | não | ✅ | |
| 6 | Preço varejo | **sim** (asterisco) | ✅ | obrigatório p/ publicar |
| 7 | Categoria | não | ⚠️ **sem label** | select "Nenhuma categoria" |
| 8 | Fornecedor principal | não | ⚠️ **sem label** | searchbox "Buscar fornecedor…" |
| 9 | Marca | não | ⚠️ **sem label** | select "Nenhuma marca" (aparece no nível 2) |
| 10 | Estoque inicial (UN) | não | ✅ | |

**Achado F2B-01 (🟡):** 3 dos 10 campos do nível 1 (Categoria, Fornecedor, Marca) **não
têm `<label>` associado** — só o texto solto ao lado. O leitor de tela anuncia o select sem
contexto. Corrigível com `aria-labelledby` / `htmlFor`, copiando o padrão dos campos que
estão certos (Nome, Preço).

**Achado F2B-02 (🟡):** os campos obrigatórios usam asterisco visual (`Nome *`) mas o
atributo HTML `required` **não está presente** em nenhum input. A obrigatoriedade é só
visual + validação em JS. Se um dia o JS falhar, o formulário deixa passar. Menor, mas
inconsistente com a premissa de "prevenção de erros".

---

## 3. Campos escondidos e profundidade (o ponto central da sua pergunta)

A seção **DADOS FISCAIS (NF-E)** — onde ficam **NCM, CST, CFOP, origem tributária** — está
em um **segundo acordeão dentro do nível 2**. O caminho para chegar ao NCM é:

```
Catálogo → "Cadastro rápido" → "Mais detalhes" → "Expandir dados fiscais" → [NCM aparece]
```

**4 cliques** para um campo que a SEFAZ exige em **100% dos produtos tributados**.

**Evidência em código** (não suposição):
- `ProdutoForm.tsx:183` → `{props.modoCompleto ? (<FiscalSection />) : null}`
- `ProdutoFormModal.tsx:135` → `const [modoCompleto, setModoCompleto] = useState(editando)`

Ou seja: no **cadastro novo** (`editando=false`), `modoCompleto` começa **falso**. A
`FiscalSection` simplesmente **não é renderizada** até o usuário clicar "Mais detalhes".
E mesmo após "Mais detalhes", a seção fiscal aparece como um `region` vazio até o clique
final em "Expandir dados fiscais".

**Impacto direto (conecta com F1-01):** é exatamente por isso que **105 de 113 produtos
estão sem NCM** na base atual. O campo existe, mas está escondido por trás de dois cliques
e ninguém o preenche no cadastro manual.

**Achado F2B-03 (🟡 — rebaixado e reescopado em 2026-08-05 por ADR-002):** o campo NCM está
oculto por padrão no fluxo de cadastro. O defeito é de **visibilidade**, não de obrigatoriedade.

> **ADR-002 (aprovada em 2026-08-04):** *"NCM não é obrigatório no cadastro. Torna-se
> obrigatório apenas em operação fiscal."* Esclarecimento normativo: *"Cadastro, publicação,
> venda, pedido e recebimento **não** verificam NCM."*
>
> Logo: **não** transformar NCM em campo obrigatório do formulário e **não** bloquear
> `Publicar`. A correção é tornar o campo visível no nível 1 (reduz a origem do problema);
> a exigência pertence a `fiscal_enfileirar_documento_venda`. Ver `FRN-01`.

Risco real: com 105/113 produtos sem NCM, a fila fiscal acumulará documentos em erro **quando
o fiscal for ligado** (FLX-02). A venda permanece válida — é P2 > P4 pela precedência do Cap. 1-A.

**Mitigante que existe (e é bom):** há busca automática de GTIN (`fetchSugestaoCadastro`).
Se o operador digita um código de barras conhecido, o sistema **auto-preenche NCM, nome,
preço e categoria** (`ProdutoFormModal.tsx:174-180`). Excelente — mas só funciona para
produtos de catálogo conhecido; para o cadastro manual chinês/avulso, o NCM fica invisível.

---

## 4. Validação e mensagens de erro (testadas de verdade)

Submeti o formulário vazio e depois com nome-only:

| Situação | Mensagem | Foco moveu para? | Avaliação |
|---|---|---|---|
| Salvar vazio | "Nome do produto é obrigatório" | ✅ campo Nome | 🟢 claro e foca o campo |
| Nome OK, preço vazio | "Informe um preço de varejo válido." | ✅ campo Preço | 🟢 claro, validação sequencial |
| Botão "Salvar rascunho" | permite salvar sem preço | n/a | 🟢 esperado (rascunho) |

**Achado F2B-04 (🟢):** as mensagens de erro são em **português claro**, aparecem inline
junto ao campo (`role=alert`) e o **foco do teclado é movido automaticamente** para o campo
errado. Este é um dos pontos mais maduros da tela — supera muitos ERPs comerciais.

---

## 5. Ordem dos campos vs. processo real

No nível 1 a ordem é: **Código de barras → Nome → Unidade → Código interno → Preço custo →
Preço varejo → Categoria → Fornecedor → Marca → Estoque inicial**.

- ✅ **Nome vem antes de preço** — segue o processo real (identifica, depois precifica).
- ✅ **Estoque inicial no fim** — coerente (cadastra o quê, depois quanto tem).
- 🟡 **Código de barras em 1º lugar** tem lógica (o foco já cai lá para escaneamento), mas
  para quem cadastra à mão, "Nome" seria o primeiro instintivo. Menor — o foco no código de
  barras suporta o caso de scanner, que é o mais comum em loja física. Aceitável.
- 🟡 **Categoria/Fornecedor/Marca vêm depois do preço**, mas a própria tela diz que são
  "Recomendados: categoria, marca e fornecedor. Podem ser completados depois." → coerente
  com a filosofia de cadastro rápido.

**Conclusão de ordem:** o fluxo respeita o processo real de loja. Nenhuma inversão
problemática como a que encontrei entre Categorias e Marcas (F2-08).

---

## 6. Excesso ou falta de campos?

- **Nível 1 (10 campos):** enxuto, adequado para cadastro rápido. Sem excesso.
- **Nível 2 (26 campos):** completo para operação real — atacado com faixas, estoque
  mínimo, localização, referência de fornecedor, nome reduzido para PDV, observação,
  flag "permitir preço abaixo do custo". **Sem excesso** para um ERP; o agrupamento em
  seções ajuda.
- **Campos SEM explicação (🟡):** a maioria tem helper text, mas "Qtd. mínima atacado"
  depende de tooltip e "Permitir preço abaixo do custo" não diz *por que* alguém ativaria
  (margem negativa deliberada?). Pequenos ajustes de microcópia.

---

## 7. Resumo de severidades (Cadastro de Produto)

| ID | Severidade | Achado |
|---|:--:|---|
| F2B-03 | 🟡 | NCM oculto por padrão — 2 cliques + `modoCompleto=false`. **Corrigir visibilidade, não obrigatoriedade** (ADR-002 / `FRN-01`) |
| F2B-01 | 🟡 | 3 campos (Categoria/Fornecedor/Marca) sem `<label>` acessível no nível 1 |
| F2B-02 | 🟡 | Obrigatórios só visuais (asterisco), sem `required` no HTML |
| F2B-04 | 🟢 | Validação e mensagens de erro — maduras e acessíveis (ponto forte) |

---

## 8. Correção mínima para o 🔴

**Opção A (recomendada, menor esforço):** no cadastro novo, iniciar `modoCompleto=true`
**apenas para a seção fiscal**, ou tornar o NCM visível no nível 1 quando a origem exigir
nota. Não precisa abrir o formulário todo — só garantir que o operador *veja* o NCM antes de
salvar um produto que vai para o PDV.

**Opção B (defensiva):** ao tentar "Publicar" (não rascunho) um produto sem NCM, bloquear
com alerta: *"Este produto será vendido mas não poderá emitir nota fiscal — informe o NCM
em Dados fiscais."* Isso transforma o risco em erro de validação, não em campo escondido.

Ambas são frontend puro — não tocam o banco nem as RPCs.

---

## 9. Limites

- Avaliação de **cor/contraste/tipografia** não feita (modelo de visão indisponível nesta
  sessão) — medições são de DOM/acessibilidade, fatos estruturais.
- Testado apenas perfil **DONO**; a diferença para GERENTE nesta tela é nula (§0).
- **Nenhum dado foi gravado**: o produto de teste "Produto Auditoria Teste" não foi
  submetido — confirmado `produtos?nome=eq.Produto Auditoria Teste → []`.
