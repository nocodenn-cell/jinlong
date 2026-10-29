# S2 — Identidade de recebimento e dupla creditação (desenho)

| Campo | Valor |
|---|---|
| Status | **Desenho para aprovação. Nenhuma migration escrita.** |
| Decisões | D12 (recebimento físico é a origem do crédito; NF-e posterior é vinculada sem novo crédito), D3, D14 |
| Evidência | Reprodução em homologação `yvdilcmxyjafnnsfdtam` (fixture `FX-S1`/`FX-S2`) |

## 1. Problema comprovado

**Caso reproduzido (2026-10-29):**
- OC `…b2` (loja B), item de 5 unidades do produto `…f2`. Recebimento físico pela OC: 3 unidades (`ENTRADA_OC`, somadas em `quantidade_recebida = 3`). Estoque da B: +3 por essas entradas.
- NF-e `…b9` vinculada à mesma OC (`importacoes_nfe.ordem_compra_id`), com 2 unidades conferidas do mesmo produto, sem remessa.
- `confirmar_importacao_nfe` pelo GERENTE multi-loja: **creditou +2 no estoque** (`ENTRADA_NFE`) e **abateu +2 do saldo da OC**, que passou para `RECEBIDA`.
- Resultado: 5 unidades creditadas no estoque para 3 unidades fisicamente recebidas pela OC. Ou seja, **2 unidades entraram sem recebimento físico**. Isso contraria o D12.

**Causa no código:** `internal.confirmar_importacao_nfe` credita o estoque integralmente sempre que não há remessa vinculada (`v_remessa IS NULL`), e abate o saldo da OC com a mesma quantidade, sem olhar o que a OC já recebeu fisicamente pelo item.

## 2. Mapa dos caminhos de crédito (estado atual)

| Caminho | Quando credita | Movimento | Abate saldo da OC | Idempotência | Situação |
|---|---|---|---|---|---|
| `receber_ordem_compra` | Sempre (entrada física pela OC) | `ENTRADA_OC` | Sim (`_oc_creditar_item`) | Chave por OC + item (`ordens_compra_recebimentos`) | OK |
| `criar_confirmar_remessa_entrada` | Sempre (entrada sem NF pela remessa) | `ENTRADA_REMessa_LOJA` | Sim, se `p_ordem_compra_id` | `(loja, idempotency_key)` + hash | OK |
| `confirmar_importacao_nfe` com remessa vinculada | Nunca (remessa já creditou) | — | Não | Status `EM_CONFERENCIA → CONCLUIDA` | OK |
| `confirmar_importacao_nfe` sem remessa, sem OC | Sempre | `ENTRADA_NFE` | Não | Status | OK (NF-e como entrada) |
| `confirmar_importacao_nfe` sem remessa, **com OC** | Sempre, **mesmo com recebimento físico do item** | `ENTRADA_NFE` | Sim, pela quantidade conferida | Status | **GAP: dupla creditação** |

## 3. Regra proposta (D12 aplicado)

Para cada item de NF-e conferida:

```
recebido_fisico(oc, item) = soma(ordens_compra_recebimentos.quantidade
                                  where ordem_id = oc and ordem_item_id = item.oc_item
                                    and origem in ('ORDEM_COMPRA', 'REMESSA'))
credito_nfe    = max(0, quantidade_conferida − recebido_fisico)     -- só se houver OC vinculada
abate_oc       = credito_nfe                                        -- abate só o que foi creditado
```

- Sem OC vinculada, o comportamento atual permanece (NF-e é entrada e credita integralmente).
- Com OC vinculada e sem recebimento físico do item, o crédito é integral (comportamento atual preservado).
- Com recebimento físico igual ou maior que o conferido, **nenhum crédito e nenhum abate**. A NF-e continua gerando a obrigação (AP) pelas duplicatas, sem duplicar o estoque.
- A parte da NF-e que excede o recebimento físico é creditada e abatida (ex.: conferido 5, recebido fisicamente 3 → credita 2).

