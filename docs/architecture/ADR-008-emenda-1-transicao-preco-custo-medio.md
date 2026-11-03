# ADR-008 · Emenda 1 — Transição de `produtos.preco_custo_medio` para `estoque.custo_medio`

| Campo | Valor |
|---|---|
| **Status** | Plano para revisão. **Nada implementado.** Nenhuma migration, nenhuma alteração em produção ou homologação |
| **Data** | 2026-11-03 |
| **Decisão de origem** | Emenda 1, §4.3 (`produtos.preco_custo_medio`), decisão do responsável em 2026-11-03 |
| **Relacionados** | [ADR-008 vigente (preservado)](../adr/ADR-008-inventory-domain-boundary.md) · [Emenda 1](../adr/ADR-008-emenda-1-custo-medio.md) · [Proposta técnica revisada](./ADR-008-emenda-1-mapa-escritores-e-modo-sombra.md) |
| **Pendências mantidas** | **D3** (precedência de custo NF-e × landed) e **D4** (data de corte e auditoria histórica) seguem pendentes. **D6** (validação contábil) é obrigatória antes de qualquer escrita em produção |

---

## 1. Decisão a ser registrada

Decisão do responsável (2026-11-03), reproduzida como critério de aceite:

1. `produtos.preco_custo_medio` deixa de ser informação oficial na interface.
2. Não são permitidas novas gravações nesse campo.
3. As consultas passam a usar a fonte canônica `estoque.custo_medio`, respeitando empresa e loja.
4. Todos os consumidores existentes são auditados: telas, relatórios, RPCs, consultas e integrações.
5. A coluna permanece no banco, marcada como legada e depreciada.
6. A coluna não é excluída até comprovar que nenhum consumidor depende dela e que a migração está completa.

**Pré-requisito que a decisão não cobre:** `estoque.custo_medio` **não existe**. Ele é criado na fase 2 (proposta técnica revisada, §5). Portanto a troca de consultas (critério 3) só pode ser executada depois da criação dessa coluna e do escritor canônico. Até lá, a ação possível é o critério 1 (remover da interface), que não depende de banco.

---

## 2. Auditoria de consumidores (levantamento de 2026-11-03)

Código: `git grep` no worktree. Banco: definições vigentes no banco isolado reconstruído a partir das 459 migrations (`prosrc`, `pg_get_viewdef`). **Não foi feita consulta a produção nem a homologação.**

### 2.1 Interface e aplicação

| Consumidor | Arquivo | Uso | Ação na transição |
|---|---|---|---|
| Seção de preços do cadastro | `pdv-importados/components/gerente/produtos/form/sections/PrecosSection.tsx:148-152` | exibe "Custo médio" | **Remover da interface** (fase T1). Hoje o rótulo afirma "Calculado automaticamente pelas entradas de compra", o que é falso: o campo nunca é gravado |
| Mapeador do formulário | `components/gerente/produtos/form/produtoForm.mappers.ts:107` | `custoMedio` | Remover (T1) |
| Tipo do produto (gerente) | `lib/gerente/produtos/produtoGerenteTypes.ts:21` | `preco_custo_medio: number` | Remover do tipo (T4) |
| Leitura do catálogo | `app/admin/produtos/productReader.ts:91,206,219,247` | lê e mapeia o campo | Trocar fonte (T3) ou remover (T1) |
| Mapeador da lista | `app/admin/produtos/productListMappers.ts:21` | repassa para a lista | Remover (T4) |
| Leitura de custos do gerente | `lib/gerente/produtos/custosProdutos.ts` (RPC `produtos_custos_autorizados`) | lê `preco_custo_medio` por loja | **Trocar fonte** (T3) |
| Tipo compartilhado | `shared-core/src/products/types.ts:124` | `precoCustoMedio: number` | Remover do contrato, com versão (T4) |
| Tipos gerados | `lib/supabase/database.types.ts` (5 ocorrências) | gerado | Regenerar após T2 |
| i18n | `src/lib/i18n/pt.json:398-399`, `zh.json:398-399` | rótulo e dica | Remover; a dica atual é falsa (T1) |

### 2.2 Testes

