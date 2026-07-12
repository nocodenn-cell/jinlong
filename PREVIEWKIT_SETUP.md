# Configuração do PreviewKit - Autonoma

## ✅ Status das Correções

### 1. Package.json ✓ CORRIGIDO
- **Arquivo**: `pdv-importados/package.json`
- **Script `build`**: ✓ `next build` 
- **Script `start`**: ✓ **CORRIGIDO** para `next start -p 3000` (estava sem porta)
- **Node.js**: ✓ `>=20.0.0 <25.0.0` (compatível com Node.js 22)

---

## 📋 Configuração do PreviewKit

### Configurações Obrigatórias

#### 1. **Runtime**
```
Node.js 22
```

#### 2. **Build Command** (EXATO)
```bash
npm install && npm run build
```

#### 3. **Start Command** (EXATO) 
```bash
npm start
```
*(Isto agora vai executar `next start -p 3000`)*

#### 4. **Port**
```
3000
```

#### 5. **Health Check Path**
```
/
```

---

## 🔐 Variáveis Obrigatórias

Adicione em **Variables** do PreviewKit (não em `.env`):

```env
# Essencial para produção
NODE_ENV=production

# Autonoma - Obrigatórias
AUTONOMA_CLIENT_ID=<seu_client_id_aqui>
AUTONOMA_SECRET_ID=<seu_secret_id_aqui>

# Features/Demo (opcional)
NEXT_PUBLIC_ENABLE_DEMO_FLUXO=true

# Supabase (se usar)
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>

# Sentry (se usar)
SENTRY_ORG=<org>
SENTRY_PROJECT=<project>
SENTRY_AUTH_TOKEN=<token>
```

**Importante**: 
- Variáveis com `NEXT_PUBLIC_` são visíveis no client-side
- `AUTONOMA_*`, `SENTRY_*` são secrets (backend only)
- `NODE_ENV=production` é crítico

---

## 🚀 Passos para Rebuild

1. **No PreviewKit Dashboard**:
   - Acesse seu serviço
   - Confirme que Runtime é "Node.js 22"
   - Confirme Build, Start e Port conforme acima
   - Adicione as variáveis

2. **Trigger Rebuild**:
   - Clique em "Rebuild"
   - Aguarde logs do build

3. **Verificar Logs**:
   - Build deve terminar com sucesso
   - Start deve executar sem erros
   - Health check `/` deve retornar HTTP 200

4. **Testar**:
   - Acesse a URL gerada
   - Página deve carregar
   - Teste fluxos autenticados com Autonoma

---

## 🔍 Se ainda der erro "Invalid options for docker-image recipe"

| Verificação | O que fazer |
|------------|-----------|
| Scripts | Confirmar `start: "next start -p 3000"` em package.json |
| package-lock.json | Deve estar commitado (git status) |
| Variáveis | Todas as env vars setadas no PreviewKit |
| Port conflito | Confirmar que 3000 não tem conflito |
| Node.js | Confirmar Node.js 22 no PreviewKit settings |
| Build timeout | Se build demora, aumentar timeout |

---

## 📝 Próximos Passos

1. ✓ Package.json corrigido
2. → Fazer rebuild no PreviewKit
3. → Monitorar logs
4. → Testar URL gerada
5. → Validar fluxos Autonoma

---

## 📞 Troubleshooting

Se encontrar erros, colete:
- [ ] Logs completos do build (PreviewKit → Logs → Build)
- [ ] Saída de `npm install && npm run build` (local)
- [ ] Output de `npm start` (local)
- [ ] Valores das variáveis (sanitizados)

**Teste local antes de rebuild:**
```bash
cd pdv-importados
npm install
npm run build
npm start
# Acesse http://localhost:3000
```

Se funciona local mas não no PreviewKit, o problema é configuração de env vars ou runtime.
