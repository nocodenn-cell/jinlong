# 19 — Sprint F5: hub operacional de Importações (进口管理)

Status: **implementado e homologado em ambiente local** (app Next em `localhost:3100` + Supabase local). Nada foi aplicado em produção; nenhum módulo foi ativado para cliente real.

## 1. Arquivos implementados

**Banco** (migrations locais, cada uma com rollback em `backend/supabase/rollback/`):

| Arquivo | O quê |
|---|---|
| `20261010170000_f5_import_hub_campos.sql` | Campos novos: na operação, fornecedor (da mesma empresa), moeda, datas e observações; no item, código do fornecedor (texto) e NCM. Conferência de despesas e tributos. Lista do hub com somas como texto. A aprovação passa a exigir lançamentos conferidos. |
| `20261010170100_f5_import_buscar_produtos.sql` | `import_buscar_produtos`: só id e nome, só da empresa (cerca), exige licença. O hub não acessa a tabela `produtos` diretamente (fronteira de domínio). |

**Aplicação** (`pdv-importados`):

| Arquivo | O quê |
|---|---|
| `lib/navigation/routes.ts` | `ROUTES.admin.importacoes` e `adminImportacaoHref(id, {aba, apuracao, comparar})` (rotas canônicas) |
| `lib/admin/policy/adminPolicy.ts` | Recurso `route:/admin/importacoes` liberado para DONO e GERENTE (1ª barreira) |
| `lib/navigation/adminV2SidebarNav.ts`, `ExecutiveSidebarNav`, `AdminV2Shell`, `AdminV2MobileNavDrawer`, `app/admin/layout.tsx` | Grupo "Módulos contratados" **fora** dos 9 destinos e da paleta de comandos. Só aparece quando o servidor confirma a licença. |
| `lib/import/hub/gateImportacoes.ts` | Gate de servidor para páginas (`notFound`) e actions: policy, depois licença, vínculo, papel e empresa (`requireModulo`). Calcula também se o usuário é DONO. |
| `lib/import/hub/dadosImportacoes.ts` | Leituras com a sessão do usuário, sob RLS; números como texto (`::text`) |
| `lib/import/hub/decimais.ts` | Entrada em formato pt-BR para decimal canônico, exibição sem float, somas exatas em bigint, resumo em 2 casas |
| `lib/import/hub/elegibilidade.ts` | Motivos de inelegibilidade (só exibição), pendências da lista e tradução de erros |
| `app/admin/importacoes/actions.ts` | 11 server actions: criar, cabeçalho, item, lançamento, remover, conferir, documento, apurar, aprovar, mudar estado, buscar produtos |
| `app/admin/importacoes/page.tsx` | Visão geral e lista |
| `app/admin/importacoes/[id]/page.tsx` | Detalhe com 6 abas |
| `app/admin/importacoes/_components/*` | Seções Resumo/câmbio, Mercadorias, Tributos e despesas, Documentos, Apuração, Versões e aprovação; formulários de decisão; campos acessíveis |
| `src/lib/i18n/{pt,zh}.json` | Seção `importacoes` (267 chaves, paridade pt/zh) e `admin.nav.modulos` |

**Testes e homologação:**

| Arquivo | O quê |
|---|---|
| `backend/scripts/f5-import-hub.test.sql` | Teste SQL da F5 (6 checks) |
| `backend/scripts/f5-homologacao-local.mjs` | Empresas e identidades **fictícias** no Supabase local. Recusa alvo remoto. |
| `lib/import/hub/*.test.ts`, `app/admin/importacoes/actions.gate.test.ts` | Testes unitários |
| `e2e/importacoes-hub.spec.ts` | E2E dos 16 cenários |
| `e2e/importacoes-evidencias.spec.ts` | Capturas de tela, sob demanda |
| `.claude/launch.json` | Config `pdv-dev-importacoes-local` (porta 3100, para não disputar a 3000 de outro processo) |

## 2. Telas funcionais

