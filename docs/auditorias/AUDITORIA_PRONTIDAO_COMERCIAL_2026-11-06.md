# Auditoria de prontidão comercial — Jinlong (2026-11-06)

**Tipo:** auditoria somente leitura. Nenhum código, migration, dado, ambiente, branch ou deploy foi alterado. Sem commit, push ou merge.
**Base:** leitura do repositório (branch `claude/jinlong-commercial-readiness-audit-0d3e9a`, HEAD `2929b09a`), dos documentos de QA/runbooks/auditorias datados de 2026-10-21 a 2026-11-05, e de execução local de guards estáticos.
**Cliente-alvo considerado:** loja de importados/varejo, um caixa, operação presencial, web (`pdv-importados`), sem fiado, sem estoque negativo, sem emissão fiscal pelo sistema.

---

## 0. Testes executados nesta sessão (e o que não foi)

| Verificação | Resultado |
|---|---|
| `guard:core`, `guard:pdv`, `guard:routes`, `guard:rpc`, `guard:pricing`, `guard:migrations`, `guard:domain`, `guard:no-prod-target`, `check:vendabilidade` | OK (9/9) |
| `check:routes` | Exit 0, com avisos informativos de string de rota hardcoded em 4 arquivos |
| Vitest de `app/caixa`, Playwright, suítes psql (`go-live-01`, RLS, multiempresa) | **Não executados.** `node_modules` ausente na worktree; não instalei dependências. Os números de testes citados abaixo são dos documentos de QA, não desta sessão. |
| Banco de produção, homologação e cópias | **Não consultados.** Nenhuma conexão com Supabase foi feita. |

---

## 1. Percentual de prontidão comercial

**Resultado: 35% (6,9 de 20 pontos).**

**Metodologia:** cada uma das 20 áreas pedidas recebe uma situação. Pesos: PRONTO PARA VENDER = 1; PRONTO COM RESTRIÇÕES = 0,7; IMPLEMENTADO, NÃO VALIDADO = 0,4; EM DESENVOLVIMENTO = 0,2; NÃO IMPLEMENTADO / BLOQUEADO = 0. Soma dividida por 20. Pesos iguais por área.

**Esse número não decide nada.** Pela regra de bloqueio, o veredito é NÃO PODE ENTRAR mesmo que o percentual fosse maior, porque há P0 que permite vazamento entre empresas, divergência de caixa e de estoque (seção 5). A parte pronta cobre as vendas básicas; o que falta é justamente o que deixa uma venda segura.

Distribuição: 0 PRONTO PARA VENDER · 5 PRONTO COM RESTRIÇÕES (PDV, estoque, caixa, pagamentos, auditoria) · 7 IMPLEMENTADO, NÃO VALIDADO (produtos, CSV, código de barras, clientes, permissões, relatórios, impressão) · 3 EM DESENVOLVIMENTO (entradas, histórico de movimentações, financeiro) · 4 BLOQUEADO (preços, multiempresa, backup, segurança) · 1 NÃO IMPLEMENTADO (emissão fiscal). Total: 20.

---

## 2. Classificação por funcionalidade

Campos: situação · evidência · teste e resultado · limitação · risco · o que falta.

### 2.1 PDV / Frente de caixa — PRONTO COM RESTRIÇÕES
- **Evidência:** `docs/qa/GO_LIVE_01_GOLDEN_FLOW.md` (roteiro `backend/scripts/go-live-01-golden-flow.test.sql`); `docs/qa/PDV_100_RELATORIO_VALIDACAO.md`; RPC canônica v4 (`guard:rpc` OK).
- **Teste:** golden flow em cópia de banco, 34 asserções OK (2026-11-05). UI PDV-100: 41 de 98 cenários PASSOU, 1 FALHOU (B6, corrigido e retestado), 56 NÃO TESTADO. Parecer da própria validação: **NO-GO**.
- **Limitação:** E2E de interface não executado; cancelamento/devolução/concorrência não testados na UI; cliques repetidos e dupla aba sem prova.
- **Risco:** venda duplicada ou inconsistente sob clique repetido; ausência de prova na tela.
- **Falta:** rodar Playwright `e2e/caixa-*.spec.ts` em homologação com porta fixa; testar concorrência (`pdv-meios-pagamento-concorrencia.sh`, `devolucao-concorrencia.sh`).

