# ADR-008 · Emenda 1 · T2 — Auditoria do bloqueio de escrita em `produtos.preco_custo_medio`

| Campo | Valor |
|---|---|
| **Status** | Auditoria. **Nenhuma migration criada, nenhum código alterado, nenhuma alteração em produção ou homologação** |
| **Data** | 2026-11-03 |
| **Fase** | T2 do [plano de transição](./ADR-008-emenda-1-transicao-preco-custo-medio.md) (bloquear novas gravações) |
| **Preservados** | [ADR-008 vigente](../adr/ADR-008-inventory-domain-boundary.md) · [Emenda 1](../adr/ADR-008-emenda-1-custo-medio.md) |
| **Pendências mantidas** | D3 e D4 pendentes. D6 obrigatório antes de qualquer escrita em produção |
| **Base de evidência** | Definições **vigentes** no banco isolado (reconstruído a partir de 459 migrations), `git grep` no worktree (commit `e0f9d6e4`). **Produção e homologação não foram consultadas** |

---

## 1. Achado central

**`authenticated` pode gravar a coluna hoje.** A tabela `produtos` concede `INSERT`, `UPDATE` e `DELETE` a `authenticated` (privilégio de tabela), e a coluna `preco_custo_medio` herda `UPDATE` e `INSERT`. A barreira atual é apenas a RLS:

- `produtos_escrita` (`ALL`, role `authenticated`): `auth_usuario_gerencial_loja(loja_id)`;
- `tenant_guard` (`ALL`, role `authenticated`): restrição por empresa via `fp_guarda.produto_empresa`.

Portanto um usuário gerencial de uma loja pode, em tese, enviar `PATCH /produtos?id=eq.…` com `preco_custo_medio` e alterar o campo. Nenhum código da aplicação faz isso (seção 2), mas a proteção não existe no banco. **Isso torna T2 obrigatória de fato, e não apenas uma limpeza.**

A leitura direta da coluna já está bloqueada (privilégio N1: `authenticated` não tem `SELECT` na coluna). A leitura legítima ocorre pela view `produtos_custos` e pela RPC `produtos_custos_autorizados`, ambas com `SELECT`/`EXECUTE` para `authenticated`.

---

## 2. Mapa dos escritores

### 2.1 Escritores de linha (`UPDATE` / `INSERT` que atribuem a coluna)

| # | Escritor | Tipo | Evidência | Atribui a coluna? |
|---|---|---|---|---|
| E1 | Aplicação: `.update()` / `.insert()` de produto | código | `git grep` em `pdv-importados/app`, `components`, `lib`: **nenhuma** atribuição | Não |
| E2 | Aplicação: payload que ecoa o objeto lido (`productReader` mapeia o campo) | código | `productListMappers.ts:21`, `productReader.ts:219` (leitura). Nenhum payload de escrita foi encontrado que o inclua | **Risco potencial**, não identificado no código atual (ver §5) |
| E3 | Função `criar_produto_com_estoque_inicial` | banco (vigente) | `INSERT INTO produtos` sem a coluna na lista → recebe `DEFAULT 0` | Só o default |
| E4 | Função `internal.importar_nfe_transacao` | banco (vigente) | `INSERT`/`UPDATE` de `produtos` sem a coluna (`preco_custo`, `preco_varejo`) | Não |
| E5 | Função `internal.cobranca_seed_demo` | banco (vigente) | `INSERT INTO produtos` sem a coluna | Só o default |
| E6 | Migrations históricas | histórico | Única menção à coluna: `20260816135000:65` (leitura do `information_schema`). Nenhuma atribuição | Não |
| E7 | Seeds (`backend/supabase/seed.sql`), scripts (`backend/scripts`, `pdv-importados/scripts`) | arquivos | Nenhuma atribuição (só verificação de precisão em `promover-hardening-produtos.mjs` e `upgrade-sobre-clone-producao.sh`) | Não |
| E8 | Triggers de `produtos` | banco (vigente) | `trg_fn_produtos_margem` (BI/BU), `trg_historico_precos_produto` (AU), `set_updated_at`, `registrar_criado_por_produto`, `registrar_atualizado_por_produto`, `trg_validar_varejo_maior_que_tiers_ativos` | Nenhum atribui a coluna |
| E9 | Ação de DML por role com privilégio de tabela (`authenticated`, `service_role`, `postgres`) | privilégio | `information_schema.column_privileges` | **Sim, possível por SQL/REST** (sem nenhum uso no código) |

**Conclusão do mapa:** não há escritor **intencional** ativo. A coluna é gravada apenas pelo `DEFAULT 0` nos inserts. O risco real é a **capacidade** de E9, não um fluxo existente.

### 2.2 Escritores de valor (fora de `produtos`)