| Tela | Conteúdo |
|---|---|
| **Visão geral** (`/admin/importacoes`) | Importações cadastradas, em conferência, aprovadas, com pendências; custo apurado **aprovado** e custo **provisório** (não aprovado), separados e explicados; operação mais recente |
| **Lista** | Referência, fornecedor, data da invoice, moeda, itens, status, pendências (sem apuração, cálculo bloqueado, desatualizado) e custo apurado (aprovado ou provisório, marcado). Busca e filtro por status (formulário GET, funciona por teclado e sem JS). |
| **Criar/editar** | Referência, loja importadora (só as da empresa), fornecedor vinculado (só da empresa), moeda, datas de invoice, embarque e desembaraço, observações |
| **Mercadorias** | Código do fornecedor em texto (zeros preservados); vínculo opcional com produto, só para consulta e sem alterar o cadastro; NCM; quantidade, unidade e fator até a quantidade de estoque; preço e moeda de origem; peso e volume para rateio; edição e remoção no rascunho |
| **Tributos e despesas** | Tributos agrupados por status: não recuperáveis, créditos reconhecidos, créditos potenciais, outros. Despesas compartilhadas (critério de rateio) e diretas (item), descontos. Cada lançamento com justificativa, regra e vigência, quem validou e **conferência**. Aviso de que o sistema não deduz recuperabilidade. |
| **Documentos** | Só referência documental (tipo, número, data, versão, quem e quando). Aviso explícito de que **o envio de arquivo está indisponível** até a validação jurídica da retenção (D8). Nenhum upload simulado. |
| **Apuração** | Simular ou calcular com o motor. Composição do custo (mercadorias, despesas, tributos incorporados, descontos, créditos fora do custo), custo total, custo por item (4 casas) e unitário (6 casas), resíduos, conservação, divergências, rateios (10 casas) e **memória de cálculo** por item. Aviso quando os dados mudaram depois do cálculo. |
| **Versões e aprovação** | Histórico (tipo, status, quem calculou, quando, aprovada, atual); comparação de custo por item entre duas versões; motivos de inelegibilidade; aprovação (só DONO, com motivo); reabertura (só DONO) e cancelamento; decisões e auditoria ("quem alterou") |

## 3. Actions e contratos usados

As actions só fazem gate, validação e chamada aos contratos que já existiam. Nada foi recriado.

| Action | Contrato |
|---|---|
| `criarImportacaoAction` | `import_criar_operacao` (F4; tenant derivado da loja) + `import_atualizar_operacao` (F5) |
| `salvarCabecalhoAction` | `import_atualizar_operacao` |
| `salvarItemAction` | `import_salvar_item` (F4, estendida na F5) |
| `salvarLancamentoAction` | `import_salvar_lancamento` (F4) |
| `removerRascunhoAction` | `import_remover_rascunho` (F4) |
| `conferirLancamentoAction` | `import_conferir_lancamento` (F5) |
| `registrarDocumentoAction` | `import_registrar_documento` (F4), sempre sem arquivo |
| `apurarAction` | `apurarOperacao` (adapter F4): `import_montar_entrada` → `calcularLandedCost` (motor da Sprint 1A) → `import_registrar_apuracao` |
| `aprovarAction` | `aprovarApuracao` (adapter F4): recálculo + `verificarAprovacao` + hash, depois `import_aprovar_apuracao` (service_role; o banco revalida DONO, conferência e versão) |
| `mudarEstadoAction` | `import_mudar_estado` (F4) |
| `buscarProdutosAction` | `import_buscar_produtos` (F5) |

Leituras: `import_listar_operacoes` e tabelas `import_*` sob RLS.

## 4. Testes realizados

Os números de cada execução estão em §8.

## 5. Falhas e limitações

Ver §9.

## 6. GO/NO-GO, 7. Próxima sprint

Ver §10 e §11.

## 8. Resultados dos testes (números reais, 2026-10-10)

Ambiente: Windows 11, Supabase local (`supabase start`, 127.0.0.1:54321), container PG17 `jl-import-s2a-pg` para os scripts SQL, Next dev em `localhost:3100`. Nenhum teste usou o projeto compartilhado.

### 8.1 E2E Playwright — `e2e/importacoes-hub.spec.ts` (Supabase local)

10 blocos serializados cobrindo os 16 cenários: **10 passed, 0 failed, 0 skipped** (1,8 min; execução final após a troca dos botões e o snapshot por loja). Uma execução intermediária falhou no bloco 10 porque o snapshot do ERP era global e a suíte vitest com integrações escrevia em `produtos` ao mesmo tempo. Correção: o snapshot passou a cobrir só as lojas fictícias `HOMOLOG-IMP-*` (com produto e saldo reais).

| Bloco | Cenários |
|---|---|
| 1 | 1 (DONO licenciado vê o menu) + 6 (criar importação) |
| 2 | 7 (mercadorias, código `000123` preservado) + 8 (câmbio, despesa rateada, tributo, conferência) |
| 3 | 9 (simular) + 10 (calcular com o motor) + 14 (reabrir e ver a memória de cálculo) |
| 4 | 11 + 12 (despesa com decisão pendente → versão bloqueada, não aprovável) |
| 5 | 4 (GERENTE opera e não aprova; OPERADOR não acessa) |
| 6 | 13 (corrigir, recalcular, comparar versões, aprovar pelo servidor) |
| 7 | 5 (empresa concorrente licenciada não vê nem abre a operação de A) |
| 8 | 2 + 3 (cliente sem módulo: sem menu, rota direta negada) |
| 9 | 16 (navegação em chinês e de volta ao português) |
| 10 | 15 (estoque, kardex, contas a pagar e preços inalterados) |

