# Próximos passos

## P0 — Quebrado/travado

- Recuperação de senha do ERP falhava sem mensagem clara (validação silenciosa e erro do Supabase em inglês). Correção em PR Draft; validar em produção após revisão. Conferir no Supabase (Authentication → URL Configuration) que o domínio do ERP está em Redirect URLs
- Admin do Hub sem acesso à senha (`hub.jinlong.app/login`): o Hub não tem fluxo de recuperação. Usar o ERP em `/auth/esqueci-senha` (mesmo projeto Supabase `kbabmewnahysfvlybiak`, mesmo `auth.users`) e confirmar a conta em `commercial_admins`. Aguarda autorização explícita do dono para enviar o e-mail e redefinir
- PR #655: label `deploy-prod:aprovado` aplicado pelo dono (2026-11-05). Pendente: migrations `remote_ausente` (`migration-remote-drift` continua vermelho) (`20261028100000`–`20261030140000`, no `migration-remote-drift`). Types drift já corrigido em `823142b6`
- Drift de migrations em produção: `jinlong` (`kbabmewnahysfvlybiak`) continua com 11 migrations sem registro e o check `migration-remote-drift` vermelho. Homolog já está reconciliado (481 versões, 31 aplicadas e registradas em 2026-11-04). Produção só com decisão e autorização próprias. Detalhes e matriz em `docs/runbooks/RECONCILIACAO_HOMOLOG_2026-11-04.md`
- Homologação funcional incompleta: falta login real com contas de teste e os fluxos de escrita (PDV, vendas em espera, estoque, NF-e, financeiro, cancelamentos, concorrência). Só isolamento RLS e privilégios foram verificados (`docs/runbooks/RECONCILIACAO_HOMOLOG_2026-11-04.md`, seção 11)
- Segurança (vazamento): as views `v_vendas_dia`, `v_top_produtos` e `v_venda_consistencia_anomalias` contornam o RLS e expõem vendas de todas as empresas para qualquer logado e para `anon` (confirmado no homolog com privilégios reais). Correção `20261104120000_sec_anon_privilegios_minimos.sql` aplicada no homolog em 2026-11-04 (confirmado: `anon` sem acesso). Falta aplicar em produção com decisão própria
- Segurança (plataforma): `pg_stat_statements` expõe texto de consultas a `PUBLIC`, e `net` deixa `anon` enfileirar HTTP. Ambos são do Supabase; pedir a revogação a quem administra o projeto
- Regressão preexistente: `anon` não tem `INSERT` em `commercial_leads`, então o formulário comercial do site falha. Decidir se concede o INSERT (policy já existe) ou desativa o formulário
- PDV-100 D-07: PIX e cartão geram recebível PENDENTE sem conta, porque a loja não tem `contas_financeiras` nem `financeiro_contas_forma` configurados. Configurar contas no ambiente e decidir se a venda deve bloquear sem conta (`docs/qa/PDV_100_1_DEFEITOS_E_DECISOES.md`)
- PDV-100 D-11 (decisão): `produtos.preco_atacado` (17,90) é ignorado na venda; só as faixas de `precos_atacado` contam. Escolher a fonte oficial do atacado antes de liberar
- PDV-100 D-05 (decisão): o troco e o valor recebido não são persistidos. Proposta com coluna nova em `vendas_pagamentos` e mudança no RPC v4 em `docs/qa/PDV_100_1_DEFEITOS_E_DECISOES.md`; depende de aprovação (migration + SSoT do fechamento)
- Sprint final (golden flow do PDV): trabalho recuperado em `claude/jinlong-pdv-operational-validation-56c18a` (GO-LIVE-01, 44 commits à frente da main, publicado em 2026-11-05). Ainda não executado nesta sessão: stack E2E isolada, Playwright do fluxo (login, caixa, venda, pagamento dividido, cancelamento, devolução, fechamento, estoque e financeiro), e o alerta "Não foi possível concluir" após operação efetivada
- Inventário: 55 worktrees e ~280 branches locais; muitos trabalhos sem upstream (ex.: `feat/pr2d-caixas-elegiveis-rpc` +32, `codex/pdv-pagamentos-desconto` +2, `claude/troca-reposicao-caixa-gerente` +1). Consolidar em uma solução por tema antes de novas implementações; não apagar worktrees de outros trabalhos
- Merge da PR #653 (consolidação NF-e com #654) bloqueado até o dono confirmar o registro de produção; decidir sobre o label `deploy-prod:aprovado`, que não foi aplicado (`docs/audits/CONSOLIDACAO_NFE_2026-11-01.md`)
- Conta a pagar de NF-e sem conciliação: confirmação aceita duplicatas que não somam o valor da NF (NF 100,00 com duplicata 60,00 gera AP de 60,00). Reproduzido em homologação em 2026-10-30. Correção em `20261030120000` (commit 81daca66), aplicada em homologação fora do histórico de migrations; pendente registrar/aplicar formalmente e validar em produção antes de liberar (D-1)
- Suíte de NF-e inexecutável no esquema atual: os 13 scripts `.test.sql`/`.mjs` não criam `empresa_id` (trigger `EMPRESA_ID_OBRIGATORIA`), e `nfe-conferencia-flx05-ui` espera `IMPORT_NFE_LOJA` enquanto o código retorna `ACESSO_LOJA_NEGADO`. Corrigir fixtures antes de qualquer PASSOU novo (D-4, D-5)
- Nenhuma NF-e confirmada pode ser estornada: a única função de estorno é `estornar_pagamento_contas_pagar` (pagamento). Decidir regra para AP paga antes de implementar (D-3)
- Decisões P1–P8 da auditoria de importação registradas (2026-10-29). Pendente de contador: validar P3 (tributos no custo por regime) antes de IM-F02. P1 exige atualizar D1 por escrito. P9–P12 seguem abertos
- Custo truncado a 2 casas na NF-e: `preco_custo`, `custo_unitario` (itens e conferência) são `numeric(10,2)` e a importação arredonda com `ROUND(…,2)`. Resolver a escala (P1 do plano: D1 diz 4 casas, o requisito pede 6) e migrar (IM-F01, `docs/audits/PLANO_CONSOLIDADO_IMPORTACAO_IM-F01_F05_2026-10-29.md`)
- Custo médio não existe: `preco_custo_medio` nunca é gravado e `preco_custo` guarda o último custo da NF-e. Implementar função central de movimento de estoque e média ponderada por loja (IM-F01)
- Aplicar em produção o pacote S1 → S1c → S1b → G14 (merge do #648 já está em `origin/main`, `a9579e6a`). Exige o label `deploy-prod:aprovado` na janela de produção; seguir `docs/regras-negocio/PLANO_APLICACAO_S1_PRODUCAO.md`
- Smoke de venda real após a aplicação de 20261023120000 (#628): pós-checagem de catálogo OK em 2026-10-28, mas nenhuma venda desde 2026-10-16 para provar a baixa de estoque online/offline sob o novo privilégio
- Aprovar (ou ajustar) o teste controlado de provisionamento em produção: `docs/runbooks/TESTE_CONTROLADO_PROVISIONAMENTO_PRODUCAO.md`. Homologação não reproduz produção (parou em 20261019170000, sem RPCs do trial). O lado banco já está validado em `backend/scripts/provisionamento-wizard-trial.test.sql`
- Aprovar o merge de #629 (migration validada: segurança, concorrência, rollback)
- #620: CI corrigido (token entre empresas e tipos); revisar e aprovar; após merge, deploy manual das Edge Functions alteradas. #623: decidir o comportamento esperado sem ADMIN nos ~20 testes que ainda criam ADMIN; depois regenerar tipos
- Decidir módulos marcados DRAFT já aplicados em produção (comissão #607, import intelligence #601): validar ou esconder do cliente
- Congelar features até o corte do primeiro cliente (só hotfix P0 em produção)
- Decidir o lote de segurança das migrations 20261028100000–20261104180000 (adiadas no manifesto): a 20261104120000 (privilégios de anon) está aberta em produção e é a prioridade; depois 20261028110000, 20261028122000 e a cadeia de leads

## P1 — Falta para lançar (MVP)

- PDV-100 D-04 (decisão de produto): o carrinho aceita quantidade fracionada em qualquer produto, inclusive `unidade_medida = UN` (ex.: 2,5 chaleiras). Decidir se bloqueia por unidade ou mantém (balança)
- PDV-100 D-05: `vendas_pagamentos` grava só o valor líquido. Persistir valor recebido e troco para auditar o dinheiro
- PDV-100 D-06: venda em espera (EM_ESPERA) sobrevive ao fechamento do caixa sem aviso. Definir regra: bloquear, transferir ou descartar
- PDV-100: cenários ainda não testados na validação operacional: cancelamento e devolução (G1–G6), permissões negativas (A6, I9, R9), concorrência e cliques repetidos (Etapa 4), cliente e crédito, atacado, desconto e pagamento insuficiente. Ver `docs/qa/PDV_100_MATRIZ_COBERTURA.md`
- PDV-100: rodar os specs Playwright `e2e/caixa-*.spec.ts` contra `http://localhost:3002` (fixar a porta no `playwright.config`; hoje o baseURL não foi confirmado)
- PDV-100: testar leitor de código de barras, impressora térmica e Tauri. Nenhum equipamento foi usado na validação
- Fase 3 (segurança): reconciliar o ledger de migrations (repo × produção) antes de aplicar qualquer SQL; depois homologar e aplicar `003_perfis` e `004_feature_flags`; homologar `002_vendas_dml_direto` com a matriz completa (`docs/security/MATRIZ_TESTES_HOMOLOGACAO_FASE3.md`) e só então aplicar em produção. Não aplicar `001_caixas` (o trigger `trg_caixas_fechado_imutavel` já está em produção). Ver `docs/security/PLANO_REMEDIACAO_VULNERABILIDADES.md`
- Fase 3 (decisões do dono): reabertura de caixa via `retomar_caixa_atomico` (há RPC, sem tela), se `perfis` deve continuar existindo, se feature flags precisam de tela, teto de `valor_inicial` na abertura de caixa (N1)
- Fase 3 (performance): promover a migration `20260913090000` (validação de fuso sem `pg_timezone_names`, existe no repo e não está em produção) após reconciliação; medir antes/depois. Ver `docs/performance/DIAGNOSTICO_TIMEOUTS_E_PERFORMANCE.md`
- Fase 3 (PDV offline): remover ou proteger o comando Tauri `sync_outbox` simulado (`pdv-local/src-tauri/src/main.rs:43`), que marca registros como ENVIADO sem enviar
- Fase 3 (backup): rotina diária com `backend/scripts/backup-ro-postgres.sh` + `age` + SHA-256 + alerta + restauração mensal; RPO 24 h e RTO medidos. Ver `docs/backup/PLANO_OPERACIONAL_BACKUP_RESTAURACAO.md`

- Verificar backup e PITR no painel (projeto `jinlong`, Database → Backups) e registrar retenção e último backup. Pré-requisito de qualquer autorização de produção (`docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md`)
- Cobrança do DONO indisponível em produção: `fp_sou_dono_da_empresa` e `cobranca_*` só existem após a `20261028101000` (adiada). Decidir a revisão da cobrança com esse custo de produto visível (`docs/ops/TRANCHE_VALIDACAO_2026-11-05.md` §4)
- Recuperação de vendas offline com token revogado: não há reenvio com token novo no PDV (`pdv-local`). Itens em ERRO exigem tratamento manual com autorização do DONO (`docs/ops/RECUPERACAO_ACESSO_TOKENS.md` §4)
- Grants de escrita de `authenticated` em `tokens_desconto_gerente` e `tokens_autorizacao_operacao` (defesa em profundidade; hoje a RLS nega a escrita): revogar após decisão do dono
- Testes de ambiente local: `c1-secdef` e `fase1-hardening-grants` falham no contêiner por ACL padrão e grants que diferem de produção (produção verificada por leitura: OK). Alinhar o snapshot de teste
- `multiempresa-fase2-cobertura`: tabelas `comissoes_*` e outras sem `tenant_guard` nem isenção documentada. Produção tem RLS ligado e políticas só para `authenticated`; revisar tabela a tabela (pré-existente)
- `corte-admin-pg-local/run.sh` não executado: exige cluster local com `PG_BIN`
- Homologação isolada e confirmada antes de qualquer pedido de produção da tranche. O `jinlong-homolog-palm` não é limpo (ver `docs/ops/TRANCHE_VALIDACAO_2026-11-05.md` §8)
- Autorizar o merge do PR #623 (remover ADMIN): conflito com a main resolvido na branch do PR (commit 193293d7, local, sem push); validação pendente de revisão
- Kardex sem valor: `movimentos_estoque_log` só tem `quantidade_delta`. Criar `estoque_aplicar_movimento` como único escritor, com `custo_unitario` e `valor_total` (auditoria 2026-10-30, item 3 do backlog)
- Tela de produto mostra `preco_custo_medio` = 0 (campo nunca gravado) e `atualizar_preco_varejo_produto` persiste preço sem aprovação nem simulação (auditoria 2026-10-30, Parte 2, itens 1 e 7)
- Custo de reposição e fluxo de aprovação de preço não existem (auditoria 2026-10-30, itens 9–10 do backlog). Decidir o modelo antes de expor margem ao gerente
- Estorno de NF-e confirmada não existe: nada reverte kardex nem AP não paga (IM-F03)
- XML da NF-e não é guardado (sem `sha256` nem bucket privado); depende de DOC-01..05 e da decisão P11 (IM-F04)
- Regra ×1,5 aplicada automaticamente ao `preco_varejo` no import (`20261005173427`) viola D7: remover e exigir ação do usuário (IM-F04)
- Custos complementares da NF-e (frete, seguro, outras despesas, descontos) não são lidos pelo parser (IM-F02)
- Pipeline de importação internacional (`import_*`) não grava em estoque, custo, AP nem preço: manter desligado e decidir pós-MVP
- S2 (recebimento): identidade canônica por recebimento e item, com vínculos OC ↔ remessa ↔ NF-e, recebimento parcial e bloqueio de dupla creditação entre origens (D12: recebimento físico é a origem do crédito)
- S4 (contas a pagar): UNIQUE em `(nfe_importacao_id, numero_duplicata)` e reconciliação duplicatas × valor da NF-e com tolerância de R$ 0,01 (D3). Checar duplicidades existentes antes da migration
- S3 (custo médio): média ponderada móvel por loja (D1), centralização dos escritores de estoque em `estoque_aplicar_movimento` por migração incremental (modo sombra e regressão por escritor)
- S5 (planos): mapear planos → módulos e bloquear Importação Internacional para clientes sem o módulo (D5) antes de vendê-la
- Ligar leaked password protection no Supabase Auth (a view SECURITY DEFINER foi resolvida pelo #618; advisor confirma em 2026-10-23)
- Aprovar e aplicar #629 (issue #586: vínculo SAÍDA↔ENTRADA de transferência no kardex); fechar a issue só depois da verificação em produção
- Consolidar testes únicos de PRs antigos antes de encerrá-los: pilha #487/#488/#498/#499/#500 (fiscal/financeiro) e experimentos multiempresa #492–#496 (matriz negativa de isolamento)
- Corte ADMIN: o perfil ADMIN legado tem escopo global em fp_pode_loja e em dezenas de RPCs (docs/audits/AUDITORIA_RPC_SECDEF_2026-10-28.md). Confirmar que nenhum caminho de tenant atribui ADMIN e planejar a remoção
- Fechar as 7 RPCs NÃO VALIDADAS da auditoria SECDEF criando objetos da empresa B no fixture (vendas em espera, movimentações, documento fiscal)
- Adicionar tenant_guard (ou isenção com motivo) nas tabelas da multiempresa-fase2 (funcionario_dados, comissoes_*, import_*); a verificação cruzada não achou vazamento, então é defesa em profundidade
- Reescrever multiempresa-fase5 (espera EXECUTE de authenticated em decrementar_estoque_seguro, revogado de propósito em 20261023120000) e corrigir a contagem de RPCs do rollback da fase2 (65 vs 55)
- Caixa: cancelamento de venda de caixa fechado não reflete no caixa aberto (S9b) e cancelamento com 2 caixas abertos sem caixa_id é aceito (S12); fechar no PR-2
- GO-LIVE-01 (NO-GO): golden flow SQL passa na cópia `sec_gf01` (34 asserções OK, matriz em `docs/qa/GO_LIVE_01_GOLDEN_FLOW.md`). Falta: E2E de interface (BLOQUEADO: sem acesso aos `.env` do `pdv-importados` e a API local serve outro banco; ver matriz), concorrência de duas sessões (`pdv-meios-pagamento-concorrencia.sh`, `devolucao-concorrencia.sh`), comprovante e crédito de cliente
- GO-LIVE-01: decidir aplicar `20261104180000` (títulos, caixa e produto fora do escopo) em `jinlong-homolog-palm`. Exige autorização explícita; o rollback foi verificado na cópia
- Rodar as suítes de psql (ap-payments, ar-receipts, sale-totals, financeiro-hardening, financial-adversarial, ux04, funcionario-dados-rls) num banco de homologação migrado, via npm run test:financial
- Criar teste de reposição de estoque no cancelamento e teste ponta a ponta de auditoria (autor, data, alteração)
- Definir preço real em saas.planos (hoje placeholder) e contrato de piloto sem NFC-e/SLA
- Revisar Termos e Privacidade (prometem emissão fiscal; fiscal é stub) e incluir o uso do contato do teste grátis pelo comercial (LGPD)
- Provisionar empresa/loja nova para o cliente pelo wizard e validar o isolamento multiempresa (nenhum dado de outra loja visível); não usar o script de limpeza, que apaga dados de todos os tenants
- Registrar restore drill com RTO a partir de um backup novo, tirado após a reconciliação de migrations
- Cobrar o primeiro ciclo manualmente (PIX/boleto)
- Smoke presencial na máquina da loja (docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md)
- Executar docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md
- Testar a troca de operador na homologação com dois usuários reais (trocar, assumir, bloquear com PIN, fechar) antes do label deploy-prod:aprovado no #634
- GROWTH-001: revisar e aprovar o PR da Central de Conversão; com autorização, aplicar a migration 20261023130000 (restaurada em 2026-11-01; #629 está em 20261029155000) e só depois publicar o hub (deploy do ERP deixa o autoatendimento de assinatura desligado)
- Aplicar na homologação (jinlong-homolog-palm) a migration 20261021120000_vendas_pagamentos_parcelas_credito (coluna vendas_pagamentos.parcelas) antes de exibir parcelas no detalhe admin e na 2ª via do cupom

## P2 — Melhoria

- PDV-100 D-08: a falha de "Enter antes da lista carregar" não foi reproduzida na 2ª rodada. Monitorar; sem reprodução não há correção
- PDV-100 D-10: não é loop (contagem estável em idle). Nenhuma ação; manter monitoramento
- PDV-100: salvar capturas de tela e vídeo dos fluxos em `docs/qa/evidencias/` (hoje só existem na sessão)
- Dependabot (#544, #547, #548, #549): decidir a política de CI. A anon key é pública e pode ir para os secrets de Dependabot; `PLAYWRIGHT_TEST_PASSWORD` e `SUPABASE_ACCESS_TOKEN` não devem ir (risco de exfiltração por pacote de terceiro). Alternativa: tratar Dependabot como fork no workflow
- Dependabot #546 (Sentry 11): import corrigido para `@sentry/nextjs/config` e branch atualizada com a main; validar CI e smoke de captura de erro
- Dependabot #583: dependência fantasma `@testing-library/react` declarada e fixture de Storage corrigida; validar CI (inclui pglite 0.3→0.5)
- Decidir os PRs antigos mantidos (consolidar ou encerrar): #537 e #491 (arquivos únicos), backup JIT #485/#486/#506, capacidade #530–#534 (#529 mergeado), UX #541/#542/#550, #484/#489/#508, #490 (Speed Insights: checar custo Vercel) — detalhes em `docs/auditorias/SANEAMENTO_BACKLOG_2026-10-23.md`
- Ativar hub.jinlong.app: merge do #632, primeiro deploy Production do hub e smoke (docs/runbooks/PUBLICACAO_HUB_JINLONG.md)
- Site Premium 2.0: configurar SITE_DEMO_SUPABASE_URL/ANON_KEY no Preview para homologar o formulário com gravação real
- Site Premium 2.0: revisão nativa do chinês antes de NEXT_PUBLIC_SITE_ZH_REVIEWED=true
- Ativar cobrança Asaas depois do primeiro ciclo manual (sandbox, depois produção com prova ponta a ponta: deploy asaas-webhook, secrets, cron de vencimentos)
- Fase fiscal Focus NFC-e antes do segundo cliente
- Advisor onda 3: auditar as SECURITY DEFINER executáveis por authenticated e criar guarda de CI para novas sem `auth.uid()`
- Corrigir fixture de `pr1b-kardex-imutavel.test.sql` (loja sem empresa → `LOJA_SEM_EMPRESA`) e check 30 de `verify_p0_producao.sql` (assinatura antiga da v4)
- Atualizar o homolog `jinlong-homolog-palm` (parou em 20261019170000: sem RPCs do trial, sem `perfis`, sem usuários) para testar migrations antes de produção
- Central de Conversão: botão de anonimizar/excluir dados do lead (direito de exclusão LGPD) e aviso por e-mail ao comercial quando um dono pedir contratação
- Contas a receber: pré-preencher o parcelamento do recebível de crédito a partir de vendas_pagamentos.parcelas (hoje é configuração manual)
- Mostrar as parcelas do crédito no detalhe da venda (admin) e na 2ª via, depois da coluna existir na homologação

## Feito
- 2026-11-05 — Recuperação de senha: causa comprovada em Supabase local (validação nativa bloqueava o envio sem aviso; erro do Supabase exibido em inglês). Correção com testes unitários e E2E em branch; PR Draft pendente
- 2026-11-05 — Diagnóstico somente leitura da recuperação de senha do Hub: Hub sem fluxo de recuperação; recuperação deve ser feita pelo ERP; nada alterado no Supabase
- 2026-11-05 — 12 migrations da main (20261028100000 a 20261104180000) adiadas no manifesto: 8 de segurança (prioridade do dono) e 4 de funcionalidade; nenhuma aplicada em produção
- 2026-11-05 — PR #655: types drift corrigido (`823142b6`, regenerado do artefato do CI); merge com a main (`24ba7082`) e push na branch do PR. Restam os gates de governança (label `deploy-prod:aprovado` e migrations `remote_ausente`)
- 2026-11-05 — Diagnóstico Fase 3 entregue, sem alterar produção: fluxos de escrita mapeados, catálogo de produção lido (A2 mitigada por trigger; `perfis` tem 3 linhas), plano de remediação, roadmap, matriz de testes, plano de backup. Entrada em `docs/FASE3_RELATORIO_EXECUTIVO.md`
- 2026-11-05 — Estabilização da tranche: fixtures de 4 suítes corrigidas (todas passam), provisionamento reescrito para o contrato da 121000 (cadastro autorizado por contingência comprovado), teste de recuperação de acesso (REC-1 a REC-7), validação reproduzível em contêiner (`backend/scripts/tranche-seguranca-validar.sh`)
- 2026-11-05 — Tranche de segurança validada em banco descartável: SEC-04 corrigido (passa), rollbacks de 100000 e 110000 (cadeia idêntica ao baseline), definições de produção conferidas por md5; PR #660 atualizado
- 2026-11-05 — GO-LIVE-01: golden flow operacional executado na cópia `sec_gf01` (roteiro `backend/scripts/go-live-01-golden-flow.test.sql`, 34 asserções OK). Matriz e veredito NO-GO em `docs/qa/GO_LIVE_01_GOLDEN_FLOW.md`; E2E de interface bloqueado
- 2026-11-04 — GO-LIVE-01: gate financeiro 35/35 na cópia `sec_gl01` com a migration `20261104180000` (títulos, caixa e produto fora do escopo respondem como inexistente). Commits locais `7d35133c` (fix) e `b41ca18a` (fixtures). Evidência em `docs/qa/evidencias/go-live-01_gate_financeiro_35_35.txt`
- 2026-11-04 — Rollbacks de `20261028100000` e `20261028101000` escritos em `backend/supabase/rollback/` e testados em transação com ROLLBACK no banco local; rollback de `20261029155000` (em `ops/`) corrigido e testado. Homolog não alterado: aplicação interrompida por drift pré-existente
