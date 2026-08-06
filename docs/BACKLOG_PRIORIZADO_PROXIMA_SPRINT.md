# BACKLOG PRIORIZADO — Próxima Sprint (Domínio de Descontos)

**Data**: 2026-07-24
**Origem**: fechamento da sprint `claude/auditoria-final-desconto-7o1vy9` (PR #231)
**Regra de priorização**: P0 bloqueia Go-Live · P1 alta prioridade · P2 melhoria importante · P3 evolução futura.

> **Atualização 2026-08-06 — BL-1 saiu da fila: está concluído e verificado em produção.**
>
> Evidência colhida no banco vivo (`jinlong`), não em documento:
> - `finalizar_venda_transacional_canonica_v4` tem **uma única** assinatura (22 args) e seu
>   `pg_get_functiondef` contém `SET usado`, `INSERT descontos_venda` e `motivo_desconto`;
> - `descontos_venda` tem as colunas `operador_id`, `aplicado_em`, `motivo_desconto` e
>   `motivo_descricao_livre`;
> - o app encaminha os parâmetros — `caixaVendas.impl.ts:307-308` passa `p_motivo_desconto`
>   e `p_motivo_descricao`.
>
> Aplicado pela migration `272_reconciliacao_bl1_descontos_token_auditoria_motivo`. O texto
> abaixo fica como registro do escopo original. **A fila real da próxima sprint é a de
> `RELATORIO_CONSOLIDADO_POS_CERTIFICACAO_OPERACIONAL.md` §3**, com os bloqueadores de
> infra/governança em primeiro lugar — hoje encabeçados por **D-6** (14 migrations em
> produção fora do Git) e **D-7** (reconstrução do banco quebrada, com correção já pronta em
> branch), ambos em `AUDITORIA_DRIFT_MIGRATIONS_20260806.md`.

---

## ~~P0~~ — Concluído em 2026-08-06

### ✅ BL-1 — Reconciliação da RPC `finalizar_venda_transacional_canonica_v4`
- **Descrição**: Restaurar o PASSO 5 (consumo de token `usado=true` + `INSERT descontos_venda`) e adicionar auditoria de motivo (ENUM + colunas `operador_id`/`aplicado_em`/`motivo_desconto`/`motivo_descricao_livre`), via migration única contra o estado real do banco. Encaminhar `p_motivo_*` em `caixaVendas.impl.ts`.
- **Impacto**: Fecha 2 P0 (token reutilizável + descontos sem auditoria) e conclui o MVF #2 end-to-end.
- **Estimativa**: 1–1,5 dia (migration + app + testes SQL/integração/E2E).
- **Dependências**: confirmação formal do ambiente-alvo (`jinlong` prod vs staging); snapshot do `pg_get_functiondef` vivo para rollback.
- **Risco**: Alto (função transacional de 330 linhas; assinatura 19→21 args). Mitigado por materialização do corpo vivo + diff linha a linha + DROP do overload de 19 args.
- **Critério de aceite**: `pg_get_functiondef` contém `SET usado` + `INSERT descontos_venda`; reuso de token → `TOKEN_GERENTE_JA_USADO`; linha de auditoria com motivo; `OUTROS` sem descrição rejeitado; regressão verde (split payment + `contas_receber`); E2E de auditoria na timeline. (Detalhe: `docs/BL1_PLANO_RECONCILIACAO_V4.md` §8.)

---

## P1 — Alta prioridade

### BL-2 — MVF #3: Promoções automáticas
- **Descrição**: Estender `calcular_preco_produto` para ler `regras_preco` tipo `PROMOCAO` (PASSO 1, preservando SSOT — `ALTER`, nunca nova RPC); espelhar em `calcularPrecoCanonico.ts` (offline); incluir promoções ativas no `sync-outbox`.
- **Impacto**: Habilita recurso de promoção hoje inexistente; alinha preço Web/Local/Offline.
- **Estimativa**: 2–3 dias (RPC + offline + sync + testes de equivalência).
- **Dependências**: BL-1 concluído (evita duas alterações estruturais simultâneas na mesma janela); confirmação de ambiente.
- **Risco**: Médio-alto — mudança em RPC de preço (SSOT). Mitigado por testes de equivalência online/offline (invariante C4).
- **Critério de aceite**: promoção ativa aplica preço correto no Web e no Local; promoção expirada não aplica; `calcularPrecoCanonico` == RPC para os mesmos inputs; precedência Promo→Tier→Catálogo→Varejo respeitada.

---

## P2 — Melhoria importante

### BL-3 — Restaurar enqueue fiscal rico (metadados de auditoria)
- **Descrição**: Reintroduzir `fiscal_enfileirar_documento_venda` com payload estruturado + `ip_address`/`user_agent`/`device_id`/`terminal_id` (hoje parâmetros mortos na v4).
- **Impacto**: Rastreabilidade fiscal completa; elimina parâmetros mortos na assinatura.
- **Estimativa**: 0,5–1 dia.
- **Dependências**: BL-1 (mesma função; aplicar após a reconciliação de desconto para não misturar domínios).
- **Risco**: Baixo — enqueue é desacoplado (falha não derruba a venda).
- **Critério de aceite**: documento fiscal enfileirado contém os metadados de auditoria; venda permanece consistente mesmo se o enqueue falhar.

### BL-4 — Guard de drift por corpo de função
- **Descrição**: Adicionar ao pipeline checagem de `md5(pg_get_functiondef())` das RPCs críticas contra corpo canônico versionado.
- **Impacto**: Impede regressões silenciosas de corpo (como a do PASSO 5) de passarem despercebidas.
- **Estimativa**: 0,5–1 dia.
- **Dependências**: nenhuma (pode correr em paralelo).
- **Risco**: Baixo.
- **Critério de aceite**: CI falha quando o corpo vivo de uma RPC crítica diverge do canônico versionado.

---

## P3 — Evolução futura

### BL-5 — Guard de limite de item reflete `pdv_config`
- **Descrição**: Fazer o guard do frontend (`aplicarDescontoManual`) ler o limite configurado em vez do fixo 15%.
- **Impacto**: Elimina divergência para lojas com limite < 15%.
- **Estimativa**: 0,5 dia.
- **Dependências**: propagação do config ao store compartilhado.
- **Risco**: Baixo (backend já é autoritativo).
- **Critério de aceite**: guard do frontend usa `pdv_config.max_desconto_manual_item_percentual`; comportamento idêntico Web/Local.

---

## Ordem de execução recomendada

1. **BL-1 (P0)** — primeiro e isolado (fecha Go-Live do domínio).
2. **BL-2 (P1)** — após BL-1.
3. **BL-3 (P2)** — na mesma janela pós-BL-1 (mesma função).
4. **BL-4 (P2)** — paralelo.
5. **BL-5 (P3)** — quando houver folga.

---

**Total estimado P0+P1**: ~3,5–4,5 dias. **Go-Live do domínio de desconto**: desbloqueado ao concluir BL-1 (+BL-2 para promoções completas).
