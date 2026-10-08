# P1-03 — Matriz comercial: NF-e de entrada × obrigação financeira

**Status:** especificação para aprovação · migration `20261007163100` = **PROIBIDA** até decisão explícita.  
**Sem dados reais.** Evidência de código: `confirmar_importacao_nfe` + validação UI.

## Comportamento atual (remoto sem `163100`)

| Cenário | Estoque | Contas a pagar | Observação |
|---|---|---|---|
| OC / remessa | Sobe | Não nasce | Por desenho SSOT |
| NF-e XML com duplicatas no import | Sobe no confirm | N APs | Loop duplicatas |
| NF-e XML **sem** duplicatas, valor econômico > 0 | Sobe | **AP=0** | Zona cinzenta |
| NF-e manual UI | Exige parcelas no schema | AP no confirm | Mais restrito que XML |

## Matriz de regras propostas (para o dono decidir)

| # | Situação comercial | Estoque no confirm NF-e? | Deve nascer AP? | Tratamento recomendado |
|---|---|---|---|---|
| R1 | Compra a prazo (parcelas no XML ou lançadas) | Sim | Sim (N parcelas) | Confirm com ≥1 duplicata |
| R2 | Compra à vista **já paga** | Sim | Sim (1 parcela quitada) **ou** AP + liquidação imediata | Evitar “estoque sem título”; preferir 1 duplicata + baixa no financeiro |
| R3 | Compra antecipadamente paga (adiantamento) | Sim | Sim (título) + compensação | Não confundir com “sem duplicata” |
| R4 | Bonificação / remessa sem obrigação | Preferir **remessa/OC**, não NF-e econômica | Não | Via física sem AP |
| R5 | NF-e com valor > 0 e zero duplicatas no XML | **?** | **?** | Opção A: bloquear (`163100`). Opção B: permitir + alerta gerencial. Opção C: forçar 1 parcela default |

## Impacto da migration `20261007163100`

Se aplicada: R5 com \(\sum qtd \times custo > 0\) e 0 duplicatas → `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA` (confirm aborta). Valor econômico 0 continua permitido.

## Decisões comerciais pendentes (preencher)

1. R5 → A / B / C ? ________  
2. R2 à vista: exige parcela explícita na UI de import XML? ________  
3. Relatório de NF-e históricas sem AP (somente leitura)? ________  

**Até preencher:** `163100` permanece **NO-GO** apply.

### Decisão técnica P0 (2026-10-08) — não substitui R5

Veredito de engenharia: **MANTER BLOQUEADA** (`P0_DESBLOQUEIO_OPERACIONAL_RECONCILIACAO.md`).  
Não APLICAR só para CI. Escopo = NF-e entrada/AP; sem efeito em vendas/AR/NFC-e saída.
