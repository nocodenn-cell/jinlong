# Handoff operacional - Claude Code e Codex

> Estado atualizado em 2026-08-23: os riscos de tiers/global e de quantidade
> zero em remessa/recebimento foram corrigidos e provados localmente na branch
> `codex/ap-payments-reconciliation`. Aplicação das migrations e homologação no
> ambiente-alvo continuam pendentes; este registro não é GO.

## Estado real

O repositório possui implementação extensa e testes históricos, mas o D0 ainda não tem prova atual do schema remoto, dos fluxos na máquina da cliente, das reconciliações, do restore ou dos alertas. A especificação original tem 9 páginas e requisitos amplos; as decisões em `DEFINICAO_FUNCIONAL_D0.md` limitam o contrato do piloto.

## Cinco maiores riscos

1. Duas fontes de verdade para o início do atacado: tiers e configuração global.
2. Custo ausente possivelmente convertido em zero, corrompendo margem/CMV.
3. Remessa/recebimento aceitando quantidade zero.
4. Caixa/relatórios sem prova independente das equações D0 e reabertura sem contrato comprovado.
5. Declaração histórica de GO sem provas atuais de schema, restore, alertas e equipamento.

## Bloqueadores confirmados

- `BL-D0-001` a `BL-D0-010` em [BACKLOG_VALIDADO_D0.md](./BACKLOG_VALIDADO_D0.md).
- Itens externos permanecem bloqueados até acesso/autorização; não inventar resultados.

## Decisões que não podem ser reinterpretadas

- Atacado começa no primeiro tier ativo do produto; global é só sugestão.
- Custo é nullable; zero apenas explícito.
- Zero é inválido em remessa/recebimento e válido em contagem física.
- Venda em espera, WhatsApp, multiempresa, inventário formal, CEP automático e Focus real não bloqueiam D0.
- Reabertura é aditiva, só GERENTE/DONO e com motivo.
- Stub fiscal jamais aparenta documento autorizado.
- RPO/RTO 24h/8h são metas provisórias, não SLA.

## Leia primeiro

1. `docs/piloto-d0/DEFINICAO_FUNCIONAL_D0.md`
2. `docs/piloto-d0/DIVERGENCIAS_E_DECISOES.md`
3. `docs/piloto-d0/MATRIZ_RASTREABILIDADE_D0.md`
4. `docs/piloto-d0/BACKLOG_VALIDADO_D0.md`
5. `.cursor/rules/governance.mdc` e `.cursor/rules/security.mdc`
6. ADR-007/008/009/010 em `docs/adr/`

> Antes de modificar código, localize o requisito e a divergência correspondente. Depois da correção, atualize a matriz, o backlog e a evidência. Nenhum item pode ser encerrado apenas por alteração de código.

## Primeira sprint recomendada

1. Provar schema/migrations (`PV-001`) sem alterar banco.
2. Mapear todos os leitores do gatilho global de atacado e todos os pontos que normalizam custo.
3. Escrever testes de falha primeiro para tiers, custo NULL e quantidades zero.
4. Corrigir um boundary por vez, com migration aditiva apenas se necessária e aprovada.
5. Executar `PV-003`, `PV-005` e `PV-006`; atualizar documentos no mesmo PR.

## Comandos seguros de validação

```powershell
git status --short
git diff --check
node scripts/core-rule-guard.mjs
node scripts/pdv-flow-guard.mjs
node scripts/route-guard.mjs
node scripts/rpc-gate-guard.mjs
node scripts/pricing-rpc-guard.mjs
node scripts/migration-sequence-guard.mjs
node scripts/domain-boundary-guard.mjs
```

Use os scripts npm somente quando o runtime estiver íntegro. Registre comando, versão, saída e data. Não substitua falha atual por resultado histórico.

## Ações proibidas

- Não reescrever RPC v4, pricing, caixa ou inventory amplamente.
- Não alterar migration histórica nem fazer squash.
- Não ativar Focus real, WhatsApp ou venda em espera.
- Não criar perfil, relatório ou funcionalidade só porque existe no Bling.
- Não usar `service_role` no cliente.
- Não testar restore destrutivo em produção.
- Não fazer merge/deploy sem autorização.
- Não marcar `COMPROVADO` ou `RESOLVIDO` sem evidência reproduzível.

## Ao terminar cada correção

Atualize matriz → divergência → backlog → prova → changelog. Inclua links para teste e evidência operacional, riscos residuais e rollback. Se a prova não foi executada, use `IMPLEMENTADO_SEM_PROVA`.