### 2.2 Cadastro e gestão de produtos — IMPLEMENTADO, NÃO VALIDADO
- **Evidência:** `pdv-importados/app/gerente/produtos/`, `app/admin/produtos/`, `components/gerente/produtos/`.
- **Limitação:** `preco_custo_medio` nunca é gravado (sempre 0 na tela); `atualizar_preco_varejo_produto` persiste preço sem aprovação nem simulação (auditoria 2026-10-30, itens 1 e 7).
- **Risco:** margem e preço errados sem trilha de aprovação.
- **Falta:** decidir o modelo de custo e de aprovação de preço; teste de cadastro ponta a ponta.

### 2.3 Importação de produtos por CSV — IMPLEMENTADO, NÃO VALIDADO
- **Evidência:** `pdv-importados/lib/gerente/parseProdutoImportCsv.ts`, `produtosCsvContract.ts`, `bulkImportGrid.ts`, `components/gerente/produtos/ProdutosImportarModal.tsx`, `app/gerente/produtos/actions.ts`; testes `parseProdutoImportCsv.test.ts`.
- **Teste:** existem testes unitários no repositório; não executados nesta sessão. Não há registro de importação real com arquivo de loja.
- **Limitação:** não consta validação com planilha do cliente (acentos, separadores, duplicados, preço com vírgula).
- **Risco:** cadastro errado em massa, principalmente preço e estoque inicial.
- **Falta:** rodar a suíte; importar uma planilha real de homologação com contagem e conferência de linhas.

### 2.4 Leitura e pesquisa por código de barras — IMPLEMENTADO, NÃO VALIDADO
- **Evidência:** `useScannerDetector` (teste em `app/caixa`); cenário B3 de `PDV_100_MATRIZ_COBERTURA.md`.
- **Teste:** código digitado + Enter simulado: PASSOU. **Leitor físico não testado** ("Nenhum equipamento foi usado").
- **Limitação:** código não encontrado devolve mensagem genérica; produto inativo e inexistente têm a mesma mensagem (B11).
- **Falta:** teste com leitor físico na loja; decidir o texto de erro.

### 2.5 Preços de varejo e atacado — BLOQUEADO
- **Varejo:** PASSOU (C1: 22,50 e 89,90 batem com `produtos.preco_varejo`).
- **Atacado:** `produtos.preco_atacado` (17,90) é ignorado na venda; só valem as faixas de `precos_atacado` (D-11). Decisão de produto pendente.
- **Risco:** venda com preço de atacado errado ou inconsistente com a etiqueta.
- **Falta:** o dono escolher a fonte oficial do atacado; ajustar a venda; testar atacado.

### 2.6 Controle de estoque — PRONTO COM RESTRIÇÕES
- **Evidência:** `movimentos_estoque_log`; funções de baixa, devolução e transferência.
- **Teste:** golden flow blocos 4, 5, 8, 11–14: baixa, fração 0,5, cancelamento, devolução, transferência, ajuste com saldo defasado recusado. Saldo do arroz fecha em 87 (conta conferida).
- **Limitação:** sem valor no kardex (só `quantidade_delta`); custo médio inexistente; fracionamento aceito em produto UN (D-04); "sem estoque negativo" não aparece como asserção explícita no golden flow.
- **Risco:** divergência de estoque em produto unitário; valorização do estoque errada.
- **Falta:** decidir D-04; confirmar bloqueio de estoque negativo com teste; kardex com valor (item de backlog).

### 2.7 Entradas, saídas e ajustes — EM DESENVOLVIMENTO
- **Ajuste:** PASSOU (bloco 14: gerente ajusta, operador recusado, saldo defasado recusado).
- **Entrada por NF-e:** conta a pagar sem conciliação aceita duplicata que não soma o valor da NF (100,00 com duplicata de 60,00 gera AP de 60,00). Correção em `20261030120000`, aplicada só em homologação.
- **Estorno de NF-e confirmada:** não existe (IM-F03).
- **Custo truncado a 2 casas** na NF-e (`numeric(10,2)`).
- **Falta:** registrar/aplicar `20261030120000`; validar em produção; decidir estorno.