| Objeto | Relação | Achado |
|---|---|---|
| `produtos_custos` (view) | Projeção de leitura | Dona da coluna `preco_custo_medio` na definição. Não grava |
| `produtos_custos_autorizados(uuid[])` | RPC de leitura | Retorna `preco_custo_medio` por `(produto_id, loja_id)`. Não grava |
| `historico_precos_produto` | Trigger `AFTER UPDATE` | Registra `preco_custo_anterior/novo`, **não** o médio |

---

## 3. Mapa dos consumidores (leitura)

| Consumidor | Tipo | Como lê | Dependência da coluna |
|---|---|---|---|
| `lib/gerente/produtos/custosProdutos.ts` | aplicação | RPC `produtos_custos_autorizados` | Direta |
| `app/admin/produtos/productReader.ts` (+ `productListMappers.ts`) | aplicação | Campo mapeado do catálogo (`precoCustoMedio`) | Direta; valor sempre `0` no caminho atual |
| `shared-core/src/products/types.ts:124` | contrato | `precoCustoMedio: number` | Tipo |
| `lib/supabase/database.types.ts` | gerado | Tipos Row/Insert/Update | Tipo (permite escrita em TypeScript) |
| `pdv-importados/e2e/importacoes-demo.spec.ts:43` | teste e2e | `produtos?select=...preco_custo_medio` com serviço | Direta |
| `backend/scripts/n1-preco-custo-authz-smoke.mjs` | script | Confirma que a view e a coluna respeitam privilégios | Direta |
| `backend/scripts/promover-hardening-produtos.mjs`, `upgrade-sobre-clone-producao.sh` | script | Checa precisão `10,2` | Direta |
| `pdv-importados/tests/n1-preco-custo-guard.test.ts` | teste | Garante que o campo **não** é lido pelo autenticado | Direta |
| Testes de UI (4 arquivos) | teste | Fixtures com o campo | Fixture |
| Usuários REST com a view `produtos_custos` | externo | `GET /produtos_custos?select=*` | **Desconhecido** (pendência P-2) |

**Observação:** a view `produtos_custos` concede `SELECT` a `authenticated`. Isso é a superfície de leitura gerencial e precisa ser conferida quanto a `security_invoker` antes da T3.

---

## 4. Estratégia de bloqueio

### 4.1 Opções

| Opção | Mecanismo | Efeito | Reversível | Recomendação |
|---|---|---|---|---|
| **A. Trigger de bloqueio** | `BEFORE INSERT OR UPDATE OF preco_custo_medio ON produtos` | Rejeita qualquer valor **diferente** do atual (update) e qualquer valor **diferente de 0** (insert). Afeta todos os roles, inclusive `service_role` e `postgres` | Sim (`DROP TRIGGER`) | **Recomendada para T2** |
| **B. Revogar privilégio de coluna** | `REVOKE UPDATE (preco_custo_medio) FROM authenticated` (e `INSERT`) | Nega a escrita pelo REST para `authenticated` | Sim, mas **exige** revogar o privilégio de tabela e reconceder por coluna. Risco de quebrar escritas de outras colunas | Adiar; fazer depois da T2 como defesa em profundidade |
| C. Remover a coluna | — | Quebra consumidores | Não | Fora de T2 (é T6) |

**Por que A antes de B:** B mexe em privilégio de tabela com efeito amplo (todas as colunas de `produtos` para `authenticated`). A altera apenas o campo legado, e falhar é fácil de reverter.

### 4.2 Regra do trigger (proposta, a ser validada na implementação)

```
UPDATE: se NEW.preco_custo_medio IS DISTINCT FROM OLD.preco_custo_medio → erro PRODUTO_CUSTO_MEDIO_LEGADO
INSERT: se NEW.preco_custo_medio IS DISTINCT FROM 0 → erro PRODUTO_CUSTO_MEDIO_LEGADO
```

Pontos de desenho:
- **Comparação `IS DISTINCT FROM` no UPDATE** é obrigatória. Um `UPDATE` que reenvia o valor atual (ex.: payload que ecoa o objeto lido) **não** deve falhar. Sem isso, qualquer escrita de linha inteira quebraria.
- **INSERT aceita 0** porque é o default que os inserts atuais já usam (E3, E5).
- **Não** usar `RAISE` silencioso nem substituir o valor por 0: silenciar esconde divergência. Erro explícito.
- O trigger roda **antes** de `trg_fn_produtos_margem`, que lê preços e não o campo.

### 4.3 Estratégia de implantação

1. Revisão desta auditoria e aprovação.
2. Teste de regressão **antes** da migration (ver §6), inclusive com o `productUpdater` integração contra o stack isolado.
3. Migration aditiva: função + trigger + `COMMENT ON COLUMN ... IS 'DEPRECATED — ADR-008 Emenda 1'`.
4. Aplicar primeiro em **ambiente isolado** (replay completo), depois em homologação **com autorização** e conforme a checagem de drift.
5. Monitorar erros `PRODUTO_CUSTO_MEDIO_LEGADO` nos logs do provedor (se disponível, pendência P-3). Qualquer ocorrência indica um escritor não mapeado.
6. Só então considerar a opção B.

