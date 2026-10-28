# Próximos passos

## P0 — Quebrado/travado

- Aplicar em produção (janela manual) a migration 20261023120000 do #628, já na main, seguindo `docs/runbooks/APLICAR_20261023120000_REVOKE_ESTOQUE.md` (pré-checagem, backup, rollback e regressão testados em 2026-10-23)
- Aprovar (ou ajustar) o teste controlado de provisionamento em produção: `docs/runbooks/TESTE_CONTROLADO_PROVISIONAMENTO_PRODUCAO.md`. Homologação não reproduz produção (parou em 20261019170000, sem RPCs do trial). O lado banco já está validado em `backend/scripts/provisionamento-wizard-trial.test.sql`
- Aprovar o merge de #629 (migration validada: segurança, concorrência, rollback)
- #620: CI corrigido (token entre empresas e tipos); revisar e aprovar; após merge, deploy manual das Edge Functions alteradas. #623: decidir o comportamento esperado sem ADMIN nos ~20 testes que ainda criam ADMIN; depois regenerar tipos
- Reconciliar drift de migrations main × produção: em 2026-10-23 toda migration da main a partir de 20261019 está em produção com a mesma versão; restam 20261010120000 (adiada pela governança) e 20261023120000 (aplicação manual pendente). O check `migration-remote-drift` acusa como ausentes versões que existem em produção (ex.: 20261020100000–20261022010000); verificar para qual projeto aponta `SUPABASE_MIGRATION_CHECK_PROJECT_REF`
- Decidir módulos marcados DRAFT já aplicados em produção (comissão #607, import intelligence #601): validar ou esconder do cliente
- Congelar features até o corte do primeiro cliente (só hotfix P0 em produção)

## P1 — Falta para lançar (MVP)

- Ligar leaked password protection no Supabase Auth (a view SECURITY DEFINER foi resolvida pelo #618; advisor confirma em 2026-10-23)
- Aprovar e aplicar #629 (issue #586: vínculo SAÍDA↔ENTRADA de transferência no kardex); fechar a issue só depois da verificação em produção
- Consolidar testes únicos de PRs antigos antes de encerrá-los: pilha #487/#488/#498/#499/#500 (fiscal/financeiro) e experimentos multiempresa #492–#496 (matriz negativa de isolamento)
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

- 2026-10-23 — PDV web: seletor de parcelas do crédito mostra "3x de R$ 33,33 (última R$ 33,34)" em vez de "{n}x" e o cupom mostra "Crédito 3x" (PR pendente de revisão)
- 2026-10-23 — #625 mergeado com autorização (ed3dee81): deploy do pdv-importados READY, banco de produção inalterado, provisionamento de loja/trial deixa de falhar com 42703
- 2026-10-23 — Saneamento do backlog: 43 PRs e 1 issue auditados; #543, #446, #497 encerrados com justificativa; #546, #583 corrigidos; #586 implementada em #629; relatório em `docs/auditorias/SANEAMENTO_BACKLOG_2026-10-23.md`
- 2026-10-23 — #618 e #621 mergeados (migrations já em produção); alerta `security_definer_view` resolvido no advisor
- 2026-10-23 — #621: migration de perfis com guarda para banco novo (Codex P1); #618: mock de rpc nos testes do productReader
- 2026-10-23 — PR #628 mergeado (8bbf5120) sem efeito em produção; revoke de `decrementar_estoque_seguro` para authenticated, diagnóstico alinhado e teste de regressão no CI
- 2026-10-23 — Hub preparado para hub.jinlong.app: domínio no projeto, env de Preview, isolamento e bloqueio de não-admin validados
- 2026-10-23 — Merge dos PRs #529, #624 e #631
- 2026-10-23 — Entrada única "Entrar no Jinlong": admin da plataforma sem loja vai do login do ERP ao painel gerencial (inerte até configurar o hub)
- 2026-10-23 — Site comercial Premium 2.0 implementado e mesclado (#631)
