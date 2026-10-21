# 10 — Sprint 2A: relatório de execução

Escopo autorizado: infraestrutura segura, persistência e habilitação para o primeiro cliente. Este relatório cobre o que foi feito, o que foi comprovado e o que ficou bloqueado.

**Resumo.** Etapa 1 concluída. Etapa 2 concluída, com divergências de arredondamento registradas. Etapas 3 e 4 **bloqueadas** por falta de identidade de tenant. Etapa 5 documentada como proposta, sem armazenamento real. Etapa 6 parcial: só o que não depende de tenant ou persistência foi testado.

---

## 0. Verificação do ambiente e das pré-condições

| Verificação | Resultado | Evidência |
|---|---|---|
| Commits da Sprint 0 e 1A preservados | Sim: `8a12c4bd`, `d4062caa`, `350f03c8` na branch `claude/import-intelligence-s1a` | `git log` |
| Docker disponível | Sim (daemon ativo) | `docker info` |
| Imagem PostgreSQL local | `postgres:17-alpine` já presente | `docker images` |
| CLI Supabase | Presente (2.117.0), mas não necessária: a instância local é container Postgres puro | `supabase --version` |
| Banco local usado | Container `jl-import-s2a-pg` (PostgreSQL 17.11), porta somente em `127.0.0.1:54399`, senha de teste, sem volume persistente | `docker run` |
| Conexão com banco compartilhado ou Supabase remoto | **Nenhuma**. Os testes usam só o container local | variável `IMPORT_PG_LOCAL_CONTAINER` |
| Identidade de tenant (empresa, vínculo, licença) | **Inexistente** | busca em `backend/supabase/migrations`: `usuario_vinculos`, `fp_pode_loja`, `plataforma_admins`, `empresa_id`, tabelas de módulo ou licença: 0 ocorrências |
| Branch isolada | Sim, `claude/import-intelligence-s1a` | `git branch --show-current` |

---

## 1. Pendências da Sprint 1A

| Item | Status | Como foi resolvido |
|---|---|---|
| 1. Commits preservados | OK | verificado acima |
| 2. Teste dedicado de GLOSADO com incorporação | OK | `landedCost.s2a.spec.ts`: incorpora com regra `incorpora_custo: true` (10,00 + 4,00 = 14,00); não incorpora com `false`; sem item é erro; fora da vigência é divergência |
| 3. Cálculo bloqueado não aprovável | OK, como **guarda pura** | `aprovacao.ts` (`verificarAprovacao`): erro, status `BLOQUEADO`, divergência bloqueante, conservação falsa e versão de motor diferente bloqueiam. Testes com saídas reais e adulteradas |
| 4. Limites decimais e HALF_UP | OK | Testes por campo: taxa com 10 casas, dinheiro com 6 (sétima rejeitada), imposto com 2, quantidade com 3, fator com 6. Empates nos dois sinais. Limite de 10^12 |
| 5. Contratos públicos preservados | OK | Nenhuma assinatura pública alterada; só exportação adicional (`verificarAprovacao`) |
| 6. Testes relevantes executados | OK | ver seção 4 |

**Bug encontrado e corrigido nesta etapa:** nenhum novo; o teste de GLOSADO passou de primeira. Uma expectativa minha (persistência de componente negativo com empate) foi reescrita: um total negativo nunca é persistido, porque o motor retorna `LANDED_CUSTO_NEGATIVO`. A expectativa correta está no teste.

---

## 2. Etapa 2: PostgreSQL local e T-RND-03

Arquivo: [pg.local.spec.ts](../../shared-core/src/import/pg.local.spec.ts). Executa apenas com `IMPORT_PG_LOCAL_CONTAINER` definido. Sem a variável, os 5 testes ficam `skipped`.

### Resultados (1.514 casos: aleatórios com sinal, empates, patológico e caso da Sprint 0)

| Implementação em SQL | Divergências vs. motor | Conclusão |
|---|---|---|
| Reescala com `round(x, n)` | **0** | Equivalente |
| Produto `round(a × b, n)` | **0** | Equivalente |
| Divisão exata com `div`/`mod` | **0** | **Padrão recomendado** |
| Divisão ingênua `round(a / b, n)` | **1** | **Diverge** (ver abaixo) |

**Achado principal (DIVERGÊNCIA).** A divisão `/` do PostgreSQL devolve um quociente de 20 casas. O `round` que vem depois arredonda de novo. Caso reproduzível: `499999999999999999999999999999 / 10^30`, que vale `0,4999…9`. O PostgreSQL ingênuo dá **1**; o motor e a divisão `div`/`mod` dão **0**.

