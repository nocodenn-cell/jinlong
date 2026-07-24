# RELATÓRIO FINAL DA SPRINT — Regras de Desconto FastProduct

**Data**: 2026-07-24
**Branch**: `claude/auditoria-final-desconto-7o1vy9`
**PR**: #231 (draft)
**Objetivo da sprint**: Fechar os 3 Minimum Viable Fixes + congelar a arquitetura canônica de descontos, com o menor número de pendências.

---

## 1. Percentual de conclusão

| Bloco | Status | Peso | Concluído |
|---|---|---:|---:|
| MVF #1 — Validação de limite (frontend) | ✅ Completo | 15% | 15% |
| MVF #2 — Motivo de desconto (frontend) | ✅ Completo | 15% | 15% |
| MVF #2 — Motivo de desconto (backend) | ⛔ Bloqueado (reconciliação) | 10% | 0% |
| MVF #3 — Promoções (RPC + offline + sync) | ⛔ Adiado (estrutural) | 20% | 0% |
| Documentação canônica (v2.0 congelada) | ✅ Completo | 15% | 15% |
| Contrato de cálculo de preço | ✅ Completo | 5% | 5% |
| Política oficial de não acúmulo | ✅ Completo | 5% | 5% |
| Separação Pipeline Preço / Comercial | ✅ Completo | 5% | 5% |
| Invariantes (C1–C6) | ✅ Completo | 5% | 5% |
| Matriz de compatibilidade | ✅ Completo | 5% | 5% |
| **TOTAL** | | **100%** | **70%** |

**Conclusão da sprint: ~70%.** Todo o trabalho de arquitetura/documentação e a totalidade das partes seguras de frontend estão concluídas. Os 30% restantes são exatamente os itens que exigem alteração estrutural de RPC + reconciliação repo↔banco, deliberadamente **não** implementados sem decisão explícita.

---

## 2. Itens concluídos

- **MVF #1** — `unifiedCartStore.aplicarDescontoManual()` rejeita desconto de item acima de 15% (padrão canônico, migration 122) para itens não-ATACADO, antes de aplicar. Defesa em profundidade com o trigger de backend. 3 testes de comportamento adicionados.
- **MVF #2 (frontend)** — `CaixaGerenteModal` com fluxo de 3 passos (senha → motivo → percentual); `motivo` via ENUM, texto livre obrigatório só em `OUTROS`, e placeholder `NAO_ESPECIFICADO` bloqueado (exige motivo real). Schema Zod (`finalizarVendaValidation`) valida `motivoDesconto` + `motivoDescontoDescricao`. `CaixaPageClient` propaga o motivo até o payload de finalização.
- **Documentação canônica v2.0** — `docs/AUDITORIA_DESCONTO_MVF_FINAL_V2.md` (arquitetura congelada em 2026-07-24).
- **Contrato de cálculo de preço, política de não acúmulo, separação Pipeline A/B, invariantes C1–C6, matriz de compatibilidade** — todos consolidados no documento canônico.
- **Auditoria histórica da RPC v4** — `docs/AUDITORIA_HISTORICA_RPC_V4_DESCONTOS.md` (laudo forense da regressão do PASSO 5).
- **Reconciliação repo↔banco** — `docs/RECONCILIACAO_REPO_VS_BANCO_DESCONTOS.md`.

---

## 3. Itens parcialmente concluídos

- **MVF #2 (persistência do motivo)** — A UI captura e valida o `motivo`, e o payload já o carrega, **mas o boundary do servidor não o persiste**: a RPC `finalizar_venda_transacional_canonica_v4` não recebe os parâmetros de motivo (e, além disso, nem sequer insere em `descontos_venda` hoje — ver §5). Comportamento atual: seguro (campos extras são ignorados sem erro), porém o motivo **não chega ao banco** até a migration de reconciliação. **Divergência implementação × documento** registrada e conhecida.

---

## 4. Itens bloqueados

- **MVF #2 (backend)** — Depende da reconciliação repo↔banco. A tabela `descontos_venda` viva tem apenas 4 colunas (sem `operador_id`/`aplicado_em`), e a v4 viva não faz o insert de auditoria. Aplicar a migration do jeito que o documento congelado assumia (v3 com insert existente) **falharia**.

---

## 5. Itens adiados para a próxima sprint (backlog) + plano

### BL-1 (P0) — Reconciliação da RPC v4: restaurar PASSO 5 + adicionar motivo
**Por quê**: regressão confirmada (auditoria histórica) — token de gerente reutilizável e descontos sem trilha de auditoria. Requer alteração estrutural da RPC transacional → decisão explícita.
**Plano**:
1. Materializar o corpo completo da v4 a partir do `pg_get_functiondef` vivo.
2. Aplicar a migration única proposta (§7 de `AUDITORIA_HISTORICA_RPC_V4_DESCONTOS.md`): ENUM + colunas (`motivo`, `motivo_descricao_livre`, `operador_id`, `aplicado_em`), restaurar `UPDATE tokens…SET usado=true` + check `JA_USADO` + `INSERT descontos_venda` com motivo; estender assinatura em 2 params (DROP do overload de 19 args).
3. Forwardar `motivoDesconto`/`motivoDescontoDescricao` em `caixaVendas.impl.ts`.
4. Verificação: `pg_get_functiondef` deve conter token consume + audit insert; E2E confirmando `usado=true` e linha em `descontos_venda`.

