# Tickets Go-Live — Frente 2: Cadastros Inconsistentes

> Fila de execução para Claude Code. Gerado por Hermes (análise somente-leitura).
> Cada ticket é uma unidade de trabalho objetiva, com evidência real do banco.
> Nenhum dado foi alterado para produzir esta fila.

**Origem das evidências:** consultas REST `service_role` em `produtos`, `estoque`,
`itens_venda`, `vendas`, `categorias`, `marcas`, `historico_precos_produto`, `clientes`,
`fornecedores`, `usuarios`. Base atual = 113 produtos, 12 categorias, 2 marcas, 1 cliente,
0 fornecedores, 12 usuários, 56 vendas.

**Status de todos:** `OPEN`

---

## Princípio de classificação (GAP 1 resolvido)

Esta fila separa **dois eixos independentes**:

- **Severidade** (risco/impacto técnico): 🔴 🟠 🟡 🟢
- **Bloqueador de Go-Live** (decisão de produto/negócio): a especificação exige este dado
  para a loja *abrir*? Se sim → `Bloqueador: SIM`; caso contrário é dívida (P1/P2).

**Regra aplicada (critério de produto):** a especificação do Jīn Lóng exige
**"Fornecedor principal"** no cadastro de produtos. Logo, **fornecedor inexistente é o
único bloqueador verdadeiro desta frente** (F2-PROD-003 / F2-FOR-001). Os demais 🔴
(categoria ausente, histórico de preço) são severos, mas não impedem a loja de abrir —
são dívidas de qualidade/auditoria (P1/P2).

---

## TICKET F2-PROD-001
**Título:** 82 produtos publicados sem categoria

**Categoria:** Produto

**Severidade:** 🔴 Bloqueante (operacional)

**Bloqueador Go-Live:** ❌ NÃO — dívida P1

**Justificativa de não-bloqueio:** categoria ausente degrada filtros/relatórios e pode
afetar classificação tributária, mas a loja consegue vender sem ela. É pendência de
qualidade, não de abertura.

**Problema:** 93 de 113 produtos não têm `categoria_id`; 82 deles estão com
`status_publicacao = PUBLICADO` e aparecem à venda no PDV.

**Evidência:**
- tabela `produtos` · campo `categoria_id` nulo em 93/113 (82 publicados)
- tela `/admin/catalogo` (filtro Categoria vazio para esses itens)
- RPC de criação não exige categoria (`ProdutoFormModal` permite salvar sem)

**Impacto operacional:** Operador não consegue filtrar/relatorioar por categoria;
produtos públicos sem classificação afetam precificação automática e emissão fiscal
(classificação tributária dependente de categoria em alguns regimes).

**Local provável:**
- `components/gerente/produtos/ProdutoFormModal.tsx` (validação de submit)
- `lib/core/catalog/statusPublicacao.ts`
- migration de `produtos` (ação de constraint ou trigger de aviso)

**Critério de aceite:** Produto com `status_publicacao = PUBLICADO` não pode ser salvo sem `categoria_id`; produtos já publicados sem categoria devem ser listados em tela de "pendências de cadastro".

**Status:** OPEN

---

## TICKET F2-PROD-002
**Título:** 99 produtos publicados sem marca

**Categoria:** Produto

**Severidade:** 🟠 Alto risco

**Bloqueador Go-Live:** ❌ NÃO — dívida P1

**Problema:** 111 de 113 produtos não têm `marca_id`; 99 publicados. Embora marca seja
recomendada (não obrigatória), 99% do catálogo público sem marca prejudica filtros e
relatórios de marca.

**Evidência:** tabela `produtos` · `marca_id` nulo em 111/113 (99 publicados).

**Impacto operacional:** Relatórios por marca vazios; experiência de filtragem reduzida.

**Local provável:** `components/gerente/produtos/form/sections/*` (Classificação);
`lib/navigation/routes` (filtros de catálogo).

**Critério de aceite:** Decidir se marca é obrigatória para publicação; se não, exibir
aviso não-bloqueante e permitir filtro "Sem marca".

**Status:** OPEN

---

## TICKET F2-PROD-003
**Título:** 0 fornecedores cadastrados — 113 produtos sem fornecedor

**Categoria:** Fornecedor / Produto

**Severidade:** 🔴 Bloqueante

**Bloqueador Go-Live:** ✅ **SIM** (único bloqueador desta frente — critério de produto)