**Impacto:** raro (1 em 1.514 casos aleatórios), mas real. Na prática, um quociente que cai logo abaixo de um empate pode subir uma casa. Afeta qualquer cálculo de unitário feito em SQL.

**Decisão técnica registrada:** qualquer implementação SQL do motor deve usar `div`/`mod` para HALF_UP. Proibido usar `/` para arredondamento. Qualquer função SQL futura precisa de teste de equivalência com esta suíte.

**Validação do arredondamento básico:** `round(numeric, n)` do PostgreSQL arredonda empates para longe de zero (`2,5 → 3`; `−2,5 → −3`; `0,00005 → 0,0001`; `−0,00005 → −0,0001`). Coincide com o motor.

### Precisão de custo unitário nas colunas atuais (achado A-06 ampliado)

| Unitário do motor | Gravado em `numeric(10,2)` | Erro |
|---|---|---|
| 0,277778 | 0,28 | +0,80% |
| 0,034500 | 0,03 | −13,04% |
| 1,666667 | 1,67 | +0,20% |
| **0,005000** | **0,01** | **+100%** |
| 133,333333 | 133,33 | 0,00% |
| 5,594823 | 5,59 | −0,09% |

**Impacto:** a coluna atual de custo (`importacoes_nfe_itens.custo_unitario` e `produtos.preco_custo`, ambas `numeric(10,2)`) corrompe custo unitário de itens baratos. Para itens com custo abaixo de 1 real, o erro pode passar de 10%. **Severidade elevada para P0** para qualquer uso do unitário do motor. A correção (escala de persistência do unitário em 6 casas) é migração que **não foi aplicada** nesta sprint, porque depende de decisão de persistência e de clone de staging.

### Divergências e impactos registrados

| # | Divergência | Impacto | Ação |
|---|---|---|---|
| D-01 | `/` do PostgreSQL arredonda duas vezes | Unitário errado em caso raro | Proibir `/` para HALF_UP; usar `div`/`mod` |
| D-02 | `numeric(10,2)` perde precisão do unitário | Erro de até 100% em itens de centavos | Ampliar escala do unitário (migração, após decisão) |
| D-03 | `round` do PostgreSQL = motor | Nenhum | Manter |

---

## 3. Etapa 3: habilitação do módulo por cliente — BLOQUEADA

**Estado comprovado:** não existe identidade de tenant segura no repositório. Não há `empresas`, vínculo usuário × empresa × papel, `empresa_id`, helper `fp_*` nem tabela de licença. A tabela global `feature_flags` (`name`, `enabled`) não serve como autorização por cliente e não foi usada.

**Decisão:** conforme a regra "se faltar identidade de tenant segura, não improvisar autorização", **nenhum modelo de licença foi criado**. As funcionalidades de importação continuam inacessíveis: nenhuma rota, menu, server action ou RPC do módulo foi criada.

**Como a licença será verificada (requisito, ainda não implementado):**

1. Catálogo de módulos com identificador estável `IMPORT_INTELLIGENCE`, desabilitado por padrão.
2. Tabela de habilitação por empresa cliente, com `ativo`, `habilitado_por`, `habilitado_em`, `desabilitado_em` e autorização explícita registrada.
3. Verificação **no servidor**, em cada RPC e action do módulo, por helper `fp_modulo_ativo(empresa, 'IMPORT_INTELLIGENCE')`, derivado da sessão e nunca de parâmetro do cliente.
4. Permissões por usuário dentro do módulo, sobre `usuario_vinculos` (inexistente hoje).
5. Histórico de habilitação e desabilitação em tabela append-only.
6. Sem CNPJ nem `loja_id` do primeiro cliente no código.

**Pré-condição bloqueante:** ESPEC multiempresa etapas 1 a 3 (empresas, vínculos e helpers). Sem isso, não há como distinguir o cliente contratante nas RPCs.

---

## 4. Etapa 4: persistência e adapter — BLOQUEADA

Pela regra da sprint, migrations de persistência só são implementadas se isolamento e banco local estiverem comprovados. Banco local **está** comprovado, mas **isolamento não está** (seção 3). **Nenhuma migration foi criada.** Nenhum adapter de persistência, nenhum hash de entrada e nenhuma tabela de operação de importação foram implementados.

Continuam pendentes e dependem da seção 3: operação de importação, fornecedor vinculado, mercadorias, referências documentais, tributos por item, despesas e critérios de rateio, simulações e versões, divergências e pendências, aprovação e auditoria.

Antes de qualquer migration, precisam existir: identidade de tenant e RLS por tenant testadas em PostgreSQL local (item 11 da Etapa 6).

---

