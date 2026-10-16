# AUDITORIA CIRÚRGICA — JINLONG / FASTPRODUCT
Data de referência: 2026-10-14
Status: diagnóstico de triagem, NÃO certificação de produção.
Destino: agentes Claude Code e outros agentes de engenharia que inspecionem o repositório.

## Objetivo
Determinar o estado REAL do sistema na branch main, eliminar bloqueadores para piloto presencial e entregar correções mínimas, testadas e rastreáveis. Não confundir PR aberto, teste declarado e deploy realizado. Nunca declarar GO sem evidência.

## Evidência inicial (GitHub consultado em 14/10/2026)
- Repositório: nocodenn-cell/fastproduct; main HEAD observado: 072f130b9c2792e3c5be364771238e7a43fd8177 (12/10/2026). Revalidar HEAD no início.
- PR #539 financeiro: aberto; declaração de typecheck/lint/build OK e 2370 testes passando; teste de integração com JWT inválido reportado como preexistente; validação visual dos quatro fluxos pendente; NO-GO declarado.
- PR #541 estoque: draft; typecheck e cobertura de design system declarados; smoke browser pendente; check ds-burndown falha declarada.
- PR #542 clientes/funcionários: draft; typecheck, lint e 63 testes declarados; smoke e screenshot pendentes; ds-burndown falha declarada.
- PR #543 produtos_custos: draft; proposta de SECURITY INVOKER com função privada; pgTAP/SQL, Advisor e regressão NÃO executados; NO-GO.
- PR #550 tokens de UI: draft; recuperação parcial sem testes finais.
- PR #537 Import Intelligence: draft; depende de migrations não aplicadas em produção; NÃO MERGEAR.
- Main recente inclui auditoria fiscal 2027 apenas documental (#540) e UX-01 (#538).
Todos os estados são fotografia de 14/10, verificar novamente antes de agir.

## Matriz de maturidade provisória (não substituir por percentuais inventados)
- PDV/vendas/caixa/produtos: implementação avançada relatada; smoke físico e periféricos sem certificação atual.
- Estoque, clientes/funcionários, financeiro: consolidação com PRs pendentes.
- Fiscal: integração/homologação ainda requer prova ponta a ponta.
- Auditoria: cobertura transversal completa não comprovada.
- Backup/restore: documentação existe, mas exigir restore comprovado na janela de release; não assumir que o backup anterior serve.
- Import Intelligence: experimental, fora do escopo de estabilização.
Classificação final deve ser reavaliada com código, CI, migrations e ambiente real.

## Especialização obrigatória do agente
Atue como líder técnico com competências combinadas de: arquitetura de software/DDD e modular monolith/hexagonal, Next.js/React/TypeScript, PostgreSQL/Supabase/RLS e segurança, QA Vitest/Playwright/pgTAP, DevOps GitHub Actions/Vercel, engenharia de PDV/ERP/financeiro/estoque/fiscal, UX operacional bilíngue PT/zh, observabilidade e recuperação de desastres. Use subagentes especializados em paralelo APENAS para leitura/auditoria de domínios independentes; um integrador único é responsável por commits, conflitos e gates.

## Procedimento de execução — priorizar menor caminho seguro
1. Inventariar main HEAD, worktrees, branches, PRs, CI e migrations pendentes. Nunca assumir estado de relatórios antigos. Inspecionar instruções locais do projeto, contratos, docs de GO-LIVE, princípios de engenharia e critérios de aceite do cliente.
2. Produzir tabela requisito -> arquivo/fluxo -> teste -> evidência -> status (IMPLEMENTADO, VALIDADO, PARCIAL, AUSENTE, BLOQUEADO). Confrontar documento 'Especificação de Alterações e Melhorias do Sistema' (PDV, preço atacado, produtos, auditoria, estoque, financeiro, fiscal, WhatsApp, permissões, caixa, backup e relatórios). O documento usa Bling como referência, não licença para expandir escopo sem validação.
3. P0: certificar backup E restore isolado; revisar segurança de produtos_custos com testes de roles reais; validar operações críticas de PDV/caixa/estoque/financeiro, idempotência e isolamento entre lojas; verificar schema e deploy. Não executar migrations em produção nem usar credenciais reais sem autorização explícita.
4. Priorizar revisão de #539, #541, #542: rebase seguro, corrigir apenas defeitos comprovados, executar typecheck/lint/testes relevantes/build, CI, smoke visual com dados fictícios em localhost. Verificar falha ds-burndown sem alterar baseline para mascará-la. Fazer merge somente com gates aprovados e autorização aplicável.
5. #543 exige testes SQL por ADMIN, DONO, GERENTE, OPERADOR, anon e acesso entre lojas; validar privilégios EXECUTE, search_path, API exposed schemas e plano de rollback. Não aplicar apenas security_invoker=on sem preservar acesso legítimo.
6. #550 é cosmético: só depois de P0. #537 permanece isolado; não ativar migrations experimentais no piloto.
7. Rodar smoke presencial com operador, leitor, impressora, troco, split payment, sangria, fechamento, venda em espera, cancelamento/devolução, baixa e estoque; documentar quem testou, quando, resultado e evidência.
8. Reexecutar gates após cada mudança relevante. Registrar comandos, exit codes, links de CI, falhas preexistentes versus novas e riscos residuais. Não falsificar teste nem substituir teste não executado por PASS.

## Restrições arquiteturais
- Preservar fonte única de verdade das regras críticas (RPC transacional de venda, precificação, estoque, financeiro e autorização); não duplicar lógica na UI.
- Evitar refatoração ampla, framework novo, novos serviços ou abstrações sem evidência de benefício.
- Isolamento de loja/empresa, RLS, privilégios mínimos e auditoria de mutações são invariantes.
- Nenhum segredo no git. Não usar produção como homologação. Não apagar dados.
- Otimizar tempo: leitura paralela, correções pequenas, testes direcionados primeiro, suite/CI ao final; nunca sacrificar segurança para velocidade.

## Entregáveis exigidos
- docs/auditorias/STATUS-REAL-JINLONG-YYYYMMDD.md com SHA auditado, matriz por módulo, evidências e riscos.
- docs/auditorias/PLANO-CIRURGICO-EXECUCAO.md com P0/P1, dependências, estimativas relativas e responsável.
- Para cada correção: arquivos alterados, causa raiz, testes executados, resultado e rollback.
- Relatório GO/NO-GO explícito: separar código pronto, CI verde, homologação e piloto físico.
- Commits convencionais e atômicos em branch de trabalho; abrir/atualizar PR com evidências. Commit final de documentação e correções APENAS depois de testes; não fazer push direto à main ou merge automático. Se bloqueado, registrar bloqueio e fazer commit somente da auditoria verificada.

## Critério de conclusão
Sem P0 aberto, segurança e restore comprovados, CI obrigatório verde, smoke crítico comprovado, migrações verificadas e autorização de release: NO-GO. Se qualquer evidência faltar, informar exatamente o que falta e não declarar conclusão.