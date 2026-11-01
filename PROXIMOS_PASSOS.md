# Próximos passos
## P0 — Quebrado/travado

- VAL-01 (PDV): unidade de medida não chega ao carrinho; produto UN aceita `0,5` no caixa. Incluir `unidade_medida` na busca do PDV e no `ItemCarrinho` (docs/audits/VAL-01_BACKLOG_PRIORIZADO_2026-10-31.md, item 2)
- VAL-01 (valores): `AjusteSaldoModal` (quantidade) e campos `type="number"` do Financeiro (valores em R$) não usam entrada estrita (backlog, itens 3 e 4)

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

- VAL-01 GO/NO-GO: falta E2E crítico em homologação (caixa-venda, caixa-fluxos-criticos, golden flow com `0,500`). Precisa de credenciais de teste de homologação ou autorização para criar usuário de teste dedicado
- VAL-01 RPC: aplicar `20261031120000_criar_produto_valida_entrada_numerica.sql` em homologação só depois de alinhar o repositório com 4 migrations de 2026-10-30 que existem em homologação e não no repo
- VAL-01 i18n: revisão nativa das mensagens ZH novas (`entrada_*` e `caixa.qtd_formato_invalido`) antes de declarar a localização validada
- VAL-01 decisões: teto de negócio para estoque e quantidade (hoje só técnico); regra de percentual de comissão por tipo (backlog, item 8); precisão do custo (IM-F01, 2 casas hoje)
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
- GROWTH-001: revisar e aprovar o PR da Central de Conversão; com autorização, aplicar a migration 20261023130000 e só depois publicar o hub (deploy do ERP deixa o autoatendimento de assinatura desligado)
- Aplicar na homologação (jinlong-homolog-palm) a migration 20261021120000_vendas_pagamentos_parcelas_credito (coluna vendas_pagamentos.parcelas) antes de exibir parcelas no detalhe admin e na 2ª via do cupom

## P2 — Melhoria

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

- 2026-10-31 — VAL-01 checkpoint local `628929e4` (VAL-01A parcial, sprint ainda incompleta); RPC de criação validada em transação de homologação com ROLLBACK (`20261031120000`, não aplicada); PDV: `0,5` não remove mais o item (causa: input type=number confirmando cada tecla)
- 2026-10-31 — VAL-01A: cadastro de produto rejeita letras, `10.50`, negativos e decimais em quantidade (sem strip silencioso); validador de domínio com teto e 2 casas. Testes shared-core e pdv-importados passam; E2E não executado
- 2026-10-29 — Auditoria do Bloco de Importação (NF-e de entrada e pipeline internacional): 45% por critério explícito, 0 funcionalidades comprovadas, recomendação NO-GO. Relatório em `docs/audits/AUDITORIA_BLOCO_IMPORTACAO_2026-10-29.md`; sem alteração de código
- 2026-10-29 — S1 validada em homologação (`yvdilcmxyjafnnsfdtam`): matriz de permissões final, testes do DONO, ciclos de rollback do S1b, S1c, G14 e S1; PR #648 aberto com o pacote (S1, S1c, S1b, G14), CI verde exceto o guard de governança. Não aplicado em produção
- 2026-10-29 — Decisões D1–D14 registradas em `docs/regras-negocio/DECISOES_JINLONG_S1.md`
- 2026-10-29 — NF-e de entrada com valor e sem duplicatas: mensagem operacional para `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`, aviso na prévia e confirmação bloqueada na conferência (`notaObrigacao.ts`); sem alteração de migration/RPC. Não deployado
- 2026-10-29 — `20261028120000` aplicada em produção (revoke dos 4 helpers de tenant): drill em main com success (backup 40776152513, checksum OK, contagens validadas); pré-checagem true/true/true; pós-checagem revogados e service_role_ok, md5 2fc3a718…; sem `permission denied` nos logs; drift do #630 verde
- 2026-10-28 — Drift main × produção zerado: `20261022020000` (#625) registrada em produção como no-op (script do #641, SQL idêntico ao arquivo); #641 mergeado (598efcf0): o check respeita `deferred-migrations.json` e aceita duplicatas de pares com git alinhado. `migration-remote-drift` contra produção = HUMAN_GATE (só `20261010120000`, adiada)
- 2026-10-28 — `20261023120000` (#628) aplicada em produção pelo dono (versão real, SQL idêntico ao arquivo por md5); pós-checagem: revogado para authenticated/anon, service_role mantido, diagnóstico ajustado, nenhum `permission denied` nos logs
- 2026-10-28 — `SUPABASE_MIGRATION_CHECK_PROJECT_REF` apontado para produção (o projeto anterior estava pausado); o check é só leitura (`supabase migration list`) e não roda para PRs de fork