**Justificativa de bloqueio:** a especificação do Jīn Lóng exige **"Fornecedor principal"**
no cadastro de produtos. Sem fornecedor:
- a **compra fica sem rastreabilidade** (não se sabe a origem da mercadoria);
- a **reposição futura fica comprometida** (sem fonte cadastrada, não há o que recomprar);
- o **histórico comercial fica incompleto** (não há vínculo produto↔fornecedor).

**Problema:** A tabela `fornecedores` está vazia. Nenhum produto tem fornecedor
associado. O fluxo de Compras/Recebimento não tem origem possível; o módulo Compras fica
inoperante.

**Evidência:**
- tabela `fornecedores` → 0 registros
- `produtos` → nenhum `fornecedor_id`
- tela `/admin/compras` sem fornecedor selecionável

**Impacto operacional:** Loja não consegue registrar compra nem receber mercadoria com
rastreio de fornecedor — quebra o ciclo de reposição e o controle de custo de entrada.

**Local provável:** `app/gerente/fornecedores/actions.ts` (criação); seed inicial;
`components/gerente/produtos/form/sections/FornecedorQuickField.tsx`.

**Critério de aceite:** Existe ao menos 1 fornecedor ativo; todo produto vendável tem
fornecedor principal ou alerta de pendência; módulo Compras permite selecionar fornecedor.

**Status:** OPEN

---

## TICKET F2-PROD-004
**Título:** 66 produtos sem preço de custo / 70 sem preço de atacado

**Categoria:** Produto

**Severidade:** 🟠 Alto risco

**Bloqueador Go-Live:** ❌ NÃO — dívida P1

**Problema:** 66/113 produtos têm `preco_custo` nulo/zero; 70/113 têm `preco_atacado`
nulo/zero. Sem custo, a margem não é calculável; sem atacado, a faixa atacado não existe.

**Evidência:** tabela `produtos` · `preco_custo=0` em 66, `preco_atacado=0` em 70.

**Impacto operacional:** Relatório de margem (Curva ABC) ignora esses itens; cliente
atacadista não tem preço diferenciado.

**Local provável:** `components/gerente/produtos/form/sections/PrecosSection.tsx`;
`lib/gerente/cadastroSugestaoClient.ts`.

**Critério de aceite:** Ao publicar, custo é recomendado (warning se zerado); atacado
opcional mas, se preenchido, `preco_atacado < preco_varejo` deve alertar.

**Status:** OPEN

---

## TICKET F2-PROD-005
**Título:** Produto com margem negativa (varejo < custo)

**Categoria:** Produto

**Severidade:** 🟠 Alto risco

**Bloqueador Go-Live:** ❌ NÃO — dívida P1

**Problema:** 1 produto publicado (`QA CSV UPD 1778596755070`) tem `preco_varejo=19,99`
e `preco_custo=38` → venda abaixo do custo. Produto de teste ainda publicado.

**Evidência:** `produtos` · `preco_varejo (19,99) < preco_custo (38)` em 1 registro.

**Impacto operacional:** Venda direta com prejuízo não sinalizada; contamina relatórios.

**Local provável:** `PrecosSection.tsx` (validação de margem); flag "permitir preço
abaixo do custo" deve ser explícita e auditada.

**Critério de aceite:** Venda abaixo do custo só é permitida com flag explícita
`permitir_preco_abaixo_custo=true`; caso contrário, bloquear publicação.

**Status:** OPEN

---

## TICKET F2-PROD-006
**Título:** 8 nomes de produto duplicados (caneta ×6, gato branco ×4…)

**Categoria:** Produto

**Severidade:** 🟠 Alto risco

**Bloqueador Go-Live:** ❌ NÃO — dívida P1

**Problema:** 8 nomes repetidos entre produtos: `caneta` (6), `gato branco` (4),
`gato` (3), `papel` (2), `regua` (2), `cadeira ferro` (2), `cachorro grande` (2),
`quadro negro` (2). No PDV, operador não distingue qual item está vendendo.

**Evidência:** agregação de `produtos.nome` → 8 grupos com count > 1.

**Impacto operacional:** Risco de venda do item errado no PDV; kardex dividido sem
critério; relatórios duplicados.

**Local provável:** `app/gerente/produtos/actions.ts` (criação — sem unique por
`(lower(nome), loja_id)`); `components/gerente/produtos/*` (combobox PDV).

**Critério de aceite:** Ao cadastrar nome já existente na loja, exigir discriminar
(SKU/código) ou bloquear; itens legados duplicados exibem discriminador no PDV.

**Status:** OPEN

---

## TICKET F2-PROD-007
**Título:** 68 produtos publicados sem saldo em estoque

**Categoria:** Produto / Estoque

