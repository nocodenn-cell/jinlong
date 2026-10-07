# Checklist obrigatório — nova funcionalidade (domínio)

| Campo | Valor |
|--------|--------|
| **Status** | Obrigatório antes de implementar |
| **Governança** | [GOVERNANCA_REGRAS_NEGOCIO.md](./GOVERNANCA_REGRAS_NEGOCIO.md) |
| **Mapa** | [MAPA_DOMINIOS_REGRAS_NEGOCIO.md](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) |

Preencha no PR (seção **Governança de domínio**) ou anexe link para issue/ADR.

Se qualquer resposta for “não sei” / “vamos ver depois”, a feature **não** está pronta para desenvolvimento.

---

## As 13 perguntas

| # | Pergunta | Resposta (preencher) |
|---|----------|----------------------|
| 1 | Qual problema de negócio resolve? | |
| 2 | Qual domínio é responsável? | |
| 3 | Qual é a fonte de verdade? (tabela/RPC/contrato) | |
| 4 | Quem pode criar ou alterar o dado? | |
| 5 | Quem apenas consulta? | |
| 6 | Qual evento provoca a mudança? | |
| 7 | Quais outros domínios são afetados? | |
| 8 | Existe consequência financeira? (se sim: como termina no Financeiro?) | |
| 9 | Existe consequência fiscal? | |
| 10 | Existe consequência em estoque? (se sim: qual RPC/orquestrador?) | |
| 11 | Qual auditoria é obrigatória? (quem/quando/o quê/antes/depois/origem/motivo/aprovação) | |
| 12 | Já existe alguma regra semelhante no Jinlong? (citar doc/ADR/RPC) | |
| 13 | Estamos duplicando informação ou cálculo? (se sim: **PARE**) | |

---

## Gates binários (todos devem ser SIM ou N/A justificado)

| Gate | SIM / N/A |
|------|-----------|
| Um único dono para cada dado crítico tocado | |
| Nenhum UPDATE silencioso em tabela de outro domínio | |
| Consumidores leem o SSoT (não recalculam e persistem como verdade) | |
| Número crítico é explicável (origem + regra + status confirmado/estimado/pendente) | |
| Confrontado com o [mapa de domínios](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) | |
| entity-ssot respeitado (CRUD só nas telas oficiais) | |
| Guards rodados quando aplicável (`guard:domain`, `check:entity-ssot`) | |

---

## Modelo curto para colar no PR

```markdown
### Governança de domínio
- Problema:
- Domínio dono:
- Fonte de verdade:
- Escritores / leitores:
- Evento:
- Domínios afetados:
- Financeiro / Fiscal / Estoque:
- Auditoria:
- Regra semelhante existente:
- Duplicação? Não
- Mapa confrontado: docs/regras-negocio/MAPA_DOMINIOS_REGRAS_NEGOCIO.md
```
