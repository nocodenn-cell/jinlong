# Checklist final — Go-Live do primeiro cliente pagante

Versão para imprimir. Cada item tem **quem executa** e **quem confere**.
Plano completo: [00-README.md](00-README.md).

```
Cliente: ______________________  Loja: ______________________
Data do GO: ____/____/________   Janela: ______:______ às ______:______
Responsável técnico: ______________________
Responsável de negócio: ______________________
```

---

## 🔴 BLOQUEADORES — nenhum GO de *segundo cliente* sem revalidar

O item “30 migrations” é o checklist de **17/08**. O piloto `e1327e62` já está em GO.
Não imprimir esta folha como se o piloto estivesse NO-GO.

| ✓ | Item | Ref. | Exec. | Confere |
|---|---|---|---|---|
| ☐ | Ledger de produção revalidado (não assumir o “30” de 17/08) | [03](03-deploy-backend.md) §1 | | |
| ☐ | Deploy coordenado banco + app planejado, loja fechada | [07](07-go-live-day.md) §1 | | |
| ☐ | Reauditoria independente do bloco AR/AP **ou** risco aceito por escrito | [06](06-validacao-pre-go-live.md) §6 | | |
| ☐ | Issues #262, #261, #260, #259, #136, #66 lidas (GitHub estava em 503) | [06](06-validacao-pre-go-live.md) L12 | | |

---

## 1. Pré-requisitos

| ✓ | Item | Ref. |
|---|---|---|
| ☐ | Node `>=20 <25` — ciente de que a Vercel usa 24.x | [01](01-pre-requisitos.md) §1 |
| ☐ | `npm ci` sem erro (**nunca** `npm install`) | [01](01-pre-requisitos.md) §2 |
| ☐ | Acessos: Supabase, Vercel, GitHub, `/admin/implantacao` | [01](01-pre-requisitos.md) §3 |
| ☐ | 16 variáveis do web definidas na Vercel (Production) | [01](01-pre-requisitos.md) §4.1 |
| ☐ | 6 variáveis do desktop (se aplicável) | [01](01-pre-requisitos.md) §4.2 |
| ☐ | `SYNC_KEY` do desktop == secret da Edge | [01](01-pre-requisitos.md) §4.2 |
| ☐ | Ciente: **não há staging** | [02](02-ambiente-producao.md) §1 |

## 2. Ambiente de produção

| ✓ | Item | Ref. |
|---|---|---|
| ☐ | 3 Edge Functions ACTIVE | [02](02-ambiente-producao.md) §2 |
| ☐ | Decisão sobre `anon` em `converter_venda_em_espera` / `devolver_venda_em_espera` | [02](02-ambiente-producao.md) §3.1 |
| ☐ | `auth_leaked_password_protection` habilitado ou risco aceito | [02](02-ambiente-producao.md) §3.3 |
| ☐ | `NEXT_PUBLIC_DEBUG_MODE=false` · `STRICT_MANAGER_DISCOUNT_AUTH=true` | [02](02-ambiente-producao.md) §4 |
| ☐ | Decisão sobre `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` | [02](02-ambiente-producao.md) §4 |
| ☐ | Cliente informado de que **o fiscal é stub** | [02](02-ambiente-producao.md) §5 |

## 3. Validação (D-1)

| ✓ | Item | Esperado |
|---|---|---|
| ☐ | `npx supabase db reset --local --yes` | verde, 304 migrations |
| ☐ | `test:rls-scope` | **42/42** |
| ☐ | `test:financial` | **6/6** |
| ☐ | `test:financial-concurrency` | verde |
| ☐ | `check:types-drift` | verde |
| ☐ | `npm run ci` | vitest **923/923** |
| ☐ | `npm run guard:all` | 8 guardas verdes |
| ☐ | `test:e2e:critical` | executado; falhas decididas |
| ☐ | `check:golive` e `check:caixa-pre-producao` | verdes |
| ☐ | `migration-human-gates.json` | `{"gates": []}` |
| ☐ | Tombstone presente · `20260808130200` ausente | [03](03-deploy-backend.md) §5 |

## 4. Janela de deploy (D0, loja fechada)

