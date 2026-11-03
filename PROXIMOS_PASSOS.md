# Próximos passos

## P0 — Quebrado/travado

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

## P1 — Falta para lançar (MVP)

- Import Intelligence: `import_registrar_apuracao` não é idempotente, e reenvio com o mesmo `entrada_sha256` cria versão nova com o mesmo conteúdo. Corrigir antes de qualquer publicação (`docs/import-intelligence/22-AUDITORIA-IM-ETAPAS-1-4-2026-11-02.md`, D-04)
- Import Intelligence: `import_despesas` não tem unicidade por documento de origem. Com o parser lendo `vFrete` (S1b), o frete pode entrar duas vezes (D-05)
- Import Intelligence: `import_aprovar_apuracao` aceita `recalculo_confere` informado pelo chamador. O recálculo tem de ser confirmado no servidor antes da aprovação (D-06)
- Import Intelligence: catálogos tributários "demo" e "pesquisado" estão embutidos em `shared-core/src/import/tributacao.ts`. Remover e carregar só alíquotas validadas por vigência (D-09)
- Import Intelligence: `import_cambios` aceita uma taxa por moeda por operação. Trocar por taxa com fonte, data e fatura, e registrar diferença cambial (D-08). PTAX (BCB, OData, gratuito) entra depois, por consulta server-side
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
- Rodar as suítes de psql (ap-payments, ar-receipts, sale-totals, financeiro-hardening, financial-adversarial, ux04, funcionario-dados-rls) num banco de homologação migrado, via npm run test:financial
- Alinhar o Supabase local (supabase_db_fastproduct tem 412 de 439 migrations) antes de rodar testes contra ele
- Criar teste de reposição de estoque no cancelamento e teste ponta a ponta de auditoria (autor, data, alteração)
- Definir preço real em saas.planos (hoje placeholder) e contrato de piloto sem NFC-e/SLA
- Revisar Termos e Privacidade (prometem emissão fiscal; fiscal é stub) e incluir o uso do contato do teste grátis pelo comercial (LGPD)
- Provisionar empresa/loja nova para o cliente pelo wizard e validar o isolamento multiempresa (nenhum dado de outra loja visível); não usar o script de limpeza, que apaga dados de todos os tenants
- Registrar restore drill com RTO a partir de um backup novo, tirado após a reconciliação de migrations
- Cobrar o primeiro ciclo manualmente (PIX/boleto)
- Smoke presencial na máquina da loja (docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md)
- Executar docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md
- GROWTH-001: revisar e aprovar o PR da Central de Conversão; com autorização, aplicar a migration 20261023130000 (restaurada em 2026-11-01; #629 está em 20261029155000) e só depois publicar o hub (deploy do ERP deixa o autoatendimento de assinatura desligado)
- Aplicar na homologação (jinlong-homolog-palm) a migration 20261021120000_vendas_pagamentos_parcelas_credito (coluna vendas_pagamentos.parcelas) antes de exibir parcelas no detalhe admin e na 2ª via do cupom

## P2 — Melhoria

- `docs/import-intelligence/fixtures/referencia/landed-cost-referencia.mjs` compara texto byte a byte e falha 0/21 em Windows com `core.autocrlf=true`. Normalizar `\r\n` dentro do script (D-07)
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

- 2026-11-02 — Auditoria somente leitura do módulo de importação (Etapas 1–4 e complemento de reaproveitamento): matriz EXISTE/PARCIAL/AUSENTE/DEFEITO, benchmark, matriz REUTILIZAR/ESTENDER/CRIAR/DESCARTAR e sprints. Relatório em `docs/import-intelligence/22-AUDITORIA-IM-ETAPAS-1-4-2026-11-02.md`; sem alteração de código, migration ou dependência
- 2026-11-01 — Consolidação NF-e: #654 integrada à #653 por merge (`0176677f`), Growth-001 restaurada em `20261023130000` (`dfdf9e41`), cinco testes SQL da PR-A adotados (`0a00201d`) e scripts de concorrência movidos para `backend/scripts/backlog-redesign/` (`99dbcaea`). Registro em `docs/audits/CONSOLIDACAO_NFE_2026-11-01.md`; não mergeado
- 2026-10-30 — Validação em homologação (`jinlong-homolog-palm`, rollback): confirmação, repetição e reimportação passaram; conciliação de duplicatas e AP sem UNIQUE reproduzidos como defeito. Os 13 scripts `.test.sql`/`.mjs` de NF-e não executam no esquema atual (sem `empresa_id`). Relatório em `docs/audits/VALIDACAO_TESTES_NFE_HOMOLOG_2026-10-30.md`
- 2026-10-30 — Auditoria de capacidades do ciclo de custos (16 etapas, somente leitura): nenhuma capacidade VALIDADA; motor de custo, rateio e precificação existem em `shared-core` sem ligação ao caminho NF-e; kardex sem valor. Relatório e backlog em `docs/audits/AUDITORIA_CUSTOS_RENTABILIDADE_2026-10-30.md`; sem alteração de código
- 2026-10-30 — Conflito do PR #623 com a main resolvido em `assinatura/actions.ts` (DONO-only + flag GROWTH-001 preservados; testes e typecheck ok)
- 2026-10-29 — Auditoria do Bloco de Importação (NF-e de entrada e pipeline internacional): 45% por critério explícito, 0 funcionalidades comprovadas, recomendação NO-GO. Relatório em `docs/audits/AUDITORIA_BLOCO_IMPORTACAO_2026-10-29.md`; sem alteração de código
- 2026-10-29 — S1 validada em homologação (`yvdilcmxyjafnnsfdtam`): matriz de permissões final, testes do DONO, ciclos de rollback do S1b, S1c, G14 e S1; PR #648 aberto com o pacote (S1, S1c, S1b, G14), CI verde exceto o guard de governança. Não aplicado em produção
- 2026-10-29 — Decisões D1–D14 registradas em `docs/regras-negocio/DECISOES_JINLONG_S1.md`
- 2026-10-29 — NF-e de entrada com valor e sem duplicatas: mensagem operacional para `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`, aviso na prévia e confirmação bloqueada na conferência (`notaObrigacao.ts`); sem alteração de migration/RPC. Não deployado
- 2026-10-29 — `20261028120000` aplicada em produção (revoke dos 4 helpers de tenant): drill em main com success (backup 40776152513, checksum OK, contagens validadas); pré-checagem true/true/true; pós-checagem revogados e service_role_ok, md5 2fc3a718…; sem `permission denied` nos logs; drift do #630 verde
- 2026-10-28 — Drift main × produção zerado: `20261022020000` (#625) registrada em produção como no-op (script do #641, SQL idêntico ao arquivo); #641 mergeado (598efcf0): o check respeita `deferred-migrations.json` e aceita duplicatas de pares com git alinhado. `migration-remote-drift` contra produção = HUMAN_GATE (só `20261010120000`, adiada)
