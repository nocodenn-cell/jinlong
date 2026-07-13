---
name: engineering-loop
description: >-
  Autonomous Engineering Loop for continuous production stabilization via small,
  single-mission cycles (diagnose → one mission → plan → implement → validate →
  audit → commit → push → wait for GitHub Actions + Vercel Ready → next cycle).
  Use whenever the user mentions Engineering Loop, engenheiro autônomo, ciclo
  contínuo, estabilizar produção, produção estável, operar em loop, continuous
  engineering, or asks to keep shipping until CI/Vercel are green without waiting
  for intervention between tasks. Prefer this skill over ad-hoc fixes when the
  goal is sustained stabilization of the FastProduct monorepo.
---

# Engineering Loop

Operate as an Autonomous Software Engineer. Lead the project to stable production through small, fully autonomous cycles. Complete one full cycle before starting the next.

Monorepo context: read [references/monorepo.md](references/monorepo.md) at the start of each cycle.

## Objetivo

Levar o projeto até um estado de produção estável através de pequenos ciclos totalmente autônomos.

## Sequência obrigatória de cada ciclo

Cada ciclo deve seguir exatamente esta sequência:

1. Analisar o estado atual do repositório.
2. Identificar a maior prioridade técnica existente.
3. Escolher apenas uma missão.
4. Elaborar um plano de execução.
5. Implementar.
6. Executar validações locais.
7. Corrigir falhas encontradas.
8. Fazer auditoria da própria implementação.
9. Executar novamente os testes.
10. Fazer commit utilizando Conventional Commits.
11. Fazer push da branch.
12. Aguardar todos os GitHub Actions concluírem.
13. Aguardar o deploy da Vercel ficar Ready.
14. Somente após tudo verde iniciar o próximo ciclo.

## Regras obrigatórias

- Nunca trabalhar diretamente na main.
- Criar automaticamente uma branch para cada missão.
- Nunca iniciar um novo ciclo se existir CI falhando.
- Nunca acumular mais de uma missão por PR.
- Preferir mudanças pequenas e reversíveis.
- Sempre reduzir dívida técnica quando ela bloquear a evolução.
- Atualizar documentação sempre que alterar arquitetura ou comportamento.
- Nunca ignorar erros de build, lint, testes ou typecheck.

## Critérios de conclusão do ciclo

Um ciclo só termina quando:

- build verde
- typecheck verde
- lint verde
- testes verdes
- migrations validadas
- GitHub Actions verdes
- Vercel Ready
- branch limpa

Caso contrário, o ciclo continua até estabilizar.

## Priorização permanente

A ordem de prioridade deve ser sempre:

1. **P0** Produção quebrada
2. **P1** Bugs funcionais
3. **P2** Integridade dos dados
4. **P3** Arquitetura
5. **P4** UX e melhorias

Nunca trabalhar em P3 ou P4 enquanto existir P0, P1 ou P2.

## Descoberta (passo 1)

Antes de escolher a missão, inspecione:

- `git status`, branch atual, remote sync (`fetch`/`pull` na base)
- conflitos, working tree suja
- GitHub Actions (runs recentes na branch/base)
- Vercel (último deploy Ready/Error)
- lint, typecheck, testes, smoke, Playwright
- migrations, dependências
- TODOs/FIXME só se bloquearem P0–P2
- documentação desatualizada se houver mudança de comportamento

Produza um diagnóstico curto e escolha a maior prioridade. Para diagnósticos estruturados com várias falhas/métricas, use um canvas no diretório de canvases do workspace.

## Planejar (passo 4)

Antes de modificar qualquer arquivo, registre:

- problema
- causa
- impacto
- plano curto
- critérios de aceite
- riscos

## Implementar (passos 5–9)

- Implemente apenas o necessário para a missão única.
- Valide localmente o que for aplicável ao módulo tocado (`lint`, `typecheck`, `test`, `build`, migrations, smoke).
- Corrija falhas encontradas antes de auditar.
- Audite: bugs, regressões, código morto introduzido, duplicação, segurança, migrations perigosas.
- Rode os testes de novo após a auditoria.

## Git (passos 10–11)

- Branch por missão: `loop/<ciclo>-<slug-curto>` ou `fix|chore|ci/<slug>` a partir de `origin/main` atualizado.
- Conventional Commits; mensagem foca no *porquê*.
- Commit e push só com validações locais verdes.
- Nunca force push; nunca `--no-verify`.

## CI e Vercel (passos 12–13)

- Após o push, monitore todos os workflows relevantes até conclusão.
- Se qualquer job falhar: investigar → corrigir → novo commit → push → aguardar de novo.
- Monitore Vercel até Ready; se falhar, leia logs, corrija, commit, push, repita.
- Não inicie o próximo ciclo com CI vermelho (na branch da missão ou na base, conforme o bloqueio).

## Autoavaliação (passo 14)

Antes de encerrar cada ciclo, produzir um relatório contendo:

- problema encontrado
- causa raiz
- solução aplicada
- riscos
- cobertura de testes
- impacto
- próximos candidatos ao ciclo seguinte

O próximo ciclo deve começar automaticamente utilizando esse relatório.

## Restrições adicionais

- Não alterar migrations já aplicadas.
- Não remover funcionalidades sem justificativa explícita no plano.
- Não fazer refatorações grandes sem benefício mensurável para a missão.
- Não iniciar nova missão enquanto a atual estiver incompleta.
- Limitar mudanças ao módulo necessário (`pdv-importados`, `pdv-local`, `backend`).

## Gate humano (bloqueios de infraestrutura)

Se a maior prioridade for um bloqueio que o agente não pode corrigir no repositório — por exemplo:

- GitHub Actions: pagamento falhou / spending limit
- Secrets CI ausentes ou inválidos (sem permissão para criar)
- Acesso Vercel/Supabase sem credenciais
- Confirmação explícita do dono do produto

então:

1. Declare a missão como **bloqueada (human gate)**.
2. Produza o relatório de autoavaliação com a ação exata pedida ao humano.
3. Não finja CI verde; não inicie missão P3/P4 “enquanto espera”.
4. Pode preparar branch + commit local da documentação/skill, mas **não** encerrar o ciclo como sucesso até o bloqueio ser removido e a revalidação (Actions + Vercel) passar.
5. Assim que o humano confirmar o desbloqueio, retome o mesmo ciclo (revalidar CI) antes de escolher nova missão.

## Critério de decisão

Sempre escolha a atividade que produz o maior ganho de estabilidade, confiabilidade ou valor para o produto. Em dúvida, escolha a que reduz mais risco para produção. Evite otimizações prematuras e trabalho de baixo impacto. O objetivo não é produzir mais commits; é aproximar continuamente o projeto de produção estável, segura e sustentável.
