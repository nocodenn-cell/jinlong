# Engineering Loop — NF-e: G14, reprodutibilidade, paridade e qCom

Data: 2026-10-30. Escopo: P2, P3, P4 e tratamento de qCom. Sem merge, push, deploy, alteração de produção ou homologação, e sem alterar o G14 ou o histórico versionado.

Cópias de trabalho (fora do repositório, em `scratchpad/rb-*`), com projetos, containers e portas próprios (`fp-rb-*`, portas 63020–63049). Os containers de outros projetos (`gatef2e`, `GEO-portal`, `fleet-management`, `ii-recon`, `golive-e2e`) não foram tocados.

## 1. Causa raiz do bloqueio G14

**Reproduzido** com a cadeia original (`fp-rb-orig`): a migration `20261029150000_g14` falha com `G14: movimento de entrada do destino encontrado 0 vezes`.

**Condição do self-check que falha:** o G14 exige, no INSERT de entrada do destino em `internal.transferir_estoque_seguro`, o texto multilinha `    p_loja_destino,\n    p_produto_id,\n`.

**Objeto que deveria satisfazer a condição:** a função no estado imediatamente anterior ao G14.

**Diagnóstico:** o problema é de **ordem/dependência**, não de definição incorreta do G14.
- A migration `20261023130000_movimentos_estoque_log_transferencia_id` (#629, PR #629, versão já duplicada na main) ordena-se **antes** do G14 e reescreve a mesma função. Ela troca o INSERT de entrada para uma forma de uma linha (`p_loja_destino, p_produto_id, 'TRANSFERENCIA_ENTRADA', ...`), que não casa com a âncora do G14.
- Em produção e homologação, o G14 foi aplicado **sem** #629 (que nunca foi aplicada nesses ambientes). Lá a sequência é consistente. A cadeia do repositório, executada em ordem de nome, não é a que os ambientes executaram.
- Mover #629 para depois do G14 **não basta**: a reordenação falha em #629, porque o G14 altera o INSERT de entrada para `p_loja_destino,\n    v_produto_destino,\n...`, e a âncora de #629 espera `p_produto_id`.

**Menor correção segura (proposta, não aplicada ao versionado):**
1. Mover #629 para depois do G14 (renomear o arquivo para uma versão posterior a `20261029150000`). Só é segura porque #629 **não está aplicada em nenhum ambiente**.
2. Em #629, aceitar `(p_produto_id|v_produto_destino)` na âncora da entrada e usar `\1` na substituição. É uma troca de dois trechos no próprio arquivo de #629.
3. Não alterar o G14.

**Contratos de segurança:** preservados. A mudança só altera o texto que #629 reescreve (kardex com `transferencia_id`). Não toca RLS, grants, guards de loja nem idempotência de transferência.

**Verificado:** a cópia `fp-rb-reorder` (cadeia com as duas alterações acima) **reconstrói a cadeia completa**, com 449 versões registradas até `20261030130000`. G14 e #629 presentes no `transferir_estoque_seguro`.

## 2. Resultado das reconstruções

| Reconstrução | Resultado |
|---|---|
| Original (com G14, em ordem de nome) | **FALHOU** no G14 (reproduzido) |
| Diagnóstica (sem G14) — `fp-rb-nog14` | Completa até `20261030130000`. **Não é prova da cadeia original.** Usada para validar o núcleo NF-e |
| Reordenada com âncora corrigida — `fp-rb-reorder` | **PASSOU**: completa com G14 e #629 presentes |

## 3. Comparação local × homologação

Comparação por categoria, não por MD5 isolado.

| Categoria | Resultado | Classificação |
|---|---|---|
| Colunas, tipos, nulabilidade e defaults das 15 tabelas do núcleo NF-e | iguais | PASSOU |
| Constraints, índices, políticas RLS, flags RLS e grants dessas tabelas | iguais, exceto índice de `movimentos_estoque_log` | esperado (#629 não aplicada em homologação) |
| Funções do núcleo NF-e (`confirmar_importacao_nfe`, `importar_nfe_transacao`, `registrar_conferencia_nfe`, `receber_ordem_compra`, `_oc_*`, `decrementar_estoque_seguro`, `atualizar_preco_varejo_produto`, `vincular_*`, `criar_confirmar_remessa_entrada` lógica) | mesma lógica | PASSOU |
| `internal.criar_confirmar_remessa_entrada` | MD5 diferente; diff textual mostra **só comentários** (ex.: `-- S1: loja explícita…`). Lógica idêntica | diferença cosmética (a homologação aplicou a S1 sem os comentários) |
| `internal.transferir_estoque_seguro` | diferente | esperado (G14 ausente na cópia diagnóstica; #629 ausente em homologação) |
| `public.transferir_estoque_seguro` (wrapper) | igual | PASSOU |
| Registro de migrations | Homologação registra nomes `reaplica_*`/`rollback_*` e **duas versões fora deste branch**: `20261023200000` (no histórico git de outro branch) e `20261030002520` (`sync_registrar_venda_offline_atomica`, do branch `claude/jl-pdv-02-sync-atomica`) | **FALHOU (governança)**: homologação contém migrations de outros branches |
| Tabelas fora do núcleo NF-e (`commercial_*`, `comissoes_*`, `empresa_*`, `import_*`, `pdv_config`, `vendas`/`vendas_pagamentos`) | diferem | esperado: migrations do repositório não aplicadas em homologação |

**Limite:** a equivalência vale para o **núcleo NF-e** (funções, tabelas, constraints, RLS e grants). Não há equivalência total entre homologação e o repositório.

## 4. Concorrência real (P4)

Executadas na cópia diagnóstica (`fp-rb-nog14`) e na reordenada (`fp-rb-reorder`), ambas com o núcleo NF-e idêntico à homologação:

| Suíte | nog14 | reorder |
|---|---|---|
| `nfe-concorrencia-confirmacao.sh` (duas sessões, mesma NF: uma efetiva, estoque +10, kardex 1, AP 1 de 100,00, CONCLUIDA) | PASSOU | PASSOU |
| `ux04-oc-recebimento-concorrencia.sh` (4 cenários: concorrência de OC, mesma chave, via remessa × OC, encerrar × receber) | PASSOU | PASSOU |
| `test-nfe-conferencia-concurrency.mjs` (contenção real de lock, T2 bloqueado 900 ms) | PASSOU 2/2 | PASSOU 2/2 |

Não rodam em homologação (dados comitados; vedado pela decisão 4). Os cenários de transferência (G14) não são afirmados.

## 5. P5 — renomeação de `20261023130000` (growth-001 → `20261023130100`)

- **Origem:** `origin/main` (7a75473f) contém **dois** arquivos com versão `20261023130000`. Duplicidade real na main, que faz `supabase db reset` falhar.
- **Ambientes:** produção não tem `transferencia_id` nem `commercial_planos`; homologação e local não registram nenhuma das duas versões. A renomeação não invalida registro existente.
- **Referências:** atualizadas em `hub/README.md`, `hub/scripts/rls-test.sh` e `PROXIMOS_PASSOS.md`. `ops/rollback_20261023130000_…` continua correto (refere-se ao arquivo de #629).
- **CI/manifesto:** `.github/deploy-governance/deferred-migrations.json` e o job `migration-remote-drift` não citam nenhuma das duas versões.
- **Risco residual:** a renomeação altera um arquivo que já está na main. Só é segura enquanto growth-001 não for aplicada em nenhum ambiente.
- **Base do PR:** a branch parte de `7a75473f`, que é ancestral de `origin/main`. O PR deve usar `origin/main` como base; a `main` local (`56b959af`) está atrás.

## 6. qCom com mais de três casas — política proposta

**Fatos verificados** (`backend/scripts/nfe-quantidade-precisao.test.sql`):
- Q1: qCom 0,0004 grava 0,000 e é recusado pelo CHECK `quantidade_nfe > 0`, com erro opaco.
- Q2: qCom 1,0004 × 1000,00 grava 1,000. O estoque recebe 0,0004 a menos, e a conciliação usa o `vProd` 1000,40. **Diferença silenciosa.**
- Q3: parcial de 0,5 de 1,0004 × 1000 dá 500,00. Correto.

**Política (menor correção segura, sem alterar a precisão global):**
1. **Preservar o documental:** guardar `qCom` exato e `uCom` do XML em campos novos e nullable. `fator_conversao` já existe.
2. **Verificar representabilidade:** `qtd_estoque_exata = qCom × fator` (numeric exato). Se `scale > 3`, **bloquear** com `IMPORT_NFE_QTD_PRECISAO` (item, uCom, qCom, fator, máximo de 3 casas). Não arredondar.
3. **Bloquear o que zera:** se `qtd_estoque_exata > 0` e menor que 0,001, bloquear com a mesma mensagem (hoje cai no CHECK opaco).
4. **Conferência:** a quantidade conferida segue em `numeric(10,3)` e só é aceita se bater com a quantidade da NF.

**Impactos:**
- NFs com qCom de 4+ casas passam a ser recusadas com mensagem clara, até a unidade comercial ser ajustada. Não há perda silenciosa.
- Nenhuma alteração de tipo em tabela de estoque. Não toca o motor de custo médio.
- Elevar `quantidade_atual` para 4 casas afeta estoque, kardex, vendas e PDV. Fica fora de escopo.

**Não aplicado nesta etapa.** Falta teste de regressão para Q1, Q2 e Q3 com a nova validação.

## 7. Regressão (P7)

| Suíte | Resultado |
|---|---|
| flx05-ui (passos 1–8) | PASSOU |
| margem-não-bloqueia-estoque | PASSOU |
| duplicata-inválida-aborta | PASSOU |
| manual-sem-cnpj | PASSOU |
| ux04-oc-recebimento-parcial | PASSOU |
| d0-remessa-conferencia-columns-drift | PASSOU (só no local) |
| conciliacao-exigivel (4) | PASSOU |
| precisao-documental (8) | PASSOU |
| quantidade-precisao (demonstração) | executada; **não afirma** comportamento |
| entrada-documento-posterior.test.mjs | PASSOU |
| nfe-conferencia-margem-contract.test.mjs | PASSOU |
| Concorrência (3 suítes) | PASSOU |
| Typecheck `pdv-importados` e vitest do módulo de importação (sessão anterior) | PASSOU (160 testes; typecheck 0 erros) |

## 8. Matriz final

| # | Item | Status |
|---|---|---|
| P1 | qCom: comportamento demonstrado | **FALHOU** (arredondamento silencioso em Q2); Q1 recusa com erro opaco; Q3 PASSOU |
| P2 | Reprodução da cadeia original | **FALHOU** (G14, causa raiz identificada) |
| P2 | Reprodução com correção de ordem | **PASSOU** (cópia `fp-rb-reorder`, 449 versões) |
| P3 | Núcleo NF-e local × homologação | **PASSOU** (funções lógicas, tabelas, constraints, RLS e grants) |
| P3 | Registro de migrations homologação | **FALHOU** (migrations de outros branches; nomes divergentes) |
| P3 | Diferenças fora do núcleo | esperadas, não invalidam os testes NF-e |
| P4 | Concorrência real (3 suítes) | **PASSOU** (nas cópias locais com o núcleo NF-e idêntico) |
| P4 | Concorrência em homologação | **NÃO TESTADO** (vedado: comitaria dados) |
| P5 | Impacto da renomeação | **PASSOU** (auditoria), com risco residual documentado |
| P6 | 13 scripts | ver seção 9 |
| P7 | Regressão | **PASSOU** (exceto itens NÃO TESTADOS abaixo) |
| P8 | Revisão do diff | **PARCIAL** (sem alteração em RLS/grants/loja; ver riscos) |
| — | Correção de qCom aplicada | **NÃO TESTADO** (proposta) |
| — | Correção de ordem G14/#629 aplicada | **NÃO TESTADO** (validada só em cópia) |

## 9. Os 13 scripts originais

- **Recuperados e passando localmente (10):** flx05, margem-não-bloqueia, duplicata-inválida, manual-sem-cnpj, ux04-parcial, d0, ux04-concorrência.sh, test-nfe-conferencia-concurrency.mjs, margem-contract.mjs, entrada-documento-posterior.mjs.
- **Novos (4):** conciliacao-exigivel, precisao-documental, concorrencia-confirmacao.sh e quantidade-precisao (demonstração).
- **Executados em homologação (7 SQL):** flx05, margem-não-bloqueia, duplicata-inválida, manual-sem-cnpj, ux04-parcial, conciliacao-exigivel, precisao-documental.
- **Não executados em homologação:** d0 (altera estrutura), três de concorrência (comitam dados), dois `.mjs` (PGlite, sem banco remoto).

## 10. Riscos residuais

1. Cadeia do repositório não reproduz do zero até a correção de ordem G14/#629 ser aplicada no versionado.
2. Homologação contém migrations de outros branches (`20261023200000`, `20261030002520`) e não reflete a cadeia desta branch.
3. Quantidades com mais de três casas: arredondamento silencioso até a política de qCom ser aplicada.
4. Renomeação de `20261023130000` altera um arquivo já na main.
5. Concorrência só provada em cópias locais, não em homologação.
6. Produção ainda sem conciliação nem precisão documental.

## 11. Recomendação

- **PR (abertura): NO-GO agora.** Antes:
  1. Aplicar a correção de ordem G14/#629 no repositório e rebuildar a cadeia do zero.
  2. Decidir a política de qCom (proposta acima) e implementar a validação com teste de regressão.
  3. Resolver a divergência de homologação com outros branches (decisão sua; não altero homologação).
  4. Rebasear a branch sobre `origin/main` e resolver a duplicidade de versão já na main.
- **GO para PR em draft:** possível após o item 1, com a divergência de homologação documentada.
- **Deploy em produção: NO-GO.** Depende do PR e de autorização separada sua.

## 12. Atualização após autorização (correção de ordem e política de qCom implementadas)

Commits: `bb867091` (correção de ordem G14/#629), `1c39548f` (política de qCom).

**Reconstrução completa do repositório, com G14 intacto** (`fp-rb-full`, sem remover nenhuma migration): **PASSOU**. 450 migrations aplicadas, última `20261030140000`. `transferir_estoque_seguro` contém G14 e `transferencia_id`; `importar_nfe_transacao` contém a validação `IMPORT_NFE_QTD_PRECISAO`.

**Suíte na reconstrução completa:**
| Suíte | Resultado |
|---|---|
| flx05-ui, margem-não-bloqueia, duplicata-inválida, manual-sem-cnpj, ux04-parcial, d0 | PASSOU |
| conciliacao-exigivel, precisao-documental | PASSOU |
| quantidade-precisao (agora com asserções: Q1/Q2 recusados com IMPORT_NFE_QTD_PRECISAO; Q3–Q5 aceitos e preservados) | PASSOU |
| Concorrência: confirmação dupla, OC (4 cenários), lock real entre sessões | PASSOU |
| entrada-documento-posterior, margem-contract (PGlite) | PASSOU |

**Pendências:**
- A migration `20261030140000` ainda **não está em homologação**; aplicá-la exige autorização específica.
- `20261030130000` (precisão documental) e `20261030120000` (conciliação) já estão em homologação, mas a cadeia de homologação ainda não reflete a ordem corrigida de #629 (#629 não foi aplicada lá).
- Recomendação de PR: GO para draft depois de rebasear sobre `origin/main` e documentar a divergência de homologação; NO-GO para merge até a homologação ser regularizada. Deploy em produção: NO-GO, requer autorização separada.

## 13. Aplicação da política de qCom em homologação (autorizada)

- Pré-condição verificada: `internal.importar_nfe_transacao` no estado da precisão documental (md5 `0e8d6b4a…`); migration não registrada; coluna inexistente.
- Aplicada `20261030140000_nfe_qtd_precisao` em `yvdilcmxyjafnnsfdtam`, em transação, com a prova interna OK; registrada em `schema_migrations`. md5 resultante da função: `89c56ce9…`.
- Testes em homologação via CLI linkado, cada um em transação com rollback: `nfe-quantidade-precisao`, `nfe-precisao-documental`, `nfe-conciliacao-exigivel` — **PASSOU** (0 erros).
- Resíduos após os testes: NFs sintéticas 0, NFs de teste 0, AP 0, produtos de teste 0, `movimentos_estoque_log` = 51 (inalterado).
- Projeto desvinculado do CLI após os testes.
- Não aplicado: rollback (disponível em `backend/supabase/rollback/20261030140000_nfe_qtd_precisao_rollback.sql`), caso seja necessário.