## 5. Etapa 5: documentos — política proposta, sem armazenamento

Política registrada em [11-POLITICA-DOCUMENTOS.md](11-POLITICA-DOCUMENTOS.md). **Nenhum armazenamento real foi liberado.** Retenção, exclusão e preservação legal dependem de decisão jurídica e operacional que ainda não existe.

---

## 6. Etapa 6: testes obrigatórios

| # | Teste | Status | Motivo |
|---|---|---|---|
| 1 | Importação cadastrada e recuperada | **Bloqueado** | Depende de persistência (Etapa 4) |
| 2 | Itens, tributos e despesas preservados | **Bloqueado** | Idem |
| 3 | Reprocessamento sem duplicidade | **Bloqueado** | Idem |
| 4 | Versões antigas não sobrescritas | Parcial | Motor é função pura; imutabilidade de versão depende da persistência |
| 5 | Cálculo reproduzível a partir dos dados persistidos | Parcial | Reprodutibilidade do motor testada (ordem, determinismo, pureza). Reprodução a partir do banco, bloqueada |
| 6 | Tributo pendente não aprovável | **Testado** (guarda pura) | `landedCost.s2a.spec.ts` e `aprovacao.ts`. Aprovação real no banco, bloqueada |
| 7 | Cliente sem módulo não acessa dados | **Bloqueado** | Sem licença (Etapa 3) |
| 8 | Usuário sem permissão não aprova | **Bloqueado** | Sem `usuario_vinculos` |
| 9 | Acesso entre tenants negado | **Bloqueado** | Sem tenant |
| 10 | Nenhuma alteração de estoque, financeiro ou preços | **Testado** (pureza) | Guardrail `guardrails.spec.ts`: motor sem I/O. Verificação de escrita no banco, bloqueada |
| 11 | RLS e RPCs em PostgreSQL local | **Bloqueado** | Sem policy de tenant para testar. Container local disponível |
| 12 | Desativação não apaga histórico | **Bloqueado** | Sem licença |

**Testes executados nesta sprint:** 112 testes do módulo `import/` sem container (20 novos nesta sprint: GLOSADO, guarda de aprovação, limites decimais e HALF_UP), 5 de T-RND-03 contra o container local, e o typecheck. Ver seção 7.

---

## 7. Resultados de execução

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` em `shared-core` (strict) | Limpo |
| `vitest run src/import` (sem container) | 112 passam; 5 de PostgreSQL pulados |
| `IMPORT_PG_LOCAL_CONTAINER=jl-import-s2a-pg vitest run src/import/pg.local.spec.ts` | 5/5 passam |
| Verificador de referência (21 fixtures) | 21/21 |
| Guardrails `domain-boundary`, `core-rule`, `dep-version` | OK |
| Revisão Python independente | 20 de 21 numéricos conferem; o caso 18 diverge porque o script não valida escala. O motor valida e passa |

---

## 8. O que permanece bloqueado

1. Qualquer migration de persistência, de licença ou de RLS (Etapas 3 e 4).
2. Interface de importações (Sprint 3).
3. Armazenamento real de XML ou PDF (Etapa 5, decisão jurídica).
4. Correção de escala de custo unitário em produção (D-02): depende de decisão de persistência e clone de staging.
5. Multiempresa e distribuição entre CNPJs.
6. Aprovação de cálculo no banco: depende de tenant, permissão e auditoria.

---

## 9. Riscos restantes

- **R-A1 (P0):** `numeric(10,2)` do custo atual corrompe unitários de itens baratos (D-02).
- **R-A2 (P1):** a divisão `/` do PostgreSQL diverge do HALF_UP. Mitigado por regra de implementação, ainda não aplicada a SQL real.
- **R-A3 (P0 para qualquer exposição):** sem tenant, qualquer função de importação exposta vaza dados entre clientes.
- **R-A4 (P1):** o container local usa papéis simples, sem o schema `auth` do Supabase. Os testes de RLS, quando existirem, precisarão de um mock fiel de `auth.uid()`.

---

## 10. GO / NO-GO para a Sprint 3 — Interface Importações

**NO-GO.**

Motivos:
1. Não há identidade de tenant, então não há como garantir que a interface só apareça para o cliente contratante.
2. Não há persistência, então a interface não teria o que mostrar além de cálculos efêmeros.
3. O achado D-02 (custo unitário em `numeric(10,2)`) precisa ser corrigido antes de qualquer tela que exiba custo.

**Pré-condições para reavaliar:** ESPEC etapas 1 a 3 implementadas e testadas em PostgreSQL local; migration de escala aprovada e testada em clone; modelo de licença implementado e verificado no servidor.