**Severidade:** 🟠 Alto risco

**Bloqueador Go-Live:** ❌ NÃO — dívida P1

**Problema:** 68 de 101 produtos PUBLICADOS não têm linha em `estoque` ou têm
`quantidade_atual = 0`. Estão visíveis no PDV como "à venda" mas indisponíveis.

**Evidência:** join `produtos` (PUBLICADO) × `estoque` (`quantidade_atual>0`) → 68 sem saldo.

**Impacto operacional:** Operador tenta vender item sem estoque; quebra de fluxo no
caixa; cliente frustrado.

**Local provável:** `lib/gerente/estoqueInicialCadastro.ts`; `criar_produto_com_estoque_inicial`;
tela PDV (deve ocultar ou sinalizar "sem estoque").

**Critério de aceite:** Produto público sem saldo aparece como "indisponível" no PDV ou
exige confirmação de venda sem estoque; relatório de pendências lista esses itens.

**Status:** OPEN

---

## TICKET F2-PROD-008
**Título:** 2 produtos inativos/draft com histórico de venda

**Categoria:** Produto

**Severidade:** 🟡 Melhoria

**Bloqueador Go-Live:** ❌ NÃO — dívida P2

**Problema:** 2 produtos com `status_publicacao` INATIVO/DRAFT aparecem em `itens_venda`
(vendidos). Regra de negócio: não se deve vender item inativo. Pode indicar venda antes
da inativação (legítimo) ou furo de regra.

**Evidência:** join `itens_venda` → `produtos` onde status ≠ PUBLICADO → 2 casos
(`QA CSV UPD …` INATIVO; `[SMOKE:DONE] [SMOKE] pdv-estoque` DRAFT). Ambos são dados de teste.

**Impacto operacional:** Risco de venda de item desativado se a regra não for aplicada
no momento da venda.

**Local provável:** `app/caixa/*` (validação de item no carrinho); `lib/core/catalog/statusPublicacao.ts`.

**Critério de aceite:** PDV bloqueia adicionar item com status ≠ PUBLICADO; histórico
existente é preservado mas não reproduzível.

**Status:** OPEN

---

## TICKET F2-PROD-009
**Título:** 7 categorias inativas — 2 produtos publicados associados

**Categoria:** Produto / Categoria

**Severidade:** 🟡 Melhoria

**Bloqueador Go-Live:** ❌ NÃO — dívida P2

**Problema:** De 12 categorias, 7 estão `ativo=false`. 2 produtos PUBLICADOS apontam para
categoria inativa. Exibir categoria inativa no filtro de um produto público é incoerente.

**Evidência:** `categorias.ativo=false` em 7/12; `produtos.categoria_id` → 2 apontam
para categorias inativas.

**Impacto operacional:** Filtro de catálogo mostra categoria que o operador "desativou".

**Local provável:** `components/gerente/categorias-produtos/*`; join em `produtos`.

**Critério de aceite:** Inativar categoria com produtos associados deve exigir
reclassificar os produtos ou manter a categoria visível só para eles.

**Status:** OPEN

---

## TICKET F2-PROD-010
**Título:** Histórico de alteração de preço inexistente (0 registros)

**Categoria:** Produto

**Severidade:** 🔴 Bloqueante (auditoria/fiscal)

**Bloqueador Go-Live:** ❌ NÃO — dívida P2 (auditoria pós-venda)

**Justificativa de não-bloqueio:** a ausência de histórico de preço prejudica auditoria
e rastreabilidade fiscal *após* as vendas, mas não impede a loja de abrir nem de vender.
É dívida de conformidade, não de abertura.

**Problema:** A tabela `historico_precos_produto` existe mas está vazia (0 registros).
Não há trilha de quem, quando, preço anterior/novo, nem motivo.

**Evidência:**
- tabela `historico_precos_produto` → 0 linhas
- `PrecosSection.tsx` altera preço sem gravar em `historico_precos_produto`

**Impacto operacional:** Impossível auditar reajuste de preço; disputa de margem ou
erro de precificação não tem rastreabilidade; exigência fiscal/contratual de histórico
de preços não atendida.

**Local provável:** `app/gerente/produtos/precosAtacadoActions.ts`;
`components/gerente/produtos/form/sections/PrecosSection.tsx`; RPC de atualização de preço.

**Critério de aceite:** Toda alteração de `preco_varejo`/`preco_atacado`/`preco_custo`
grava em `historico_precos_produto` com `usuario_id`, `criado_em`, `preco_antigo`,
`preco_novo` e `motivo` (opcional). Tabela acessível em relatório.