**Importante:** a regra usa o razão `ordens_compra_recebimentos` que já existe. Não é preciso tabela nova para o caso OC. Para remessa, o vínculo já impede o crédito da NF-e.

## 4. Identidade canônica (escopo S2 completo)

- **Documento de entrada:** NF-e identificada por `chave_acesso` (já existe em `importacoes_nfe`). **Verificar** se há UNIQUE; se não houver, incluir na migration.
- **Item:** `importacoes_nfe_itens` ligado ao item da OC (`ordens_compra_itens`) quando houver vínculo. Hoje o vínculo é por produto, não por item. Proposta: manter a chave por produto com a restrição de a quantidade do item da OC ser a fonte do saldo.
- **Dupla creditação entre origens:** a regra acima cobre o caso OC ↔ NF-e. O caso remessa ↔ NF-e já é coberto pelo vínculo `entrada_documentos`. O caso OC ↔ remessa ↔ NF-e para o mesmo item é tratado pelo mesmo somatório (remessa é recebimento físico).

## 5. Testes de regressão (antes da migration)

| # | Cenário | Esperado |
|---|---|---|
| T1 | NF-e sem OC e sem remessa | Crédito integral (regressão) |
| T2 | NF-e com OC, item sem recebimento físico | Crédito integral e abate da OC (regressão UX-04) |
| T3 | NF-e com OC, recebimento físico parcial (caso reproduzido: 3 recebidos, 2 conferidos) | **Crédito zero e abate zero** |
| T4 | NF-e com OC, recebimento físico parcial, conferido maior (ex.: 3 recebidos, 5 conferidos) | Credita 2 e abate 2 |
| T5 | NF-e com remessa vinculada | Sem crédito (regressão do vínculo) |
| T6 | Mesma `chave_acesso` confirmada duas vezes | Uma confirmação (status) |
| T7 | Recebimento OC com mesma chave de idempotência | Uma entrada |
| T8 | Duas confirmações simultâneas da mesma NF-e | Uma sucesso, uma erro |
| T9 | Duplicatas com AP | AP criada uma vez por duplicata (regressão SSOT-003) |
| T10 | Perfil GERENTE de outra loja confirma NF-e | Negado (regressão S1) |

Os testes T1, T2, T5, T9 e T10 já têm equivalente na fixture. T3 é o caso reproduzido. T4 e T6 a T8 exigem fixture nova.

## 6. Riscos e pontos em aberto

- **Mudança de comportamento:** NF-e com OC e recebimento físico passa a creditar menos. Casos legados (já confirmados em produção) **não são corrigidos**. Só as novas confirmações mudam.
- **Produção hoje:** 6 importações de NF-e e 1 OC (sem recebimentos). Não há caso legado ativo de dupla creditação conhecido. **Confirmar** antes da migration com consulta de leitura (NF-es vinculadas a OC com recebimento físico).
- **Interpretação a validar:** a regra assume que o recebimento físico e a NF-e referem-se às mesmas unidades. Se a NF-e traz unidades adicionais, o excedente é creditado (T4). Validar com a operação.
- **Decisão pendente:** o abate do saldo da OC pela NF-e deve ocorrer quando o crédito for zero? Proposta: não (T3).

## 7. Próximos passos

1. Aprovar este desenho e a interpretação do item 6.
2. Consulta de leitura em produção: NF-es vinculadas a OC com recebimento físico do mesmo item.
3. Escrever a migration em `backend/supabase/migrations/` alterando `internal.confirmar_importacao_nfe` (crédito e abate pelo excedente) e, se confirmada a chave, a UNIQUE de `chave_acesso`.
4. Testes T1 a T10 em homologação; rollback com o corpo atual (md5 do corpo de referência).
5. Plano de aplicação em produção nos moldes do plano da S1.
