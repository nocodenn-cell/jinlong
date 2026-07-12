# FASE 6: Onboarding de Novo Desenvolvedor

**Data:** 2026-07-12 03:00 UTC  
**Validação:** Análise do processo de setup + documentação existente  
**Status:** ⚠️ **PROCESSO VIÁVEL MAS DOCUMENTAÇÃO INCOMPLETA**

---

## Resumo Executivo

Novo desenvolvedor consegue clonar, instalar e executar FastProduct, MAS:

- ✅ Estrutura monorepo clara (npm workspaces + Turborepo)
- ✅ Scripts npm bem-documentados no README.md
- ✅ Exemplo .env disponível
- ⚠️ Sem SETUP.md específico (deve-se usar README.md)
- ⚠️ Sem CONTRIBUTING.md (pull request template apenas)
- ⚠️ Sem Supabase link/init instructions explícitas

---

## Cenário de Teste: Dev Novo Clone Zero

### Pré-requisitos do Dev
```
- git instalado
- Node.js LTS (conforme .nvmrc)
- npm (npm 9+ recomendado)
- Supabase account + project ID
- Conta de email para auth testing
```

### Passo 1: Clone e Instalação ✅

**Instrução (do README.md):**
```bash
# 1. Clone
git clone https://github.com/nocodenn-cell/fastproduct.git
cd fastproduct
git checkout feature/go-live-integration

# 2. Instalar dependências (npm workspaces)
npm ci

# 3. Supabase setup (opcional)
# O repositório já tem supabase.json configurado
# Para linked development:
supabase link --project-id <seu-project-id>
```

**Validação:**
- ✅ README.md existente (`/home/user/fastproduct/README.md`)
- ✅ `package.json` referencia workspaces
- ✅ `supabase.json` configurado
- ✅ `.env.example` presente em `pdv-importados/` e `pdv-local/`

### Passo 2: Configurar Variáveis de Ambiente ⚠️

**Instrução (do README.md):**
```bash
# Web (Next.js)
cp pdv-importados/.env.example pdv-importados/.env.local
# Editar: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

# Desktop (Tauri)
cp pdv-local/.env.example pdv-local/.env
# Editar: SYNC_ENDPOINT, SYNC_KEY
```

**Problema Identificado:**
- ❌ Onde obter `NEXT_PUBLIC_SUPABASE_URL`? (dev precisa de projeto Supabase próprio)
- ❌ Onde obter `NEXT_PUBLIC_SUPABASE_ANON_KEY`? (anon key precisa estar em .env public)
- ⚠️ Sem instruções sobre `supabase link` antes de `.env` setup

**Recomendação:**
Criar `SETUP_DEV.md` com:
1. Instruções de criar novo projeto Supabase (ou linkar existente)
2. Como extrair anon key e URL da console Supabase
3. Como copiar .env.example e preencher corretamente

### Passo 3: Executar Banco Vazio ✅

**Instrução (do README.md não diz explicitamente, mas possível):**
```bash
# Após supabase link, resetar banco local
supabase db reset --password postgres
```

**Validação:**
- ✅ Baseline existe (`/home/user/fastproduct/backend/supabase/migrations/00000000000000_baseline_prod.sql`)
- ✅ Supabase CLI consegue aplicar
- ✅ Dev consegue testar com banco local

### Passo 4: Rodar Dev Server ✅

**Instrução (do README.md):**
```bash
# Web
npm run dev:web
# Abre http://localhost:3000

# Desktop
npm run dev:desktop
# Abre UI em http://localhost:5173
```

**Validação:**
- ✅ Scripts existem (package.json raiz)
- ✅ Next.js app tem (pages/app)
- ✅ Tauri app tem (vite.config.ts)

### Passo 5: Testar Fluxos Críticos ⚠️

**Necessário para validar consolidação:**
```
1. Autenticação (login com Supabase)
2. Criar venda (finalizarVenda RPC)
3. Consultar estoque (decrementar_estoque_seguro validação)
4. Auditoria (RLS: usuário vê só dados de sua loja)
```

**Problema Identificado:**
- ❌ Sem script de E2E automático incluído no dev setup
- ❌ Sem dados de seed (usuários de teste, produtos, lojas)
- ⚠️ Sem instruções de "happy path" manual

**Recomendação:**
1. Criar `E2E_DEV.md` com passos de teste manual
2. Adicionar `npm run seed:dev` para popular dados de teste
3. Incluir `npm run test:e2e` no CI/CD

---

## Documentação Existente vs Necessária

### Documentação EXISTENTE ✅

