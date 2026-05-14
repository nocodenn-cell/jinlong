# Deploy Unificado - Single Source of Truth

**Documento único que substitui os 15+ checklists fragmentados.**  
Use este arquivo como **única referência** para deploy em staging/produção.

**Automação disponível:** `.\scripts\deploy-gates.ps1 -Environment staging|prod`

---

## Visão Geral

| Ambiente | URL | Desktop | Quando usar |
|----------|-----|---------|-------------|
| **staging** | `https://fastproduct-staging.vercel.app` | Não | Homologação antes de produção |
| **prod** | `https://fastproduct.vercel.app` | Sim | Loja piloto/produção |

---

## Deploy Automatizado (Recomendado)

```powershell
# Staging
.\scripts\deploy-gates.ps1 -Environment staging

# Produção
.\scripts\deploy-gates.ps1 -Environment prod -ProjectRef seu-ref

# Dry run (só verifica, não aplica)
.\scripts\deploy-gates.ps1 -Environment staging -DryRun
```

**O que o script faz automaticamente:**
- T1: Link Supabase
- T2: Verifica migrations
- T3: Status P0
- T4: Aplica db push se necessário
- T5: Executa verify_p0_producao.sql
- T6: Smoke 023 (se disponível)
- T7: Deploy Edge Functions
- T8: Verifica secrets críticos
- T9: Verifica .env.local
- T10: Verifica .env desktop (produção)

---

## Deploy Manual (Fallback)

Se o script falhar, execute os passos manualmente:

### 1. Supabase (T1-T5)

```powershell
cd backend

# T1: Link
npx supabase link --project-ref <SEU-REF>

# T2: Verificar migrations
npx supabase migration list

# T3: Status P0
node scripts/p0-migration-status.mjs

# T4: Aplicar drift (se houver)
npx supabase db push

# T5: Verificação SQL
psql "$POSTGRES_URL" -f supabase/scripts/verify_p0_producao.sql
```

### 2. Edge Functions (T7)

```powershell
cd backend

# Deploy functions
npx supabase functions deploy sync-outbox --no-verify-jwt
npx supabase functions deploy validar-gerente --no-verify-jwt

# Produção apenas
npx supabase functions deploy fiscal-worker --no-verify-jwt
```

### 3. Secrets (T8)

**Supabase Edge:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` 
- `SYNC_KEY`

**Vercel:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Web (T9)

```powershell
cd pdv-importados
npm run build
# Deploy via Vercel CLI ou GitHub Actions
```

### 5. Desktop (T10 - só produção)

Configure `pdv-local/.env`:
```
SYNC_ENDPOINT=https://SEU-REF.supabase.co/functions/v1/sync-outbox
SYNC_KEY=sua-chave-secreta
```

---

## Testes Obrigatórios (T11-T12)

### T11: Web (ambientes)
1. Operador em `/caixa` 
2. Venda de teste
3. Finalizar venda
4. Gerente em `/gerente/vendas`
5. Verificar venda e itens
6. (Se staging usa `NEXT_PUBLIC_CAIXA_PDV_LAYOUT=classic`) Confirmar aviso de pré-visualização do novo layout e validar visual com o cliente antes da Fase B

### T12: Desktop (só produção)
1. Sync catálogo
2. Venda no Tauri
3. Sync
4. Verificar no Supabase

---

## Secrets Críticos por Ambiente

### Staging
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (Opcional, homologação visual do caixa web) `NEXT_PUBLIC_CAIXA_PDV_LAYOUT=classic` — ativa o layout “clínica PDV” em `/caixa` (barra superior estilo mockup, grelha a 3 colunas em ecrãs médios+). A interface mostra um **aviso de pré-visualização** (“novo layout opcional”) até o cliente validar; o passo seguinte no plano é a **Fase B** (carrinho + barra inferior). **Não** definir em produção até decisão explícita.

### Produção
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SYNC_ENDPOINT`
- `SYNC_KEY`

---

## Troubleshooting

### Problemas Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `Port already allocated` | Docker conflito | `docker ps -a` + `docker rm` |
| `Migration drift` | Local vs Remote diferente | `npx supabase db push` |
| `Secret missing` | Environment não configurado | Verificar secrets na Vercel/Supabase |
| `Function deploy failed` | Edge Function com erro | Verificar logs no Supabase Dashboard |

### Comandos Úteis

```powershell
# Verificar portas Docker
netstat -ano | findstr :54321

# Reset local (se necessário)
cd backend
npx supabase stop --project-id fastproduct
npx supabase start

# Verificar status completo
npx supabase status
```

---

## Registro Formal (Staging)

Para cada ciclo de staging, registre:

| Campo | Valor |
|-------|--------|
| **Data** | AAAA-MM-DD |
| **Responsável** | Nome/equipe |
| **Project Ref** | Supabase ref |
| **Testes T11/T12** | OK/Com observações |
| **Evidências** | Links/prints |

---

## Próximo Passo: Feature Flags (Futuro)

Para simplificar ainda mais, planejamos:
- Ambiente único (staging = preview branch)
- Feature flags para funcionalidades
- Zero configuração manual

---

## Referências Antigas (DEPRECATED)

Estes documentos foram consolidados aqui:
- ~~P0_CHECKLIST_OPERACIONAL.md~~
- ~~CHECKLIST_P0_STAGING.md~~  
- ~~AMBIENTES_E_RELEASE.md~~
- ~~PRODUCAO_GO_NO_GO.md~~
- ~~CHECKLIST_DEPLOY_SUPABASE.md~~

Mantenha este arquivo atualizado. Ele é a **única fonte de verdade**.