| ✓ | # | Passo | Exec. | Confere |
|---|---|---|---|---|
| ☐ | 1 | Nenhum caixa aberto | | |
| ☐ | 2 | **Backup do banco** | | |
| ☐ | 3 | SHA e `deploymentId` atuais registrados | | |
| ☐ | 4 | Gates humanos vazios | | |
| ☐ | 5 | `npx supabase db push --linked` | | |
| ☐ | 6 | `migration list` mostra as 30 versões | | |
| ☐ | 7 | 3 Edge Functions republicadas | | |
| ☐ | 8 | App publicada na Vercel | | |
| ☐ | 9 | Promovida a produção | | |
| ☐ | 10 | **SSRA** — `deploymentId` idêntico | | |
| ☐ | 11 | `gitSha` == commit publicado | | |
| ☐ | 12 | Smokes verdes | | |

> ⚠️ Passos 5–9 = janela em que **AR e AP não funcionam**. Não interromper no meio.

## 5. Aceitação no balcão (D0)

| ✓ | # | Passo |
|---|---|---|
| ☐ | 13 | Abrir caixa de teste |
| ☐ | 14 | Venda simples à vista |
| ☐ | 15 | Venda com split de pagamento |
| ☐ | 16 | Venda a prazo → título em contas a receber |
| ☐ | 17 | **Recebimento parcial → efeito em caixa** (FIN-298-01) |
| ☐ | 18 | **Venda gerou comissão** (FIN-298-03) |
| ☐ | 19 | **Cancelamento com recebimento → estorno** (FIN-298-04) |
| ☐ | 20 | **Pagamento AP em dinheiro → sangria** (FIN-298-02) |
| ☐ | 21 | Fechar caixa → valor esperado confere |
| ☐ | 22 | (desktop) roteiro offline completo |

> **Se 17–20 falharem: NO-GO.** Era exatamente o motivo do deploy.

## 6. Onboarding do cliente

| ✓ | Item | Ref. |
|---|---|---|
| ☐ | Limites comunicados **por escrito** e aceitos | [09](09-primeiro-cliente.md) §1 |
| ☐ | Loja, usuários e perfis criados | [09](09-primeiro-cliente.md) §2 |
| ☐ | `pdv_config`, crédito, formas de pagamento | [09](09-primeiro-cliente.md) §2 |
| ☐ | Regras de comissão cadastradas | [09](09-primeiro-cliente.md) §2 |
| ☐ | Catálogo importado com **custos conferidos** | [09](09-primeiro-cliente.md) §3.2 |
| ☐ | Estoque inicial pelo fluxo correto | [09](09-primeiro-cliente.md) §3.1 |
| ☐ | Operador treinado | [09](09-primeiro-cliente.md) §4.1 |
| ☐ | Gerente treinado | [09](09-primeiro-cliente.md) §4.2 |
| ☐ | Dono treinado, incluindo os limites | [09](09-primeiro-cliente.md) §4.3 |

## 7. Autorização

| ✓ | Item |
|---|---|
| ☐ | Responsável de negócio revisou os resultados |
| ☐ | `go_autorizado = true` registrado em `/admin/implantacao` |
| ☐ | Cliente comunicado |
| ☐ | Janela de acompanhamento aberta |

```
GO autorizado por: ______________________  Hora: ______:______

Assinatura técnica: ______________________

Assinatura de negócio: ______________________
```

## 8. Pós Go-Live

| ✓ | Item | Ref. |
|---|---|---|
| ☐ | D0: acompanhamento até o fechamento do caixa | [08](08-pos-go-live.md) §1 |
| ☐ | D+1..D+7: conferência diária de comissões e AR/AP | [08](08-pos-go-live.md) §2.1 |
| ☐ | D+7: revisão da semana com o cliente | [09](09-primeiro-cliente.md) §5 |
| ☐ | D+30: critério de operação estável avaliado | [08](08-pos-go-live.md) §5 |

---

## Se algo der errado

1. **Nunca reverter só a aplicação** — recria "banco novo + app antiga", falha fechada para todos.
2. Correção financeira é **append-only e compensatória**. Nunca `UPDATE` direto.
3. Sinal de dupla contabilização → **pare e escale**.
4. Playbook: [`ROLLBACK_HOTLINE_PLAYBOOK.md`](../../ROLLBACK_HOTLINE_PLAYBOOK.md) ·
   sintomas comuns: [10-troubleshooting.md](10-troubleshooting.md)
