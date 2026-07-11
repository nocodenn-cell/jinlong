# ✅ CHECKLIST — Validação de Secrets `sync-outbox`

**Severidade:** 🔴 **CRÍTICO**  
**Impacto:** Sincronização PDV Desktop falha silenciosamente se secrets não configurados  
**Tempo:** 5 minutos

---

## 📋 Checklist

Antes de qualquer sincronização desktop em produção, valide:

### **1️⃣ SUPABASE_URL**
```bash
# Via CLI:
npx supabase secrets list --output json | grep SUPABASE_URL

# Via Dashboard:
# Supabase Dashboard → seu projeto → Edge Functions → sync-outbox → Secrets
```

✅ **Esperado:** 
```
"SUPABASE_URL": "https://seu-ref-do-projeto.supabase.co"
```

❌ **Não configurado:** Edge function falha com "MISSING_ENV" no primeiro sync

---

### **2️⃣ SUPABASE_SERVICE_ROLE_KEY**
```bash
# Via CLI:
npx supabase secrets list --output json | grep SUPABASE_SERVICE_ROLE_KEY

# Valor correto:
# Dashboard → Project Settings → API → Service role (secret)
# ⚠️ Começa com "eyJhbGciOi..." (JWT)
```

✅ **Esperado:** JWT válido do projeto  
❌ **Não configurado:** Edge function não consegue acessar Supabase

---

### **3️⃣ SYNC_KEY**
```bash
# Via CLI:
npx supabase secrets list --output json | grep SYNC_KEY

# Geração de chave forte (bash/powershell):
# bash:    openssl rand -hex 32
# powershell: [Convert]::ToHexString((1..32 | ForEach-Object {Get-Random -Max 256}))
```

✅ **Esperado:** Chave aleatória forte (mín. 32 caracteres hex)  
❌ **Não configurado:** Sync usa chave default (INSEGURO)

---

## 🔧 Como Configurar

### **Opção 1: Dashboard Supabase (Recomendado)**
1. Ir para: Supabase → seu projeto → Edge Functions → `sync-outbox`
2. Aba **Secrets**
3. Adicionar 3 secrets:
   ```
   SUPABASE_URL = https://seu-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = (copiar do Project Settings → API)
   SYNC_KEY = (gerar com openssl rand -hex 32)
   ```
4. Salvar

### **Opção 2: CLI (Supabase)**
```bash
cd backend

# Configurar secrets um por um
npx supabase secrets set SUPABASE_URL="https://seu-ref.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="(JWT do dashboard)"
npx supabase secrets set SYNC_KEY="(chave forte)"

# Verificar
npx supabase secrets list
```

### **Opção 3: Script PowerShell (Windows)**
```powershell
# backend/supabase/scripts/setup-secrets-sync-outbox.ps1
.\setup-secrets-sync-outbox.ps1 -ProjectRef "seu-ref" `
  -ServiceRoleKey "(JWT)" `
  -SyncKey "(chave aleatória)"
```

---

## ✅ Validação Pós-Configuração

Após configurar, validar que sync funciona:

### **1. PDV Desktop (.env)**
```bash
# pdv-local/.env
SYNC_ENDPOINT=https://seu-ref.supabase.co/functions/v1/sync-outbox
SYNC_KEY=(mesma chave configurada acima)
```

### **2. Testar Sync**
```bash
# No PDV Desktop (Tauri):
1. Abrir PDV
2. "Sincronizar catálogo" → deve funcionar sem erro 401
3. Realizar uma venda de teste
4. Aguardar sync automático (~15s com caixa aberto)
5. Verificar em Supabase → tabelas vendas/itens_venda
```

### **3. Monitorar Logs**
```bash
# Dashboard Supabase → Edge Functions → sync-outbox → Logs
# Buscar por: REPLAY_OR_DB_ERROR, 401, INVALID_SYNC_KEY

# Esperado: entradas "sync_batch_processed" com status OK
```

---

## 🚨 Troubleshooting

| Erro | Causa | Fix |
|------|-------|-----|
| `401 Unauthorized` | SYNC_KEY inválido ou não configurado | Verificar SYNC_KEY em secrets |
| `MISSING_ENV` | Algum secret não configurado | `npx supabase secrets list` |
| `HMAC_MISMATCH` | SYNC_KEY diverge entre cliente e Edge | Sincronizar valores (pdv-local/.env) |
| `REPLAY_OR_DB_ERROR` | Nonce duplicado ou DB indisponível | Aguardar + retentar (edge case) |

---

## 📝 Registro de Conformidade

```
Projeto: _________________
Ambiente: [ ] DEV  [ ] STAGING  [ ] PRODUÇÃO

Data de Validação: _______________
Responsável: _______________

Secrets Validados:
  [ ] SUPABASE_URL presente
  [ ] SUPABASE_SERVICE_ROLE_KEY presente
  [ ] SYNC_KEY presente
  
Sync Testado:
  [ ] PDV Desktop sincroniza catálogo
  [ ] Venda de teste finaliza e sincroniza
  [ ] Gerente vê venda em web (/gerente/vendas)

Aprovado em: _______________
```

---

**Referência:** Migration 243, Edge Function `backend/supabase/functions/sync-outbox/index.ts:851-858`