**Status:** OPEN

---

## TICKET F2-PROD-011
**Título:** Código de barras duplicado — risco no PDV

**Categoria:** Produto

**Severidade:** 🟢 Baixo (verificado OK)

**Bloqueador Go-Live:** ❌ NÃO — sem ação

**Problema:** Buscou-se EAN duplicado em múltiplos produtos. Resultado: **0 duplicados**
os códigos de barras existentes são únicos (produtos de teste usam prefixos QA…/CB).

**Evidência:** agregação `produtos.codigo_barras` → nenhum valor com count > 1.

**Impacto operacional:** Nenhum risco atual; manter validação ao cadastrar.

**Local provável:** `app/gerente/produtos/actions.ts` (já há unique
`produtos_codigo_barras_loja_unique` — confirmar cobertura para nulos).

**Critério de aceite:** Manter constraint; ao digitar EAN já existente, bloquear ou
sugerir duplicar cadastro.

**Status:** OPEN

---

## TICKET F2-CLI-001
**Título:** Base de clientes insuficiente para validar duplicidade (1 cliente)

**Categoria:** Cliente

**Severidade:** 🟢 Baixo

**Bloqueador Go-Live:** ❌ NÃO — dívida futura (importação)

**Problema:** Apenas 1 cliente real (`AO andre oliveira PF`). Não há duplicidade de
CPF/CNPJ nem telefone, nem dados de teste. A base é de desenvolvimento; em produção isso
precisa ser populado, mas o risco de duplicidade só se materializa com volume.

**Evidência:** `clientes` → 1 registro; 0 duplicados de documento/telefone; 0 teste.

**Impacto operacional:** Baixo agora; alto quando houver importação em massa.

**Local provável:** `app/admin/clientes/actions.ts` (criação — sem unique por
`(documento, loja_id)`); import CSV de clientes.

**Critério de aceite:** Criação/importação de cliente com CPF/CNPJ já existente deve
bloquear ou fundir; tela de clientes mostra aviso de duplicidade provável.

**Status:** OPEN

---

## TICKET F2-FOR-001

> **STATUS (2026-08-05): PARCIALMENTE RESOLVIDO — reclassificado, não fechado.**
> Pré-requisito TB-05 (multi-tenant) fechado — `loja_id` existe, cadastrar um fornecedor real
> agora seria isolado corretamente. **Mas o cadastro continua impossível hoje** por um motivo
> diferente do diagnosticado originalmente: `app/gerente/fornecedores/actions.ts` e
> `app/admin/compras/page.tsx` consultam colunas que **nunca existiram** em `public.fornecedores`
> (`documento`, `tipo`, `email`, `telefone`, `contato_pessoa`, `categoria`, `endereco_*`, `ativo`).
> O schema real, confirmado em produção, é só `id, cnpj, nome, loja_id, created_at, updated_at`.
> As telas `/admin/fornecedores` e `/admin/compras` (query de fornecedores ativos) falham em
> runtime **hoje**, independente de TB-05.
>
> Reclassificado de "fornecedores vazia" para "tela de fornecedor incompatível com o schema real".
> Não é bloqueio de venda (ADR-006 preservado — nada tocado em cadastro/publicação/venda de
> produto). É bloqueio de **Compras**, como o próprio ADR-006 já previa.
>
> **Decisão de escopo necessária antes de corrigir** (fora do escopo de TB-05):
> (a) simplificar a tela para o schema real (cnpj + nome), ou
> (b) desenhar e migrar as colunas que a tela espera (documento/tipo PF-PJ/endereço/ativo).
> Cada opção é uma decisão de produto, não uma correção técnica de 1 linha.

**Título:** Fornecedores incompletos / inexistentes (0 cadastros)

**Categoria:** Fornecedor

**Severidade:** 🔴 Bloqueante

**Bloqueador Go-Live:** ✅ **SIM** (causa-raiz de F2-PROD-003)

**Justificativa de bloqueio:** ver F2-PROD-003 — a especificação exige fornecedor
principal; sem nenhum fornecedor cadastrado o vínculo produto↔fornecedor é impossível.

**Problema:** `fornecedores` vazia. Não há razão social, CNPJ, contato nem dados mínimos
para operação. Toda compra/recebimento fica sem origem.

**Evidência:** `fornecedores` → 0; `ProdutoForm` "Fornecedor principal" vazio.

**Impacto operacional:** Ciclo de compra fechado; custo de entrada não rastreado.

**Local provável:** `app/gerente/fornecedores/actions.ts`; seed de fornecedor demo.