Capturas (`e2e/importacoes-evidencias.spec.ts`, `E2E_EVIDENCIAS=1`): **2 passed**. Os 9 arquivos estão em [`evidencias-f5/`](evidencias-f5/).

### 8.2 Vitest — app `pdv-importados` (suíte completa)

| Execução | Arquivos | Testes coletados | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Padrão, final (sem chave do Supabase local exportada; integrações que exigem chave puladas) | 379 (377 ok, 2 com falha) | 2378 | 2368 | 1 | 9 |
| Com o Supabase local exportado (integrações ligadas), antes das correções 3 e 6 | 379 | 2378 | 2373 | 4 | 1 |
| Primeira execução, antes das correções 1–3 | 379 | 2378 | 2366 | 3 | 9 |

"Não coletados": 0. Na execução padrão final, os 2 arquivos com falha são o caso 4 (o `beforeAll` falha por ambiente) e o caso 7 (timeout do dashboard, que passa isolado). Nenhuma falha restante vem de código da F5.

Classificação de **todas** as falhas observadas:

| # | Teste | Causa | Da F5? | Evidência |
|---|---|---|---|---|
| 1 | `tests/admin-v2-ui-hardening.test.ts` | O hub usava a classe `fp-btn` crua (proibida em `app/admin`) | **Sim, corrigido** (componente `Button`) | Passa após a correção |
| 2 | `lib/i18n/adminChineseUiLabels.test.ts` | `admin.nav.modulos` sem `navHints` | **Sim, corrigido** (dica pt/zh) | Passa após a correção |
| 3 | `lib/import/importIntelligence.integracao.test.ts` | Desde a F5 a aprovação exige conferência; e o snapshot "ERP intocado" era global e colidia com outros testes de integração em paralelo | **Sim, corrigido** (conferência + snapshot restrito à loja do teste, com produto e estoque reais) | 2/2 isolado e na suíte |
| 4 | `app/admin/produtos/productUpdater.semRpc.integracao.test.ts` (execução padrão) | Detecta o Supabase local de pé, mas sem `SUPABASE_SERVICE_ROLE_KEY` usa um placeholder (`Expected 3 parts in JWT`) | Não (ambiental) | 2/2 com a chave local |
| 5 | `app/admin/produtos/produtosFiscalEdicao.integration.test.ts` 1–2 | O seed local cria o gerente-semente antes de a loja ter `empresa_id`; sem vínculo, a cerca da F1 esconde os produtos | Não (lacuna do seed local da F1) | Passa após `m1_sincronizar_vinculo_usuario` no banco local |
| 6 | `produtosFiscalEdicao` 3–4 | O teste nº 4 (pré-existente) faz `DROP`/`CREATE` da RPC `atualizar_produto_com_faixa_atacado` e não refaz o `GRANT`; quem roda depois recebe `permission denied` | Não (bug de isolamento de teste pré-existente) | Log do Postgres; 4/4 após restaurar o grant |
| 7 | `app/admin/dashboard/page.paginacao.test.ts` (e, sob carga, `app/gerente/produtos/listarOpcoesFiltrosProdutos.test.ts`) | Timeout de 10 s. O teste do dashboard leva cerca de 11 s na suíte completa nesta máquina, mesmo sem carga paralela | Não (o arquivo não importa código da F5; `routes.ts` só ganhou uma chave) | Passam isolados (8/8 com os fiscais) |

Ficam abertos, fora do escopo da F5, os itens 5 (vínculo no seed local) e 6 (o teste `semRpc` precisa restaurar o grant).

### 8.3 Unitários da F5 (incluídos em 8.2)

`lib/import/hub/decimais.test.ts` (5), `lib/import/hub/elegibilidade.test.ts` (4), `app/admin/importacoes/actions.gate.test.ts` (14): **23 passed**. Navegação, admin e i18n (25 arquivos, 175 testes): passed.

### 8.4 shared-core

40 arquivos, 357 testes: **352 passed, 0 failed, 5 skipped** (1 arquivo pulado: integração PG que exige variável própria).

### 8.5 Banco (cópia limpa `jl_f5final` a partir de `jl_f4`)

