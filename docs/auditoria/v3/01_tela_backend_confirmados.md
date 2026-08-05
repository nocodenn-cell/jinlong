# Auditoria Hermes v3 — Tela ↔ Backend (campo-a-campo)

**Data:** 2026-08-04 (rodada 3)
**Escopo:** Auditoria 3 — a lacuna arrastada por duas rodadas, agora fechada.
**Natureza:** somente leitura.
**Base:** `remote_schema.sql` (produção) + `shared-core/src/*/policies/` + `pdv-importados/app/admin/*`

## Método

Para cada entidade: ler a política de validação em TypeScript → listar as regras → confrontar com as colunas, CHECKs, índices e RPCs **reais em produção**. Divergência em que o **backend é mais permissivo** que o frontend é vulnerabilidade (o frontend é contornável); o inverso é bug de usabilidade/dados.

## Placar

| Veredito | Qtd |
|---|---|
| **CONFIRMADO** | 4 |
| **RISCO** | 1 |
| **DESCARTADO** | 3 |

---

## TB-02

**Título:** `preco_atacado >= preco_varejo` é bloqueado no update em TS, mas aceito na criação e sem CHECK no banco

**Categoria:** Inconsistência

**Veredito:** CONFIRMADO

**Quadro comparativo:**

| Tela | Campo | Frontend | Backend | Problema |
|---|---|---|---|---|
| `/admin/catalogo` (editar) | `preco_atacado` | rejeita se `>= preco_varejo` (`ATACADO_INVALID`) | sem validação | regra só no cliente |
| `/admin/catalogo` (criar) | `preco_atacado` | **não valida** | sem validação | regra ausente nos dois lados |
| `produtos` (tabela) | `preco_atacado` | — | **nenhum CHECK** | dado inconsistente persistível |

**Descrição:**
`validateUpdateProductCommand` rejeita preço de atacado maior ou igual ao varejo. `validateCreateProductCommand` **não tem essa regra**. A RPC `criar_produto_com_estoque_inicial` grava `preco_atacado` direto do payload, validando apenas `preco_varejo < 0`. A tabela `produtos` não tem CHECK relacionando os dois preços.

**Impacto operacional:** Produto pode ser criado com atacado maior que varejo — comprar em quantidade sai mais caro. Como `calcular_preco_produto` aplica atacado por quantidade, o PDV cobraria o preço maior automaticamente ao atingir o gatilho, sem ninguém perceber.

**Evidências:**
- Regra no update: `shared-core/src/products/policies/validateProductInput.ts:77-83`
- Ausente no create: mesmo arquivo, `:21-48`
- RPC sem validação: `remote_schema.sql`, função `criar_produto_com_estoque_inicial` — apenas `IF v_preco_varejo < 0 THEN RAISE EXCEPTION 'CRIAR_PRODUTO_PRECO'`
- Tabela sem CHECK: `remote_schema.sql`, `CREATE TABLE public.produtos` — CHECKs existentes cobrem `cest`, `cfop_produto`, `ncm`, `comissao_tipo`, `comissao_valor`, `origem`; **nenhum** para relação entre preços

**Fluxo afetado:** Cadastro → Venda (precificação)

**Comportamento atual:** Criação aceita; edição rejeita. Banco aceita sempre.

**Comportamento esperado:** CHECK no banco (`preco_atacado IS NULL OR preco_atacado < preco_varejo`) como autoridade, espelhado no create do TS.

**Causa provável:** Regra nasceu no formulário de edição legado e não foi propagada ao create nem ao schema.

**Prioridade:** **P1**

**Arquivos:** nova migration com CHECK; `shared-core/src/products/policies/validateProductInput.ts`

**Critério de aceite:** `INSERT` com `preco_atacado >= preco_varejo` é rejeitado pelo banco.

---

## TB-03

**Título:** Preço de produto: create aceita `>= 0`, update exige `> 0` — mesma entidade, duas regras

**Categoria:** Inconsistência

**Veredito:** CONFIRMADO

**Quadro comparativo:**

| Tela | Campo | Frontend (create) | Frontend (update) | Backend | Problema |
|---|---|---|---|---|---|
| `/admin/catalogo` | `preco_varejo` | `>= 0` (aceita zero) | `> 0` (rejeita zero) | `>= 0` | produto com preço 0 é criável mas não editável |

