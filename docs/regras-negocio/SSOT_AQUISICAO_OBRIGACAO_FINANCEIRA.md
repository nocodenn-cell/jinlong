# SSoT — Aquisição → Estoque → Obrigação financeira (SSOT-003)

Status: **política de produto (2026-10-07)**.

## Cadeia

OC → recebimento físico → documento/obrigação reconhecida → AP → liquidação.

## Três vias

| Via | Estoque | Custo | Obrigação / AP |
|-----|---------|-------|----------------|
| OC `receber_ordem_compra` (`ENTRADA_OC`) | sim | não | **não** |
| Remessa (`ENTRADA_REMESSA_*`) | sim | não | **não** |
| NF-e `confirmar_importacao_nfe` | se sem remessa | opcional | **só com duplicatas** |

## Política

- OC/remessa = bem recebido **sem** obrigação (não inventar AP).
- NF-e com valor econômico \(\sum qtd\_conferida \times custo\) > 0 **exige** ≥1 duplicata; senão `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`.
- Com duplicatas → N APs com `nfe_importacao_id`.
- Ponto de reconhecimento da obrigação = confirm NF-e com duplicatas.

## Testes

Confirm sem duplicatas + econ>0 falha; com N duplicatas → N APs; OC/remessa → estoque sem AP.