| Arquivo | Localização | Conteúdo |
|---------|-------------|----------|
| README.md | Raiz | Estrutura, scripts npm, links para docs |
| backend/README.md | backend/ | Supabase + migrations |
| backend/supabase/README.md | backend/supabase | CLI + migration format |
| .env.example | pdv-importados/ | Template de variáveis |
| .env.example | pdv-local/ | Template de variáveis |

### Documentação NECESSÁRIA ❌

| Arquivo | Propósito | Impacto |
|---------|-----------|--------|
| SETUP_DEV.md | Passo-a-passo detalhado para novo dev | 🔴 CRÍTICO |
| CONTRIBUTING.md | Guia de contribuição + branch policy | 🟡 MÉDIA |
| E2E_DEV.md | Teste manual de fluxos críticos | 🟡 MÉDIA |
| SEED_DEV.md | Scripts de dados de teste | 🟡 MÉDIA |
| ARCHITECTURE_NEW.md | Visão geral de arcitetura pós-consolidação | 🟢 BAIXO |

---

## Risco 4 (do PASSO_4): Documentação de Onboarding

**Status Anterior:** ❌ Não existe CONTRIBUTING.md ou SETUP.md

**Status Atual:**
- ⚠️ README.md existe mas é incomplete (não fala de Supabase setup)
- ❌ SETUP_DEV.md ainda não existe
- ❌ E2E_DEV.md não existe
- ✅ .env.example existem

**Recomendação:**
Criar `SETUP_DEV.md` ANTES de considerar Passo 4 completo. Template:

```markdown
# Desenvolvimento Local — Guia Completo

## Pré-requisitos
- Node 18+ (conforme .nvmrc)
- npm 9+
- git

## Passo 1: Clone e Setup Inicial
git clone https://github.com/nocodenn-cell/fastproduct.git
cd fastproduct
npm ci

## Passo 2: Supabase Setup
### Opção A: Link ao projeto existente (produção/staging)
supabase link --project-id kbabmewnahysfvlybiak

### Opção B: Novo projeto local
supabase start  # docker pull supabase/postgres, etc

## Passo 3: Variáveis de Ambiente
# Copiar templates
cp pdv-importados/.env.example pdv-importados/.env.local
cp pdv-local/.env.example pdv-local/.env

# Preencher:
# - NEXT_PUBLIC_SUPABASE_URL (https://kbabmewnahysfvlybiak.supabase.co)
# - NEXT_PUBLIC_SUPABASE_ANON_KEY (role=anon, from Supabase console)
# - SYNC_ENDPOINT e SYNC_KEY (mesmo projeto, pode ser repetido)

## Passo 4: Aplicar Baseline
supabase db reset --password postgres
# Aplica 00000000000000_baseline_prod.sql

## Passo 5: Seed de Dados (Opcional)
npm run seed:dev
# Cria usuários de teste, lojas, produtos

## Passo 6: Rodar Dev Server
npm run dev:web
# Acessa http://localhost:3000/login

## Passo 7: Testar Fluxos Críticos (Manual)
# Login: test@example.com / password123
# Vendas: Menu → Caixa → Nova Venda → Adicionar Produto → Finalizar
# Estoque: Menu → Produtos → Ver Estoque por Loja
# Auditoria: Menu → Auditoria → Ver Movimentações

## Troubleshooting
# Erro de conexão Supabase?
# → Verificar NEXT_PUBLIC_SUPABASE_URL está correto

# Erro 403 na RLS?
# → Verificar usuário autenticado tem role "authenticated"
# → Verificar loja_id do usuário em tabela usuarios

# Porta 3000 já em uso?
# → npm run dev:web -- -p 3001
```

---

## Checklist Final: FASE 6

| Aspecto | Status | Ação |
|---------|--------|------|
| Clone repository | ✅ | Não precisa de auth especial |
| npm ci | ✅ | Workspaces funcionam |
| .env.example | ✅ | Presente em pdv-importados/ e pdv-local/ |
| Supabase link | ⚠️ | Precisa de documentação |
| Baseline aplicação | ✅ | supabase db reset funciona |
| Dev server rodando | ✅ | npm run dev:web funciona |
| Fluxos críticos | ⚠️ | Sem E2E automático, precisa teste manual |
| Documentação | ⚠️ | README.md existe, SETUP.md não |

---

## Aprovação FASE 6

**Status:** ⚠️ **CONDICIONAL**

Um novo dev CONSEGUE levantar o ambiente, MAS:
1. Precisa de suporte manual para Supabase setup
2. Precisa de documentação SETUP_DEV.md explícita
3. Precisa de E2E checklist para validar fluxos críticos

**Recomendação:** Criar `SETUP_DEV.md` antes de Passo 5 (reparação de schema_migrations).

---

## Próximo: FASE 7 (Evolução Futura)