**Descrição:**
`validateCreateProductCommand` aceita `preco >= 0`; `validateUpdateProductCommand` exige `preco > 0` (`PRICE_NOT_POSITIVE`). A RPC aceita `>= 0`. Os próprios comentários do arquivo documentam a divergência como intencional ("espelho CRIAR_PRODUTO_PRECO" vs "espelho EditarProdutoCatalogoSchema") — mas o efeito é uma armadilha.

**Impacto operacional:** Produto criado com preço zero fica **impossível de editar** pela tela: qualquer tentativa de salvar falha na validação de update, mesmo que o usuário esteja corrigindo justamente o preço. Só sai do estado por acesso direto ao banco.

**Evidências:**
- Create `>= 0`: `validateProductInput.ts:34-37`
- Update `> 0`: `validateProductInput.ts:67-70`
- RPC `>= 0`: `remote_schema.sql`, `IF v_preco_varejo < 0 THEN RAISE EXCEPTION`
- Tabela: `preco_varejo numeric(10,2) NOT NULL`, sem CHECK de positividade

**Fluxo afetado:** Cadastro → Catálogo

**Comportamento atual:** Estado irrecuperável pela UI.

**Comportamento esperado:** Regra única. Decidir se preço zero é válido (brinde/bonificação) e aplicar igual nos três pontos.

**Causa provável:** Schemas escritos em momentos diferentes, espelhando fontes diferentes.

**Prioridade:** **P1**

**Arquivos:** `shared-core/src/products/policies/validateProductInput.ts`; migration com CHECK

**Critério de aceite:** Produto criável é sempre editável — teste com `preco_varejo = 0`.

---

## TB-04

**Título:** CPF/CNPJ e e-mail de cliente são validados apenas em TypeScript; persistência é `INSERT` direto sem RPC

**Categoria:** Segurança / Dados

**Veredito:** CONFIRMADO

**Quadro comparativo:**

| Tela | Campo | Frontend | Backend | Problema |
|---|---|---|---|---|
| `/admin/clientes` | `documento` (PF) | exige 11 dígitos | `text` nullable, sem CHECK | validação contornável |
| `/admin/clientes` | `documento` (PJ) | exige 14 dígitos | idem | idem |
| `/admin/clientes` | `email` | regex | `text`, sem CHECK | idem |
| `/admin/clientes` | `nome` | `>= 2` chars | `NOT NULL` (aceita 1 char) | backend mais permissivo |

**Descrição:**
`validateClienteInput.ts` valida quantidade de dígitos de CPF/CNPJ, formato de e-mail e tamanho de nome. Em produção, `clientes` só tem `clientes_tipo_check` (PF/PJ) e `clientes_limite_credito_check` (`>= 0`). Nenhum CHECK de formato.

Agravante: `customerWriter.ts` faz `.from('clientes').insert(...)` — **INSERT direto na tabela**, sem RPC intermediária. Não existe camada de servidor revalidando. A única barreira é o TypeScript da Server Action.

**Impacto operacional:** Cliente com documento inválido entra no banco por qualquer caminho que não passe pelo formulário. Compromete a emissão fiscal (documento do destinatário) e a unicidade — o índice `clientes_loja_documento_unique` protege contra duplicata exata, mas não contra `"123"` e `"00000000000"`.

**Evidências:**
- Validação TS: `shared-core/src/customers/policies/validateClienteInput.ts:5,12,20-35,42`
- Schema em produção: `remote_schema.sql`, `CREATE TABLE public.clientes` — `documento text` (nullable, sem CHECK), `email text`, `nome text NOT NULL`
- Constraints existentes: apenas `clientes_tipo_check`, `clientes_limite_credito_check`
- INSERT direto: `pdv-importados/app/admin/clientes/customerWriter.ts:63-64`

**Fluxo afetado:** Cadastro → Fiscal (destinatário) → Financeiro (contas a receber)

**Comportamento atual:** Formato garantido só pela UI.

**Comportamento esperado:** CHECK de formato no banco (comprimento e composição de dígitos por tipo), como já é feito para `ncm`, `cfop_produto` e `cest` em `produtos` — o padrão existe no projeto, só não foi aplicado aqui.

**Causa provável:** Módulo de clientes construído sobre acesso direto à tabela, sem a camada de RPC usada em produto/estoque.