### 2.8 Histórico de movimentações — EM DESENVOLVIMENTO
- **Limitação:** o kardex não guarda valor nem custo unitário (`movimentos_estoque_log` só tem `quantidade_delta`). Sem custo, o histórico não fecha valor.
- **Falta:** `estoque_aplicar_movimento` como escritor único com `custo_unitario` e `valor_total` (backlog 2026-10-30).

### 2.9 Abertura e fechamento de caixa — PRONTO COM RESTRIÇÕES
- **Evidência:** golden flow blocos 2, 15, 16; `PDV_100_RELATORIO_VALIDACAO.md` A2, H1–H5.
- **Teste:** abertura com fundo 200 (PASSOU na UI e no banco); fechamento com diferença −4,90 gravada em `caixas` e `caixas_fechamento_formas` (PASSOU); reabertura por token de uso único (PASSOU na camada RPC, sem tela); venda em caixa fechado recusada.
- **Limitação:** no golden flow a abertura aparece como inserção direta em `caixas`, sem RPC de abertura ("a confirmar na tela"). Venda em espera sobrevive ao fechamento sem aviso (D-06). Cancelamento de venda de caixa fechado não reflete no caixa aberto (S9b); cancelamento com dois caixas abertos sem `caixa_id` é aceito (S12).
- **Risco:** divergência de caixa em fechamento; cancelamento que afeta caixa errado.
- **Falta:** decidir D-06; corrigir S9b e S12 (PR-2); confirmar a abertura na tela.

### 2.10 Formas de pagamento — PRONTO COM RESTRIÇÕES
- **Dinheiro:** PASSOU (venda, troco, dividido).
- **PIX:** PASSOU no split (10 dinheiro + 20 PIX; caixa recebe só o dinheiro). Não há integração bancária: confirmação é manual.
- **Débito e crédito:** não há maquininha integrada. PIX e cartão geram recebível PENDENTE sem conta, porque a loja não tem `contas_financeiras` nem `financeiro_contas_forma` configurados (D-07). Parcelas de crédito dependem de `vendas_pagamentos.parcelas` (migration `20261021120000`, pendente no homolog).
- **Troco e valor recebido não persistidos** (D-05): `vendas_pagamentos` grava só o líquido.
- **Fiado:** NÃO SUPORTADO no servidor, corretamente fora do escopo.
- **Falta:** configurar contas financeiras no ambiente do cliente; decidir se o PIX/cartão bloqueia sem conta; aprovar a migration D-05.

### 2.11 Cadastro de clientes e fornecedores — IMPLEMENTADO, NÃO VALIDADO
- **Evidência:** `app/admin/clientes`, `app/admin/fornecedores`, `app/gerente/fornecedores`.
- **Limitação:** crédito de cliente NÃO TESTADO (golden flow 9b); cliente no PDV não validado na UI.
- **Falta:** teste de cadastro e de vínculo cliente/venda.

### 2.12 Usuários e permissões — IMPLEMENTADO, NÃO VALIDADO
- **Evidência:** `app/admin/funcionarios`, PIN de gerente (`FuncionarioPinModal`), `perfis`, `usuario_vinculos`.
- **Teste:** permissões negativas no banco passaram (desconto sem token recusado, operador recusado em cancelamento, devolução, ajuste, reabertura). Permissão negativa na UI (A6, I9, R9) NÃO TESTADA.
- **Limitação:** o perfil ADMIN legado tem escopo global em `fp_pode_loja` e em dezenas de RPCs (`docs/audits/AUDITORIA_RPC_SECDEF_2026-10-28.md`). O corte ADMIN não foi feito.
- **Risco:** um perfil ADMIN enxerga ou age além da loja.
- **Falta:** confirmar que nenhum caminho cria ADMIN; testes de permissão na UI; plano do corte ADMIN.

