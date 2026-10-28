# Próximos passos

## P0 — Quebrado/travado

- Aplicar `20261028120000` (revoke dos 4 helpers de tenant, auditoria SECDEF) em produção pelo runbook `docs/runbooks/APLICAR_20261028120000_REVOKE_HELPERS_TENANT.md`; até lá o `migration-remote-drift` falha em todo PR atualizado com a main
- Smoke de venda real após a aplicação de 20261023120000 (#628): pós-checagem de catálogo OK em 2026-10-28, mas nenhuma venda desde 2026-10-16 para provar a baixa de estoque online/offline sob o novo privilégio
- Aprovar (ou ajustar) o teste controlado de provisionamento em produção: `docs/runbooks/TESTE_CONTROLADO_PROVISIONAMENTO_PRODUCAO.md`. Homologação não reproduz produção (parou em 20261019170000, sem RPCs do trial). O lado banco já está validado em `backend/scripts/provisionamento-wizard-trial.test.sql`
- Aprovar o merge de #629 (migration validada: segurança, concorrência, rollback)
- #620: CI corrigido (token entre empresas e tipos); revisar e aprovar; após merge, deploy manual das Edge Functions alteradas. #623: decidir o comportamento esperado sem ADMIN nos ~20 testes que ainda criam ADMIN; depois regenerar tipos
- Decidir módulos marcados DRAFT já aplicados em produção (comissão #607, import intelligence #601): validar ou esconder do cliente
- Congelar features até o corte do primeiro cliente (só hotfix P0 em produção)

## P1 — Falta para lançar (MVP)

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
- Revisar Termos e Privacidade (prometem emissão fiscal; fiscal é stub)
- Provisionar empresa/loja nova para o cliente pelo wizard e validar o isolamento multiempresa (nenhum dado de outra loja visível); não usar o script de limpeza, que apaga dados de todos os tenants
- Registrar restore drill com RTO a partir de um backup novo, tirado após a reconciliação de migrations
- Cobrar o primeiro ciclo manualmente (PIX/boleto)
- Smoke presencial na máquina da loja (docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md)
- Executar docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md
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
- Contas a receber: pré-preencher o parcelamento do recebível de crédito a partir de vendas_pagamentos.parcelas (hoje é configuração manual)
- Mostrar as parcelas do crédito no detalhe da venda (admin) e na 2ª via, depois da coluna existir na homologação

## Feito

- 2026-10-28 — Drift main × produção zerado: `20261022020000` (#625) registrada em produção como no-op (script do #641, SQL idêntico ao arquivo); #641 mergeado (598efcf0): o check respeita `deferred-migrations.json` e aceita duplicatas de pares com git alinhado. `migration-remote-drift` contra produção = HUMAN_GATE (só `20261010120000`, adiada)
- 2026-10-28 — `20261023120000` (#628) aplicada em produção pelo dono (versão real, SQL idêntico ao arquivo por md5); pós-checagem: revogado para authenticated/anon, service_role mantido, diagnóstico ajustado, nenhum `permission denied` nos logs
- 2026-10-28 — `SUPABASE_MIGRATION_CHECK_PROJECT_REF` apontado para produção (o projeto anterior estava pausado); o check é só leitura (`supabase migration list`) e não roda para PRs de fork
- 2026-10-28 — Auditoria SECDEF: 4 helpers que revelavam dados da empresa B foram revogados de authenticated (migration 20261028120000; docs/audits/AUDITORIA_RPC_SECDEF_2026-10-28.md)
- 2026-10-28 — Auditoria INT-01 das 12 integrações: 6 PASSOU, 3 FALHOU, 3 NÃO TESTADA (docs/audits/AUDITORIA_INTEGRACAO_INT01_2026-10-28.md); o "S7" da devolução era falha do teste (caixa_id omitido com 7 caixas abertos), corrigido
- 2026-10-23 — PDV web: seletor de parcelas do crédito mostra "3x de R$ 33,33 (última R$ 33,34)" em vez de "{n}x" e o cupom mostra "Crédito 3x" (PR pendente de revisão)
- 2026-10-23 — #625 mergeado com autorização (ed3dee81): deploy do pdv-importados READY, banco de produção inalterado, provisionamento de loja/trial deixa de falhar com 42703
- 2026-10-23 — Saneamento do backlog: 43 PRs e 1 issue auditados; #543, #446, #497 encerrados com justificativa; #546, #583 corrigidos; #586 implementada em #629; relatório em `docs/auditorias/SANEAMENTO_BACKLOG_2026-10-23.md`
- 2026-10-23 — #618 e #621 mergeados (migrations já em produção); alerta `security_definer_view` resolvido no advisor
- 2026-10-23 — #621: migration de perfis com guarda para banco novo (Codex P1); #618: mock de rpc nos testes do productReader