**Prioridade:** **P1**

**Arquivos:** nova migration com CHECKs em `clientes`

**Critério de aceite:** `INSERT` com documento de 5 dígitos é rejeitado pelo banco.

---

## TB-05

**Título:** `fornecedores` não tem `loja_id` e o CNPJ é único global — quebra de isolamento multi-tenant

**Categoria:** Segurança

**Veredito:** CONFIRMADO

**Quadro comparativo:**

| Entidade | Isolamento por loja | Unicidade |
|---|---|---|
| `clientes` | `loja_id` + policy | `UNIQUE (loja_id, documento)` ✅ |
| `produtos` | `loja_id NOT NULL` | — |
| `estoque` | `loja_id` + FK | — |
| **`fornecedores`** | **nenhum** ❌ | `UNIQUE (cnpj)` **global** ❌ |

**Descrição:**
A tabela `fornecedores` não possui coluna `loja_id`. A policy RLS `fornecedores_gerente_all` filtra **apenas por perfil** (`GERENTE`/`DONO`/`ADMIN`), sem qualquer cláusula de loja — tanto em `USING` quanto em `WITH CHECK`. O índice `uq_fornecedores_cnpj` impõe unicidade global de CNPJ.

Em um SaaS multi-tenant, isso significa: **todo gerente de qualquer loja vê e edita os fornecedores de todas as lojas**. E se a Loja A cadastra o CNPJ de um fornecedor, a Loja B não consegue cadastrá-lo — recebe erro de duplicidade sobre um registro que não pode nem deveria ver.

**Impacto operacional:** Vazamento de dados comerciais entre clientes do SaaS (a carteira de fornecedores é informação competitiva sensível). Além disso, gerente de uma loja pode **alterar ou excluir** fornecedor usado por outra, quebrando `contas_pagar`, `ordens_compra` e `produtos` alheios via as FKs existentes.

Não encontrei ADR ou regra documentando "fornecedor é global por design" — `.cursor/rules/entity-ssot.mdc` trata fornecedor como entidade de negócio normal, com tela própria.

**Evidências:**
- Tabela sem `loja_id`: `remote_schema.sql`, `CREATE TABLE public.fornecedores` → colunas `id`, `cnpj NOT NULL`, `nome NOT NULL`, `created_at`, `updated_at`
- Unicidade global: `remote_schema.sql:9811` → `CREATE UNIQUE INDEX "uq_fornecedores_cnpj" ON "public"."fornecedores" ("cnpj")`
- Policy sem loja: `remote_schema.sql:11023-11027` → `USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil = ANY (ARRAY['GERENTE','DONO','ADMIN'])))` — nenhuma referência a `loja_id`
- Contraste (feito certo): `clientes_loja_documento_unique` (`:9223`) e policies de `estoque` com `loja_id`
- FKs dependentes: `contas_pagar`, `ordens_compra` (`ON DELETE SET NULL`), `produtos`, `importacoes_nfe`, `vinculos_fornecedor_produto` (`ON DELETE CASCADE`)

**Fluxo afetado:** Cadastro → Compra → Recebimento → Financeiro (contas a pagar)

**Comportamento atual:** Fornecedores compartilhados entre todos os tenants.

**Comportamento esperado:** Decisão de produto. Se multi-tenant real: `loja_id NOT NULL`, unicidade `(loja_id, cnpj)`, policy com filtro de loja — espelhando `clientes`. Se fornecedores forem intencionalmente globais, isso precisa de ADR **e** de restrição de escrita (só ADMIN), pois hoje qualquer GERENTE altera o cadastro de todos.

**Causa provável:** Tabela criada em `075_importacao_nfe_compra.sql`, no contexto de importação de NF-e (single-tenant), e nunca revista quando o modelo multi-loja foi introduzido (`032_lojas_estoque_por_loja.sql`).

**Prioridade:** **P0** — é vazamento entre tenants, mesma classe de SEC-01/SEC-02

**Arquivos:** nova migration (`loja_id`, índice composto, policy); `pdv-importados/app/admin/fornecedores/`

**Dependências:** decisão de produto; backfill de `loja_id` para linhas existentes

**Critério de aceite:** Gerente da Loja A não enxerga fornecedor exclusivo da Loja B; CNPJ repetido é aceito em lojas distintas.