| Teste | Referência | Ação |
|---|---|---|
| `lib/gerente/produtos/custosProdutos.test.ts` (5) | campo do contrato | Atualizar com a fonte nova (T3) |
| `app/admin/produtos/productReader.test.ts` (1) | mapeamento | Atualizar (T4) |
| `components/gerente/produtos/ProdutoFormCompletoClient.*.test.tsx` (2) | campo na UI | Atualizar (T1) |
| `app/admin/catalogo/_components/*.test.tsx` (2) | campo na tabela e no formulário | Atualizar (T1) |
| `tests/n1-preco-custo-guard.test.ts` (2) | **garante que o campo NÃO é lido diretamente** pelo role autenticado | Manter a garantia e adaptar à nova fonte (T3) |
| `e2e/importacoes-demo.spec.ts:43` | lê `produtos?select=...preco_custo_medio` via serviço | **Atualizar** antes de remover a coluna (T4) |
| `e2e/importacoes-hub.spec.ts` (1) | menção ao campo | Verificar e atualizar (T4) |

### 2.3 Banco de dados

| Objeto | Tipo | Referência | Ação |
|---|---|---|---|
| `produtos.preco_custo_medio` | coluna | — | Depreciar (T2); remover só no fim (T6) |
| `produtos_custos` | view | `preco_custo_medio` na definição | Manter até T5; depois recriar sem a coluna |
| `produtos_custos_autorizados(uuid[])` | RPC | retorna `preco_custo_medio` por `(produto_id, loja_id)` | **Criar versão nova** com `p_loja_id` e `estoque.custo_medio` (T3); manter a antiga até T5 |
| Escritores de `preco_custo_medio` | funções e triggers | **nenhum** encontrado (busca em `prosrc` e no código) | Bloquear novas gravações (T2) |

**Observação de desenho:** a RPC atual já expõe um valor "por loja", mas ele é a **mesma** coluna global de `produtos` repetida para cada loja. Isso contradiz D2 e é o motivo pelo qual a troca de fonte não é cosmética.

### 2.4 Scripts e integrações

| Arquivo | Uso | Ação |
|---|---|---|
| `backend/scripts/n1-preco-custo-authz-smoke.mjs` | verifica que o campo não é legível pelo role autenticado | Adaptar ao novo contrato (T3) |
| `backend/scripts/promover-hardening-produtos.mjs` (4) | verifica precisão `10,2` de `preco_custo_medio` | Remover a checagem quando a coluna sair (T6) |
| `backend/scripts/upgrade-sobre-clone-producao.sh` (3) | mesma checagem | Idem (T6) |
| `ops/rollback_20261022100000_produtos_custos_rpc.sql` | rollback histórico | **Preservar** (histórico) |
| Migrations históricas | definições antigas | **Não alterar** |

**Integrações externas:** nenhum consumidor encontrado em `pdv-local`, `site`, `supabase/functions` ou webhooks. A busca não cobre sistemas de terceiros que leiam o banco diretamente. Essa verificação não é possível pelo repositório e fica como pendência (§6, item P-2).

---

## 3. Estratégia de transição

Fases em ordem. Cada fase tem critério de saída; nenhuma avança sem ele.

| Fase | Conteúdo | Tipo de mudança | Critério de saída |
|---|---|---|---|
| **T0** | Registrar a decisão na Emenda 1; este plano; auditoria | Documentação | Revisão deste plano |
| **T1** | Remover o campo da interface (seção de preços, mapeadores, formulário, lista). Remover o rótulo e a dica falsos. Ajustar testes de UI | **Código**, sem banco | Testes de UI verdes; nenhuma tela mostra o campo; typecheck verde |
| **T2** | Bloquear novas gravações: trigger `BEFORE UPDATE OF preco_custo_medio` que rejeita mudança, e marcação de comentário `DEPRECATED` na coluna | **Migration** (após D6 e aprovação) | Teste de regressão: UPDATE direto é rejeitado; RPCs existentes continuam funcionando (não escrevem o campo) |
| **T3** | Criar `estoque.custo_medio` (fase 2 da proposta) e a nova RPC de leitura por `(produto_id, loja_id)`, respeitando tenant. Trocar as consultas de `custosProdutos.ts` e `productReader.ts` para a nova RPC | **Migration + código** | Consultas retornam a fonte canônica; teste de isolamento entre lojas e empresas |
| **T4** | Remover leituras restantes, tipos, contrato `shared-core`, testes e scripts; regenerar tipos | **Código** | Busca no repositório sem referência ativa (exceto histórico) |
| **T5** | Período de observação: a view e a RPC antiga ficam ativas sem consumidor, com registro de chamadas quando o ambiente permitir | **Operação** | Critério de remoção (§4) atendido |
| **T6** | Remover a coluna, a view antiga e a RPC antiga | **Migration destrutiva** | Critérios de §4 comprovados e backup verificado |

