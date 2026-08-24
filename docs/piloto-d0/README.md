# Piloto D0 — fonte canônica

Esta pasta registra a definição funcional, divergências, backlog e provas do
piloto D0. A implementação desta candidata parte de `main` no SHA
`ede1f459785f79ced4df0cd9a97a6ccdd3e26220` e preserva o gate financeiro, o
seed e as migrations históricas canônicas dessa base.

## Estado

- pricing por tiers e remessa positiva: corrigidos e validados localmente;
- homologação e aplicação remota: não executadas;
- 27 produtos legados sem tier ativo: bloqueio de rollout, pendente validação
  comercial;
- lint do PDV local: não executável por limitação preexistente, sujeito aos
  controles compensatórios documentados no preflight;
- typecheck do `shared-core`: bloqueado por dois mocks financeiros já
  incompatíveis na `main`; os demais três alvos passaram;
- GO do piloto: não autorizado.

O runbook financeiro histórico foi deliberadamente omitido por conter
procedimentos de rollback vinculados a um estado antigo do schema.

## Ordem de leitura

1. [DEFINICAO_FUNCIONAL_D0.md](./DEFINICAO_FUNCIONAL_D0.md)
2. [DIVERGENCIAS_E_DECISOES.md](./DIVERGENCIAS_E_DECISOES.md)
3. [MATRIZ_RASTREABILIDADE_D0.md](./MATRIZ_RASTREABILIDADE_D0.md)
4. [BACKLOG_VALIDADO_D0.md](./BACKLOG_VALIDADO_D0.md)
5. [PLANO_DE_PROVAS_D0.md](./PLANO_DE_PROVAS_D0.md)
6. [PREFLIGHT_ROLLOUT_PRICING_D0.md](./PREFLIGHT_ROLLOUT_PRICING_D0.md)
7. [CHANGELOG_AUDITORIA.md](./CHANGELOG_AUDITORIA.md)

## Vocabulário de estado

- **Corrigido:** código ou migration aditiva preparada na candidata.
- **Validado localmente:** prova reproduzida no ambiente local e registrada.
- **Homologado:** prova executada no ambiente de homologação autorizado.
- **Aplicado remotamente:** migration ou deploy efetivamente executado no alvo.

Um estado não implica o seguinte. Em particular, validação local não equivale
a homologação, aplicação remota ou autorização de GO.