### 2.13 Multiempresa e multiloja — BLOQUEADO
- **Evidência:** `docs/runbooks/RECONCILIACAO_HOMOLOG_2026-11-04.md` (isolamento RLS verificado só em homologação); `multiempresa-fase2` e `fase5` vermelhas; tabelas `comissoes_*`, `funcionario_dados`, `import_*` sem `tenant_guard` nem isenção documentada.
- **Teste:** operador de outra empresa recusado em venda, transferência e histórico (golden flow bloco 18). Verificação cruzada não achou vazamento em homologação.
- **Bloqueio:** em produção, as três views do P0-1 expõem dados de todas as empresas. Só é corrigível com aprovação para aplicar a migration.
- **Falta:** aplicar `20261104120000` em produção com autorização; fechar `tenant_guard` nas tabelas da fase 2; provisionar uma loja nova e confirmar isolamento.

### 2.14 Relatórios gerenciais — IMPLEMENTADO, NÃO VALIDADO
- **Evidência:** `app/admin/relatorios`, `app/gerente/relatorios`; testes de `RelatoriosContent`.
- **Limitação:** o fuso dos relatórios é global (`relatorio_settings.timezone`), não por loja (checklist 0.6). Não há conferência de número de relatório contra o caixa no golden flow.
- **Falta:** conferir um relatório de fechamento contra `caixas` e `vendas` em homologação.

### 2.15 Financeiro — EM DESENVOLVIMENTO
- **Limitação:** após vendas em dinheiro e PIX, `movimentos_financeiros`, `contas_receber` e `movimentos_caixa` ficaram vazios (D-07, a confirmar). Contas a pagar fora do fluxo do PDV. Contas a pagar de NF-e com a conciliação defeituosa (2.7). Estorno de AP paga: decidir regra.
- **Teste:** "contas a receber / a pagar: NÃO TESTADO" no golden flow.
- **Falta:** confirmar com o código do financeiro se o saldo em `caixas.saldo_atual` é o desenho; validar as suítes psql (`ap-payments`, `ar-receipts`, `financeiro-hardening`).

### 2.16 Auditoria e histórico — PRONTO COM RESTRIÇÕES
- **Evidência:** `venda_eventos` (SALE_REGISTERED), `vendas_canceladas_auditoria`, `venda_pos_venda_operacoes`, `devolucoes`, `movimentos_estoque_log`.
- **Teste:** golden flow blocos 11, 12, 14 (registros gravados, repetição sem efeito duplo).
- **Limitação:** teste E2E de auditoria (autor, data, alteração) não criado (P1 do backlog).
- **Falta:** criar esse teste de ponta a ponta.

