# Playbook de Hotline — Diagnóstico e Rollback Rápido

**Responsável:** CTO on-call  
**Tempo máximo:** 10 minutos (cliente = zero downtime)  
**Premissa:** A venda não pode parar. Melhor workaround do que perfeição.

---

## Escalação Telefônica (minuto 0–2)

### Pergunta 1: Qual é o erro exato?

**Pede ao gerente:**
- Screnshot do erro (se possível WhatsApp)
- Mensagem de erro completa (copiar/colar)
- Quando começou (após login? após escanear? ao finalizar?)

**Mapeamento rápido:**

| Erro | Causa | Ação |
|------|-------|------|
| "Não foi possível concluir. Tente novamente." | RPC falha ou timeout | Reload browser; se 2x: rollback |
| "Estoque insuficiente para um ou mais itens" | Produto fora de estoque | Operador remove item; continua |
| "Os preços do carrinho mudaram" | Preço foi alterado no backend | Operador atualize quantidade; retry |
| "Caixa fechado" | Tentativa venda com caixa não aberto | Clica "Abrir caixa"; retry |
| "Sessão expirada. Faça login novamente" | Token JWT venceu | Operador faz logout + login; retry |
| Página em branco / não carrega | Build quebrada ou servidor down | Vercel está online? Vê logs; rollback se necessário |

---

## Diagnóstico Rápido (minuto 2–5)

### Passo 1: Verificar status de produção

```bash
# SSH para máquina do cliente (se houver acesso)
curl -I https://jinlong-v1.vercel.app/login
# Esperado: HTTP 200

# OU verificar Vercel → Deployments
# Vê último commit → build status
# Status = "Ready" ? Sim → OK
```

**Se build falhou:**
→ Rollback automático do Vercel (próxima etapa)

---

### Passo 2: Verificar Sentry (erros em produção)

```
https://sentry.io/ → Projeto Jinlong → Issue List
Filtra: timestamp últimas 10 minutos
Vê quantidade de errors
```

**Se há spike de erros:**
- Nota qual é o erro mais comum
- Se é "RPC" ou "database" → banco caiu ou é indisponibilidade Supabase
- Se é "TypeError" ou "undefined" → código quebrado → rollback

---

### Passo 3: Verificar se Supabase está online

```bash
# Via dashboard Supabase
Status page: https://status.supabase.com/
# Vê "All systems operational" ?

# OU testa conexão simples
curl -H "Authorization: Bearer $TOKEN" \
  https://xxxxx.supabase.co/rest/v1/vendas?limit=1
# Status 200 = OK
```

**Se Supabase está down:**
→ Informa cliente: "É problema global; aguarde 15 min"  
→ Cliente pode continuar offline com `pdv-local` se tiver (Tauri)

---

## Decisão: Rollback ou Workaround? (minuto 5)

### Critério de rollback

**Rollback se:**
- Build falhou (Vercel status = failed)
- 5+ operadores reclamando (não é localizado)
- Erro impede TODA transação (não é edge case)

**Workaround se:**
- 1 operador afetado (talvez config local)
- Erro é de negócio (estoque insuficiente) → é esperado
- Refresh/retry resolve (timeout de rede)

---

## Rollback (minuto 5–8, se necessário)

### Opção A: Rollback via Vercel (< 2 min)

1. **Vercel dashboard** → fdv-importados → Deployments
2. **Acha deployment anterior** (que estava OK)
3. **Clica "Promote to Production"**
4. **Espera build** (1 min)
5. **Testa:** Reload browser no cliente

```bash
# Confirma rollback
git log -1 --oneline
# Saída: deve ser commit anterior ao que quebrou
```

**Resultado:** Produção volta para versão anterior; cliente continua operando.

---

### Opção B: Deploy manual (se Vercel estiver lento)

```bash
# Local (CTO)
cd pdv-importados
git revert HEAD --no-edit
git push origin main
# Vercel redeploy automático (1–2 min)

# Ou força push se for emergência
git reset --hard HEAD~1
git push -f origin main
```

**Aviso:** Isso é apenas em emergência; depois comunicar ao time.

---

## Validação Pós-Rollback (minuto 8–10)

### Cliente testa novamente

1. **Reload browser** (Cmd/Ctrl + Shift + R = cache limpo)
2. **Login**
3. **Faz venda teste** (mesma do dia 0)
4. **Confirma:** "Funcionou? Sim?"

**Se sim:** 
```
✅ Problema resolvido. Você está pronto para continuar operando.
CTO vai investigar root cause e comunicar quando houver fix.
Suporte continua on-call.
```

**Se não (ainda falha):**
```
⚠️ Rollback não resolveu. Pode ser problema infraestrutura.
Vamos tentar workaround:
[descrever workaround — ex.: usar pdv-local offline, esperar 30min, etc.]
```

---

## Pós-Incidente (depois do hotline)

### Log do incident (CTO enche depois)

```markdown
## Incident: [Data/Hora]

**Duração:** X minutos  
**Impacto:** N vendas atrasadas / perdidas  
**Root cause:** [TBD após investigação]  

**Timeline:**
- 14:23 — Cliente liga: "Venda travando"
- 14:25 — CTO vê Sentry spike
- 14:28 — Rollback via Vercel
- 14:30 — Validado; operação resumida

**Remediação:** [Será investigado nos próximos 2 dias]
**Prevenção:** [Adicionar teste para esse caso]
```

---

## Números de Referência

| Componente | Status Page |
|-----------|------------|
| Vercel | https://www.vercelstatus.com |
| Supabase | https://status.supabase.com |
| Sentry | https://status.sentry.io |

---

## Contatos de Escalação

| Nível | Contato | Tempo resposta |
|-------|---------|----------------|
| **CTO (primeiro line)** | +55 11 XXXXX | Imediato |
| **Supabase (se DB down)** | status.supabase.com → chat | 30 min |
| **Vercel (se build fail)** | vercelstatus.com | 30 min |

---

## Exercício de Simulação

**CTO treina 1x/semana (5 min):**

```bash
# Simular rollback sem fazer nada
git log --oneline | head -5
# Verifica qual seria o commit anterior
# Nada de git reset, só lê!

# Testa acesso a Sentry
# Testa acesso a Vercel
```

**Objetivo:** Quando for real, CTO consegue fazer de olhos fechados.

---

**Última atualização:** 2026-07-29  
**Próxima revisão:** Após 1ª semana de operação