**Regra de ordem:** T2 pode ocorrer antes de T3, porque bloquear escrita não muda leitura. T1 pode ocorrer já, porque não depende de banco. T6 não pode ocorrer antes de T4 e T5.

**Rollback por fase:**
- T1: reverter o commit de interface.
- T2: remover o trigger (migration de volta).
- T3: manter a RPC antiga até T5; a troca de consultas é revertível por commit.
- T6: recriar a coluna `numeric(10,2)` e a view a partir das definições preservadas; os valores não voltam (a coluna nunca foi gravada, então não há perda).

---

## 4. Critérios para remoção futura da coluna (T6)

Todos obrigatórios:

1. **Código:** busca por `preco_custo_medio` e `precoCustoMedio` no repositório retorna apenas histórico (migrations, rollbacks, documentação).
2. **Banco:** nenhuma função, view, trigger ou política referencia a coluna (verificar por `prosrc` e `pg_get_viewdef`, como na auditoria, em todos os ambientes de referência).
3. **Contratos:** `shared-core` e tipos gerados não expõem o campo; versão do contrato incrementada.
4. **Observação:** o período de T5 terminou sem chamada à RPC antiga, ou essa verificação está indisponível e o responsável aceita o risco por escrito.
5. **Integrações:** pendência P-2 resolvida (confirmado com os responsáveis que nenhum sistema externo lê a coluna).
6. **Reversibilidade:** backup verificado e script de recriação testado em ambiente isolado.
7. **Dados:** a substituição não depende de D3 nem de D4 (a remoção do campo legado não decide precedência de custo nem data de corte).

---

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Troca de fonte antes de `estoque.custo_medio` existir | T3 só começa após a fase 2 (sombra aceita e escritor canônico) |
| RPC nova com contrato diferente quebra telas | Manter RPC antiga até T5; testes de contrato |
| Integração externa não listada lê a coluna | Pendência P-2 bloqueia T6; comunicação antes da remoção |
| Valores exibidos hoje (possivelmente zero) são tomados como verdadeiros | T1 remove a exibição, e o rótulo falso sai junto |
| Teste de garantia N1 deixa de valer ao trocar a fonte | Adaptar o teste, não removê-lo (T3) |

---

## 6. Pendências

| # | Pendência | Dono |
|---|---|---|
| P-1 | Confirmar em homologação e produção, em leitura, se `produtos.preco_custo_medio` tem valores diferentes de zero | Responsável técnico |
| P-2 | Confirmar com operadores e integradores que nenhum sistema externo lê a coluna ou a RPC | Responsável de produto |
| P-3 | Decidir se o período de observação de T5 terá registro de chamadas (depende de logs disponíveis no provedor) | Responsável técnico |
| D3 | Precedência de custo NF-e × landed. **Pendente** | Contador / produto |
| D4 | Data de corte e auditoria histórica. **Pendente** | Responsável técnico |
| D6 | Validação contábil do método. **Obrigatória** antes de qualquer escrita em produção | Contador |

---

## 7. Registro na Emenda 1

Decisão registrada na Emenda 1 (§4.3): o campo `produtos.preco_custo_medio` foi retirado como informação oficial pelo responsável em 2026-11-03. A transição segue este plano em seis fases. A remoção da coluna depende dos critérios de §4 e não é decidida por este documento.

## 8. Próximo passo

Revisão deste plano. Após a revisão, a fase T1 (remover da interface) pode ser implementada sem migration, mediante autorização.