---

## 5. Riscos de regressão

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Payload de escrita que ecoa o objeto **com valor diferente** (ex.: objeto antigo) falha | Baixa (nenhum escritor identificado) | Médio: erro em tela de edição | Regra `IS DISTINCT FROM`; teste de ecoo; monitoramento |
| R2 | Integração externa grava o campo | Desconhecida | Alto: erro em integração | P-2 antes da implantação; mensagem de erro clara |
| R3 | Inserts com valor ≠ 0 de scripts de carga | Baixa | Médio | Varredura de scripts e seeds (feita: nenhum) |
| R4 | Tipos gerados permitem escrita (`database.types.ts`) | Certa (tipo) | Baixo em runtime | Não é regressão; remover na T4 |
| R5 | Bloqueio em homologação diverge de produção (drift) | Média | Médio | Replay isolado primeiro; checagem de versões aplicadas |
| R6 | Trigger atrasa escritas em lote | Baixa | Baixo | Operação por linha; sem custo relevante |
| R7 | Dependência de D3/D4 | — | — | **Nenhuma**: T2 não decide custo nem corte |

---

## 6. Testes necessários (antes e depois da migration)

### 6.1 SQL (banco isolado, `BEGIN … ROLLBACK`)

| Teste | Esperado |
|---|---|
| `UPDATE produtos SET preco_custo_medio = 5` como `authenticated` gerente da própria loja | Erro `PRODUTO_CUSTO_MEDIO_LEGADO` |
| Mesmo UPDATE como `service_role` | Erro (bloqueio vale para todos os roles) |
| `UPDATE produtos SET preco_custo_medio = preco_custo_medio` (no-op) | Sucesso |
| `UPDATE produtos SET preco_varejo = …` sem tocar o campo | Sucesso e trigger de margem atua como antes |
| `INSERT` com default (0) | Sucesso |
| `INSERT` com `preco_custo_medio = 5` | Erro |
| `criar_produto_com_estoque_inicial`, `importar_nfe_transacao`, `cobranca_seed_demo` | Sucesso, sem mudança de resultado |
| `DROP TRIGGER` (rollback) e repetição dos testes acima | Comportamento anterior restaurado |

### 6.2 Regressão de aplicação (stack isolado com variáveis de ambiente)

- `app/admin/produtos/productUpdater.semRpc.integracao.test.ts` (2) e `produtosFiscalEdicao.integration.test.ts` (4): escrita real de produto, com echo de payload.
- `lib/import/importIntelligence.integracao.test.ts` (2) e `e2e/importacoes-demo.spec.ts`: produtos criados pela NF-e e pela operação de importação.
- `backend/scripts/n1-preco-custo-authz-smoke.mjs`: privilégios N1 intactos.
- Suíte unitária completa de `pdv-importados` (antes e depois): mesmo resultado.

### 6.3 Teste de escrita indevida (novo)

Um teste que tenta, como gerente de loja A, alterar `preco_custo_medio` de um produto da loja B e da própria loja A, e verifica que **nenhuma** das duas escritas altera o valor. Cobre isolamento e o bloqueio ao mesmo tempo.

### 6.4 Concorrência

Não se aplica ao trigger isoladamente (regra por linha, sem estado). A concorrência relevante é a de escrita do próprio produto, já coberta pelos testes de `produtos` existentes.

---

## 7. Estratégia de rollback

| Nível | Ação | Efeito | Perda de dados |
|---|---|---|---|
| Migration | Migration de rollback: `DROP TRIGGER ...; DROP FUNCTION ...; COMMENT ON COLUMN ... IS NULL` | Restaura a escrita anterior | Nenhuma |
| Código | Não há código na T2 | — | — |
| Operação | Se a regra estiver bloqueando um fluxo legítimo, desativar o trigger por rollback enquanto se investiga | Restaura imediatamente | Nenhuma |

**Garantia de não perda:** o campo nunca foi gravado (E1–E8), então bloquear escrita não apaga nenhum valor. Os valores existentes, se houver (P-1), permanecem intactos.

---

## 8. Pendências para aprovação da T2

| # | Pendência | Ação |
|---|---|---|
| P-1 | Valores reais de `preco_custo_medio` em homologação e produção | Consulta **somente leitura** (autorizar) |
| P-2 | Integrações externas que gravam ou leem `produtos` e `produtos_custos` | Confirmação com responsáveis |
| P-3 | Logs de erro do provedor para monitorar a regra após a implantação | Verificar disponibilidade |
| P-4 | Verificar `security_invoker` da view `produtos_custos` antes da T3 | Auditoria de definição (feito apenas no banco isolado) |
| D6 | Validação contábil | Obrigatória antes de escrita em produção. T2 não grava valor, mas a T3 grava |

---

## 9. Próximo passo

Aprovar esta auditoria. Após a aprovação, a implementação da T2 segue a seção 4.3, começando pelos testes da seção 6 antes da migration, em ambiente isolado.