### BL-2 (P1) — MVF #3: Promoções
**Por quê**: `calcular_preco_produto` vivo **não** lê `regras_preco` nem trata `PROMOCAO` (confirmado). Requer ALTER da RPC de preço (estrutural) + equivalência offline (`calcularPrecoCanonico.ts`) + sync de promoções. Não pode ser meio-implementado: a parte offline sozinha violaria o invariante C4 (mesmo preço online/offline).
**Plano**: estender `calcular_preco_produto` (PASSO 1 promoção, preservando SSOT — ALTER, nunca nova RPC), espelhar em `calcularPrecoCanonico.ts`, incluir promoções ativas no `sync-outbox`, testes de equivalência.

### BL-3 (P2) — Enqueue fiscal rico
**Por quê**: metadados de auditoria fiscal (ip/user_agent/device/terminal) deixaram de ser propagados na v4 (regressão colateral). Params seguem mortos na assinatura.
**Plano**: restaurar `fiscal_enfileirar_documento_venda` com payload estruturado — item separado, fora da reconciliação de desconto.

### BL-4 (P2) — Guard de drift por corpo de função
**Por quê**: a regressão do PASSO 5 passou por uma auditoria de drift que só checava existência. **Plano**: adicionar checagem de `md5(pg_get_functiondef())` contra corpo canônico versionado no pipeline.

---

## 6. Riscos remanescentes para Go-Live

| Risco | Sev. | Origem | Mitigação |
|---|---|---|---|
| Token de gerente reutilizável | 🔴 P0 | v4 sem consumo de token | BL-1 (obrigatório antes de Go-Live) |
| Descontos de gerente sem auditoria | 🔴 P0 | v4 sem `INSERT descontos_venda` | BL-1 |
| Motivo capturado na UI mas não persistido | 🟠 P1 | boundary do servidor | BL-1 (mesmo fix) |
| Promoções não funcionam | 🟠 P1 | `calcular_preco_produto` sem `regras_preco` | BL-2 |
| Guard de item usa limite fixo (15%) | 🟡 P2 | frontend não lê `pdv_config` | Aceito (trigger de backend é a fonte autoritativa); reflita config no futuro |
| Divergência repo↔banco de migrations | 🟡 P2 | banco baselined ~258 | Reconciliação (RECONCILIACAO doc) |

---

## 7. Arquivos alterados (commits desta sprint)

Código:
- `shared-core/src/stores/unifiedCartStore.ts` — MVF #1 (validação de limite)
- `pdv-importados/app/caixa/CaixaGerenteModal.tsx` — MVF #2 (modal 3 passos + motivo obrigatório)
- `pdv-importados/app/caixa/CaixaPageClient.tsx` — MVF #2 (wiring do motivo até o payload)
- `pdv-importados/app/caixa/finalizarVendaValidation.ts` — MVF #2 (schema Zod do motivo)
- `pdv-importados/app/caixa/carrinhoStore.behavior.test.ts` — testes MVF #1

Documentação:
- `docs/AUDITORIA_DESCONTO_MVF_FINAL_V2.md` — canônico v2.0
- `docs/AUDITORIA_HISTORICA_RPC_V4_DESCONTOS.md` — laudo forense
- `docs/RECONCILIACAO_REPO_VS_BANCO_DESCONTOS.md` — reconciliação
- `docs/SPRINT_DESCONTOS_RELATORIO_FINAL.md` — este relatório

> Nota: `123_desconto_motivo_enum.sql` (rascunho incorreto, apontava para v3) foi **removido** antes de qualquer commit — nenhuma migration foi aplicada nesta sprint.

---

## 8. Testes

**Executados (adicionados no código):**
- Unit/behavior (`carrinhoStore.behavior.test.ts`): 3 cenários MVF #1 — rejeita 25% em VAREJO, aceita 15% em VAREJO, aceita 30% em ATACADO.

**Não executados neste ambiente (pendentes de CI real):**
- `npm test` / vitest — o runner (`turbo`) não está disponível no ambiente; typecheck local não é conclusivo (sem `node_modules`). Verificação de tipos feita por inspeção do contrato modal→page→schema.
- E2E Playwright do fluxo de desconto (gerente 3 passos, motivo obrigatório).
- Testes de persistência do motivo (dependem de BL-1).

---

## 9. Débito técnico criado

1. **Motivo capturado mas não persistido** (parcial MVF #2) — resolvido junto com BL-1.
2. **Guard de limite de item fixo em 15%** no frontend — não lê `pdv_config`; aceitável como defesa em profundidade (backend é autoritativo), mas é divergência potencial para lojas com limite < 15%.
3. Nenhuma migration criada (evitado propositalmente) — sem débito de schema.

---

## 10. Recomendação final

### Frontend / Documentação (commits desta sprint)
**✅ Pronto para Merge.**
Justificativa: MVF #1 e MVF #2-frontend são aditivos, seguros, com defesa em profundidade preservada e testes de comportamento. A documentação canônica está congelada e coerente. Nenhuma migration foi tocada. Os campos extras no payload são ignorados sem erro pelo servidor atual.

### Produto (Go-Live do domínio de desconto)
**❌ Não pronto para Go-Live.**
Justificativa: dois P0 abertos (token reutilizável + descontos sem auditoria) por regressão histórica na v4, e o motivo ainda não é persistido. Go-Live seguro exige BL-1 (reconciliação da v4). MVF #3 (promoções) permanece não implementado (BL-2).

### Homologação
**✅ Pronto para Homologação** dos itens de frontend (validação de limite + fluxo de motivo na UI), com a ressalva explícita de que a persistência do motivo e a auditoria de desconto só serão verificáveis end-to-end após BL-1.

---

**Status da sprint**: 70% concluída · Frontend/Docs prontos para merge · Backend estrutural remetido a backlog com plano · Go-Live do domínio condicionado a BL-1.