| Verificação | Resultado |
|---|---|
| Aplicar as duas migrations da F5, e reaplicar (idempotência) | OK |
| `f5-import-hub.test.sql` | 6/6 |
| `f4-import-intelligence.test.sql` | 11/11 |
| `f1-isolamento-multiempresa.test.sql` | 35 OK |
| `f3-nfe-salvaguardas.test.sql` | 9 OK |
| `m1-multiempresa.test.sql` | 29 OK |
| `c1-secdef-sem-identidade.test.sql` | OK |
| Regressão dos 48 scripts `backend/scripts/*.test.sql` | 36 PASS / 12 FAIL, **as mesmas 12 falhas do baseline pré-M1** |
| Rollback das duas migrations, na ordem inversa | `pg_dump --schema-only` idêntico ao de `jl_f4` (31.167 linhas; só os tokens aleatórios `\restrict` diferem) |

### 8.6 Estáticos

`tsc --noEmit`: 0 erros. ESLint nos arquivos novos e alterados: 0 problemas. Guardrails: core-rule, pdv-flow, route (31 rotas), rpc-gate, pricing-rpc, dep-version, migration-sequence, domain-boundary, boundary-ratchet (+10/10 testes do ratchet), no-prod-target, design, entity-ssot: **todos OK**.

## 9. Falhas e limitações conhecidas

1. **Rota negada responde HTTP 200 com o conteúdo "Página não encontrada".** O `app/admin/loading.tsx` faz streaming antes do `notFound()`. Não há vazamento: o E2E verifica que a referência, o hub e o detalhe não aparecem. Para devolver um 404 real é preciso mover o gate para o layout da rota ou para o middleware (ajuste pequeno, fora da F5).
2. **Upload de XML/PDF indisponível**, por decisão: depende da política de retenção (D8/DOC-01..05). A tela diz isso e registra só referências.
3. **Memória de cálculo em português mesmo com a interface em chinês**, porque as linhas vêm do motor (texto canônico, que entra no hash). Rótulos, títulos e tabelas estão traduzidos.
4. **A paleta de comandos (Ctrl K) não lista Importações.** O módulo fica só no grupo "Módulos contratados", de propósito, para não aparecer a quem não tem licença.
5. Na **visão geral**, os KPIs em reais aparecem com 2 casas. Lista, apuração e versões mostram a precisão do motor (4 casas no total, 6 no unitário).
6. **Primeiro carregamento lento em modo dev** (compilação sob demanda). Não afeta o build de produção.
7. Continuam valendo da F1–F4: F2 (precisão de custo no ERP) bloqueada até medição em clone; administrador de plataforma não designado; pré-check em clone autorizado pendente.

## 10. GO/NO-GO

| Decisão | Veredito | Condição |
|---|---|---|
| Homologação **local** com o primeiro cliente importador (dados fictícios ou cópia anonimizada, Supabase local) | **GO** | Fluxo criar → mercadorias → tributos/despesas → calcular → memória → salvar/consultar → aprovar demonstrado no E2E e nas capturas, com isolamento entre empresas e sem efeito no ERP |
| Ativar o módulo para o cliente **real em produção** | **NO-GO** | Falta: (a) designar o administrador de plataforma (D9); (b) rodar o pré-check em clone autorizado (F1–F4); (c) aplicar as migrations F1–F5 em produção com autorização explícita; (d) registrar a habilitação comercial (`ops_definir_modulo_empresa`, com contrato) |

## 11. Próxima sprint — custo aprovado no ERP

Objetivo: levar o custo unitário **aprovado** para o ERP, com trilha e sem efeito retroativo.

1. **Pré-requisito: F2 ativa** (custo `numeric(14,6)` em `produtos` e `importacoes_nfe_itens`); sem isso, o custo de 6 casas é truncado.
2. **Vínculo item ↔ produto obrigatório** antes de aplicar (hoje é opcional e só para consulta).
3. **RPC `import_aplicar_custo_aprovado(p_apuracao)`**: só DONO, só apuração aprovada e atual, idempotente (um registro de aplicação por apuração), grava o custo nos produtos vinculados com auditoria e o hash da apuração.
4. **Entrada em estoque** pela via existente (recebimento ou NF-e de importação), usando o custo aprovado; sem estoque paralelo. Decidir a relação com a trava OC × NF-e (D7).
5. **Contas a pagar** a partir das despesas conferidas (fornecedor, despachante, frete), pela mesma regra do financeiro atual; sem AP paralelo.
6. **Preços**: só sugestão de margem sobre o novo custo; nenhuma alteração automática de preço de venda. Margem histórica intocada.
7. Testes: equivalência com a apuração aprovada (hash), reaplicação idempotente, isolamento entre empresas e regressão ERP/PDV.
