# Runbook de incidente — 1 página (piloto Matriz)

**Atualizado:** 2026-10-08 · **Release produto baseline:** `e1327e62` (+ tip `main` posterior)  
**Escopo:** 1 loja web. Desktop/fiscal real fora deste roteiro.

> **AVISO DE RECUPERAÇÃO DE DADOS:** em 2026-10-08 **não existe** backup de produção comprovável (Opção B falha em Temporary Access/JIT; Free sem daily nativo).  
> **Não prometa restore de Postgres.** Preserve evidência, estabilize o app, escale o dono.

---

## 1) Detectar

| Sinal | Onde |
|---|---|
| App fora / 5xx | `https://pdv-importados.vercel.app/api/health` + Vercel Deployments |
| Erros JS/API | Sentry (projeto web) |
| Auth/DB | Status Supabase + login `/login` |
| Caixa travado | Operador: mensagem no PDV; gerente: `/admin/caixas` |

## 2) Diagnosticar (rápido)

| Sintoma | Hipótese | Ação imediata |
|---|---|---|
| Login falha | Auth/GoTrue | Não recriar user na mão; checar Supabase Auth |
| Venda não grava | RPC v4 / rede | Anotar `idempotency`/hora; não bipar de novo sem checar `/admin/vendas` |
| Estoque errado | Cancel/devolução | Usar fluxos canônicos; **não** UPDATE manual |
| Deploy ruim | Release | Rollback **app** Vercel (não `db reset`) |
| “Perdi o banco” | DR | **Parar.** Sem artifact SUCCESS, restore **não** está pronto |

URLs mortas: ignorar qualquer menção a `jinlong-v1.vercel.app`. Canônico: `pdv-importados.vercel.app`.

## 3) Preservar dados

- Não `supabase db reset` / `db push` improvisado em produção.  
- Não reaplicar migrations “para consertar”.  
- Não apagar vendas/caixas.  
- Cancelamentos só pelo fluxo auditado (gerente).  
- Anotar IDs (venda/caixa) **sem** colar PII no chat público.

## 4) Recuperar aplicativo

1. Confirmar Deployment ID em `/api/health` (SSRA).  
2. Rollback Vercel para o último deploy conhecido bom **só do front**.  
3. Coordenar com dono se a falha for schema (raro) — banco ≠ app.

## 5) Recuperar dados (estado real)

| Situação | Ação |
|---|---|
| Há artifact `jinlong-backup-*` de run **success** &lt;25h | Seguir [`BACKUP_RESTORE_CANONICO.md`](../runbooks/BACKUP_RESTORE_CANONICO.md) em **DESTINO** ≠ produção |
| Só falhas JIT / sem artifact | **Impossível restore ensaiado.** Abrir incidente com dono + ticket Supabase ([JIT_ALTERNATIVAS…](./JIT_ALTERNATIVAS_DESBLOQUEIO.md)) |
| Pedido de “aceitar risco” | Registrar; **não** marca backup PASS |

## 6) Contatos

- Suporte implantação / CTO: ver [`CHECKLIST_IMPLANTACAO_CLIENTE.md`](../../CHECKLIST_IMPLANTACAO_CLIENTE.md)  
- Hotline técnico: [`ROLLBACK_HOTLINE_PLAYBOOK.md`](../../ROLLBACK_HOTLINE_PLAYBOOK.md) (validar telefones; não seguir URLs antigas)

## 7) Encerrar incidente

- Timeline (detecção → mitigação → causa)  
- Se dados em risco: status backup (FAIL/PENDING/READY) no relatório  
- Issue/PR só se hotfix de produto comprovado