**Critério de aceite:** Cadastro de fornecedor obrigatório antes do primeiro recebimento;
validação de CNPJ (dígito verificador) na criação.

**Status:** OPEN

---

## TICKET F2-USR-001
**Título:** 5 usuários com perfil DONO (excesso de privilégio)

**Categoria:** Funcionário

**Severidade:** 🟠 Alto risco

**Bloqueador Go-Live:** ❌ NÃO — dívida P1 (segurança)

**Problema:** De 12 usuários, 5 têm perfil DONO (provavelmente dados de seed/teste:
`Dono Demo`, `Dono E2E`, `e2e-dono@localhost.test`…). Um Dono real bastaria; múltiplos
Donos ampliam superfície de risco (qualquer Dono cria Admins).

**Evidência:** `usuarios.perfil` → DONO:5, GERENTE:3, OPERADOR:3, ADMIN:1; 0 inativos.

**Impacto operacional:** Superfície de segurança desnecessária; confusão de
responsabilidade.

**Local provável:** `lib/admin/policy/adminPolicy.ts`; seed de usuários.

**Critério de aceite:** Em Go-Live, reter 1 Dono real; demais contas de seed devem ser
inativadas/excluídas ou rebaixadas a GERENTE/OPERADOR.

**Status:** OPEN

---

## TICKET F2-USR-002
**Título:** Usuários sem perfil / inativos operando — verificado OK

**Categoria:** Funcionário

**Severidade:** 🟢 Baixo (verificado OK)

**Bloqueador Go-Live:** ❌ NÃO — sem ação

**Problema:** Buscou-se usuário sem perfil e usuário inativo com operação. Resultado:
0 sem perfil, 0 inativos. A base atual não apresenta esses riscos.

**Evidência:** `usuarios` → todos com perfil definido; `ativo` em todos = true.

**Impacto operacional:** Nenhum atual; manter verificação em runtime (token/sessão de
inativo deve ser revogada — F1/RBAC).

**Local provável:** `lib/admin/policy/adminPolicy.ts`; middleware de sessão.

**Critério de aceite:** Ao inativar usuário, sessões ativas devem ser invalidadas
(refresh token revogado).

**Status:** OPEN

---

## RESUMO DA FILA

| ID | Categoria | Severidade | Bloqueador GL | Título curto |
|---|---|:--:|:--:|---|
| **F2-PROD-003** | Fornecedor | 🔴 | ✅ **SIM** | 0 fornecedores (113 produtos órfãos) |
| **F2-FOR-001** | Fornecedor | 🔴 | ✅ **SIM** | Fornecedores vazios (causa-raiz) |
| F2-PROD-001 | Produto | 🔴 | ❌ (P1) | 82 publicados sem categoria |
| F2-PROD-010 | Produto | 🔴 | ❌ (P2) | Histórico de preço inexistente |
| F2-PROD-002 | Produto | 🟠 | ❌ (P1) | 99 publicados sem marca |
| F2-PROD-004 | Produto | 🟠 | ❌ (P1) | 66 sem custo / 70 sem atacado |
| F2-PROD-005 | Produto | 🟠 | ❌ (P1) | Margem negativa (1) |
| F2-PROD-006 | Produto | 🟠 | ❌ (P1) | 8 nomes duplicados |
| F2-PROD-007 | Produto | 🟠 | ❌ (P1) | 68 publicados sem estoque |
| F2-USR-001 | Funcionário | 🟠 | ❌ (P1) | 5 DONOs (excesso) |
| F2-PROD-008 | Produto | 🟡 | ❌ (P2) | 2 inativos vendidos |
| F2-PROD-009 | Categoria | 🟡 | ❌ (P2) | 7 categorias inativas (2 prod assoc) |
| F2-CLI-001 | Cliente | 🟢 | ❌ (futuro) | Base de cliente insuficiente |
| F2-PROD-011 | Produto | 🟢 | ❌ | EAN duplicado — OK (0) |
| F2-USR-002 | Funcionário | 🟢 | ❌ | Sem perfil/inativo — OK (0) |

**Total:** 15 tickets · 1 bloqueador Go-Live (F2-PROD-003 / F2-FOR-001) · 🔴 4 · 🟠 6 · 🟡 2 · 🟢 3

**Nota de governança:** severidade 🔴 (F2-PROD-001, F2-PROD-010) foi deliberadamente
**desvinculada** do conceito de bloqueador de Go-Live. São problemas graves de qualidade/
auditoria, mas a loja abre sem eles. O único que a especificação torna obrigatório para
abertura é o fornecedor (F2-PROD-003).