### 2.17 Emissão fiscal / Focus NFe — NÃO IMPLEMENTADO (para emissão)
- **Evidência:** `backend/supabase/functions/fiscal-worker/` (código com testes, `fiscal_focus_dto.ts`, `fiscal-provider-adapter.ts`). Checklist de corte: "sistema não emite documento fiscal real; fiscal = stub".
- **Limitação:** NFC-e é stub; NF-e depende da consolidação (PR #653, bloqueada). Termos e Privacidade prometem emissão fiscal.
- **Risco:** risco jurídico e comercial se o cliente for vendido com emissão fiscal.
- **Falta:** a loja emite no emissor atual (checklist 0.1); revisar os Termos antes de qualquer contrato.

### 2.18 Impressão e comprovantes — IMPLEMENTADO, NÃO VALIDADO
- **Teste:** F9 PASSOU (recibo exibido com itens e pagamentos, na tela). Impressora térmica NÃO TESTADA.
- **Limitação:** não há RPC nem tabela de comprovante; a emissão é de tela. Parcelas de crédito não aparecem na 2ª via.
- **Falta:** teste com a impressora da loja; decidir a 2ª via.

### 2.19 Backup e recuperação — BLOQUEADO
- **Evidência:** `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md`; `backend/scripts/backup-ro-postgres.sh`.
- **Teste:** procedimento de dump e restore testado só em contêiner descartável. **Produção não consultada; restore drill não feito.** PITR e retenção do projeto `jinlong` não verificados.
- **Bloqueio:** o próprio documento diz que sem essa informação a aplicação em produção não é autorizada.
- **Falta:** o dono anotar PITR/retenção no painel; dump de produção com hash; restore drill com RTO medido; rotina diária (P1).

### 2.20 Segurança e isolamento entre empresas — BLOQUEADO
- **P0 aberto em produção:** `v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias` contornam o RLS (sem `security_invoker`); `anon` vê dados. A correção `20261104120000` está no repositório e foi aplicada só no homolog.
- **Outros:** `anon` com `SELECT` em 70 objetos de `public` (`RECONCILIACAO_HOMOLOG_2026-11-04.md`, item 4); `pg_stat_statements` exposto a `PUBLIC` e `net` enfileirando HTTP (plataforma Supabase); proteção de senha vazada não confirmada; `commercial_leads` sem `INSERT` para `anon` (formulário do site falha).
- **Falta:** autorização para aplicar `20261104120000` em produção e validar com leitura; pedir ao administrador da plataforma as revogações; decidir o formulário comercial.

---

## 3. Simulação do primeiro cliente (fluxo de ponta a ponta)

Legenda: ✅ comprovado no banco ou na UI · ⚠ com ressalva · ❌ impedimento · ⏸ não testado.

| # | Etapa | Situação | Observação |
|---|---|---|---|
| 1 | Instalação e configuração inicial | ⏸ | Wizard de provisionamento existe (`app/admin/provisionamento`), mas o teste controlado em produção não foi aprovado. Homologação não reproduz produção. |
| 2 | Cadastro da loja e usuários | ⚠ | Cadastro de funcionário existe; ADMIN legado com escopo global (2.12). |
| 3 | Cadastro ou importação de produtos | ⚠ | Cadastro unitário e CSV implementados, não validados com planilha real (2.2, 2.3). |
| 4 | Configuração de preços | ❌ | Atacado sem fonte definida (D-11); custo médio nunca gravado. |
| 5 | Abertura do caixa | ✅ ⚠ | Fundo 200 comprovado. Confirmar abertura na tela (sem RPC de abertura no banco). |
| 6 | Vendas | ✅ ⚠ | Banco: 34 asserções OK. UI: 41 PASSOU. Concorrência ⏸. |
| 7 | Recebimento: dinheiro, PIX, débito, crédito | ⚠ | Dinheiro e PIX ✅. Débito/crédito sem maquininha; recebível pendente sem conta (D-07); troco não gravado (D-05). |
| 8 | Atualização do estoque | ✅ ⚠ | Baixa, cancelamento, devolução comprovados. Fração em UN aceita (D-04). |
| 9 | Consulta de vendas | ✅ | Histórico do gerente vê vendas, incluindo a cancelada (bloco 17). |
| 10 | Fechamento do caixa | ✅ ⚠ | Diferença gravada. Espera sobrevive ao fechamento (D-06). |
| 11 | Conferência financeira | ❌ | Movimentos financeiros vazios (D-07); AP com conciliação defeituosa; contas a receber não testadas. |
| 12 | Histórico e relatórios | ⚠ | Histórico ✅; relatórios não conferidos contra o caixa; kardex sem valor. |

**Onde o sistema já opera:** venda com dinheiro e PIX, pagamento dividido, venda em espera, cancelamento e devolução com estoque e auditoria, transferência entre lojas, ajuste de estoque, fechamento com diferença. **Onde há impedimento:** preço de atacado, conta financeira, troco, D-06, conferência financeira, e o vazamento em produção.

---

## 4. O que podemos prometer comercialmente

**A. Podemos oferecer agora** (comprovado no banco; UI com ressalvas): venda à vista em dinheiro e PIX com caixa aberto/fechado; venda com pagamento dividido dinheiro + PIX; busca por nome e código digitado; venda em espera; cancelamento e devolução com estoque restituído; ajuste de estoque por gerente; fechamento de caixa com diferença registrada.

**B. Podemos oferecer com ressalvas:** cadastro de produtos e importação CSV (após rodar a suíte e uma planilha real); leitor de código de barras (só se a loja testar o aparelho antes); débito e crédito, registrados manualmente, sem maquininha integrada e com conta financeira configurada antes; relatórios gerenciais com fuso global; impressão de comprovante na tela; permissões por perfil, com o ADMIN legado fora do uso.

**C. Não devemos prometer ainda:** emissão fiscal (NFC-e e NF-e pelo sistema); fiado e crédito de cliente; preço de atacado automático; custo médio e margem; estorno de NF-e; conciliação de contas a pagar de NF-e; integração de maquininha; cobrança recorrente Asaas; hub de autoatendimento; importação internacional; PDV desktop/offline (`pdv-local`); backup com RPO de 24 h e restauração medida; isolamento multiempresa como garantia até o P0-1 ser corrigido em produção.

---

## 5. Bloqueadores para o primeiro pagamento

Critério de P0: pode gerar vazamento de dados entre empresas, divergência de caixa ou de estoque, ou impedir a operação. P1: falta para lançar. P2: melhoria.

### P0

| ID | Problema | Evidência | Impacto |
|---|---|---|---|
| P0-1 | Views `v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias` expõem vendas de todas as empresas em produção | `backend/supabase/migrations/20261104120000_sec_anon_privilegios_minimos.sql` (linhas 26–28; repositório, não produção); `RECONCILIACAO_HOMOLOG_2026-11-04.md` | Vazamento entre empresas, para qualquer logado e para `anon` |
| P0-2 | Drift de migrations em produção: 11 sem registro e `migration-remote-drift` vermelho; 12 migrations da main adiadas (incluindo corte de ADMIN, revogação de helpers e token de gerente) | `PROXIMOS_PASSOS.md` P0; `RECONCILIACAO_DRIFT_MIGRATIONS.md` | Schema de produção diferente do repositório; cada aplicação futura é arriscada |
| P0-3 | Backup não verificado em produção: PITR e retenção desconhecidos; restore drill não feito | `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md` | Sem restauração comprovada, perda de dados não tem recuperação garantida |
| P0-4 | Golden flow de interface não executado; concorrência e clique repetido sem prova | `GO_LIVE_01_GOLDEN_FLOW.md` (NO-GO); `PDV_100_RELATORIO_VALIDACAO.md` (NO-GO) | Venda duplicada ou caixa divergente sob uso real |
| P0-5 | PIX e cartão geram recebível pendente sem conta financeira configurada | D-07, `PDV_100_1_DEFEITOS_E_DECISOES.md` | Caixa e financeiro divergentes; conferência impossível |
| P0-6 | Venda em espera sobrevive ao fechamento do caixa | D-06 | Venda que não entra no caixa fechado |
| P0-7 | Troco e valor recebido não persistidos | D-05 | Não é possível auditar o dinheiro recebido |
| P0-8 | Fração aceita em produto UN (ex.: 2,5 chaleiras) | D-04 | Divergência de estoque |
| P0-9 | Cancelamento de venda de caixa fechado não reflete no caixa aberto; cancelamento com dois caixas abertos aceito | S9b, S12 (PROXIMOS_PASSOS, PR-2) | Caixa com saldo errado |
| P0-10 | Preço de atacado ignorado; fonte não definida | D-11 | Venda por preço errado |

### P1 (falta para lançar, não impede a primeira venda isolada)

- Emissão fiscal: revisar os Termos, que prometem emissão, antes de qualquer contrato (`PROXIMOS_PASSOS.md`, P1).
- ADMIN legado com escopo global; corte ADMIN não feito.
- `tenant_guard` nas tabelas da multiempresa fase 2 (`comissoes_*`, `funcionario_dados`, `import_*`).
- Permissões negativas na UI (A6, I9, R9) e concorrência (`pdv-meios-pagamento-concorrencia.sh`).
- Kardex sem valor; custo médio nunca gravado; preço de venda alterado sem aprovação.
- NF-e: conciliação de duplicatas (`20261030120000`) não aplicada em produção; custo truncado a 2 casas.
- `anon` com `SELECT` em 70 objetos de `public`.
- Formulário comercial do site falha (`commercial_leads` sem INSERT para `anon`).
- Proteção de senha vazada não confirmada; `pg_stat_statements` e `net` a revogar na plataforma.
- Fuso dos relatórios global, não por loja.
- Teste de leitor de código de barras e impressora térmica na loja.

### P2 (melhoria)

- D-08 (Enter antes da lista carregar): não reproduzido na 2ª rodada; monitorar.
- Mensagem de produto inativo igual à de inexistente (B11).
- Capturas e vídeos dos fluxos em `docs/qa/evidencias/`.
- Dependabot e política de CI.
- Contas a receber: parcelamento automático a partir de `vendas_pagamentos.parcelas`.

---

## 6. Riscos operacionais e de segurança

- **Vazamento entre empresas (P0-1).** Está em produção enquanto a migration não for aplicada. Risco de exposição já existente, não só potencial.
- **Divergência de caixa e estoque (P0-5 a P0-10).** Ocorre sem alerta no fluxo atual; a conferência depende de o gerente comparar telas.
- **Produção fora do repositório (P0-2).** Qualquer `db push` pode falhar ou aplicar o que não foi testado.
- **Recuperação não comprovada (P0-3).** Em caso de perda, não há RTO medido.
- **Dependência de intervenção técnica:** tokens revogados impedem reenvio de vendas offline (`pdv-local`), e itens em ERRO exigem tratamento manual com o dono (`RECUPERACAO_ACESSO_TOKENS.md` §4). Isso exige intervenção técnica frequente.
- **Risco fiscal e jurídico:** Termos prometem emissão; sistema não emite.
- **Suporte:** sem SLA, cobrança manual no 1.º ciclo (checklist de corte).

---

## 7. O que falta para começar a cobrar

Mínimo, em ordem:

1. Autorizar e aplicar `20261104120000` em produção, com validação de leitura (anon sem acesso; views com `security_invoker`).
2. Reconciliar o ledger de migrations de produção (`migration-remote-drift` verde) ou registrar a decisão de cada uma das 11.
3. Anotar PITR e retenção no painel; dump de produção com hash; restore drill com RTO medido.
4. Decidir D-04, D-05, D-06, D-07, D-11 e implementar só o que for decidido.
5. Rodar o golden flow E2E de interface e os testes de concorrência em homologação, com contas de teste.
6. Configurar as contas financeiras do cliente e confirmar o recebível de PIX/cartão.
7. Conferir a importação de produtos com uma planilha real.
8. Testar leitor e impressora na loja (`CHECKLIST_SMOKE_MAQUINA_LOJA.md`).
9. Revisar os Termos e o contrato de piloto (sem emissão fiscal, cobrança manual).

---

## 8. Estimativa de esforço restante

Sem prazo calendário, porque depende de decisões do dono e de janelas de produção. Em termos de trabalho, o que está em aberto é: 5 decisões de produto (D-04, D-05, D-06, D-07, D-11); 1 aplicação de migration com autorização (`20261104120000`) e a reconciliação de 11 migrations; 1 rodada de E2E de interface com concorrência; 1 backup e restore com medição; 2 correções de caixa (S9b, S12). Não estimo horas; a parte de decisão é o gargalo.

---

## 9. Recomendação final

### **NÃO PODE ENTRAR**

**Motivo:** há um P0 de vazamento entre empresas já presente em produção (P0-1), um P0 de schema fora do repositório (P0-2) e um P0 de recuperação não comprovada (P0-3). Além disso, a própria validação de PDV está marcada como NO-GO, e o caixa ainda diverge em casos reais (P0-5 a P0-10).

**Quando pode mudar para PODE ENTRAR COM RESTRIÇÕES:** após P0-1, P0-2 e P0-3 fechados com evidência, e após o golden flow E2E de interface passar em homologação com venda à vista, pagamento dividido, cancelamento e fechamento. Nesse ponto, o escopo deve ser o da seção 4.A e 4.B, com emissão fiscal fora do contrato.

---

## Anexo — arquivos de referência

- `PROXIMOS_PASSOS.md` (P0/P1/P2 de origem)
- `docs/qa/GO_LIVE_01_GOLDEN_FLOW.md`, `docs/qa/PDV_100_RELATORIO_VALIDACAO.md`, `docs/qa/PDV_100_1_DEFEITOS_E_DECISOES.md`, `docs/qa/PDV_100_MATRIZ_COBERTURA.md`
- `docs/runbooks/RECONCILIACAO_HOMOLOG_2026-11-04.md`, `docs/runbooks/RECONCILIACAO_DRIFT_MIGRATIONS.md`, `docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md`
- `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md`, `docs/audits/AUDITORIA_RPC_SECDEF_2026-10-28.md`
- `backend/supabase/migrations/20261104120000_sec_anon_privilegios_minimos.sql`
- `backend/supabase/functions/fiscal-worker/`
- `pdv-importados/lib/gerente/parseProdutoImportCsv.ts`
