# P0: CRÍTICO — Implementar Cadastro de Funcionários

**Bloqueador Máximo** — Sem isso, gerente novo não consegue adicionar operadores  
**Status:** Plano de Implementação  
**Estimativa:** 4-8 horas (depende da arquitetura)

---

## Problema

Não existe interface para gerente cadastrar funcionários/operadores. Pesquisa confirmada:
- ❌ Não existe `/admin/funcionarios` ou similar
- ❌ Não existe `/gerente/funcionarios` 
- ❌ Não existe `CREATE TABLE funcionarios` no banco
- ❌ Não existe UI para CRUD de funcionários

Sem isso, impossível para gerente novo adicionar operadores → impede venda.

---

## Análise de Arquitetura Existente

### Estrutura Atual de Usuários

**Tabela:** `public.usuarios`

```sql
-- Campos observados nas migrations:
- id (UUID, PK, auth user)
- perfil (ENUM: 'OPERADOR', 'GERENTE', 'DONO', 'ADMIN')
- idioma_preferido
- full_name (assumido, em user_metadata)
- email (em auth.users)
- ativo (assumido)
```

**RLS Policy:** Perfis controlados por `usuarios.perfil`
- `OPERADOR` → Acesso PDV apenas
- `GERENTE` → Acesso admin + gerente
- `DONO` → Acesso macro (todas as lojas)
- `ADMIN` → Mesmo escopo GERENTE

### Decisão Arquitetural

**Option A: Reutilizar `usuarios` + criar relacionamento**
- Manter `usuarios` como identidade de login
- Criar tabela `funcionarios` com dados operacionais (nome, cargo, comissão, etc)
- Relacionamento: `funcionarios.usuario_id → usuarios.id`
- ✅ Mais flexível, permite múltiplos "cargos" por usuário
- ⚠️ Mais complexo

**Option B: Estender `usuarios` com campos operacionais**
- Adicionar colunas a `usuarios`: nome_funcionario, cargo, comissao, etc
- Simples mas menos flexível
- ⚠️ Risco de quebra de contrato existente

**Recomendação:** **Option A** (reutilizar + relacionamento)

---

## Plano de Implementação Mínimo

### Fase 1: Schema (Backend)

#### 1.1 Criar Migration: Tabela `funcionarios`

```sql
-- 20260711_001_criar_funcionarios.sql

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  
  -- Dados operacionais
  nome_exibicao VARCHAR(255) NOT NULL,
  cargo VARCHAR(100) NOT NULL DEFAULT 'operador',  -- 'operador', 'gerente', 'supervisor'
  email VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  
  -- Comissão (se aplicável)
  comissao_percentual DECIMAL(5, 2) DEFAULT NULL,  -- NULL = sem comissão
  comissao_fixa DECIMAL(10, 2) DEFAULT NULL,
  
  -- Status
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  data_admissao DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  criado_por UUID NOT NULL REFERENCES public.usuarios(id),
  
  CONSTRAINT funcionarios_ativo_check CHECK (ativo IN (TRUE, FALSE))
);

-- Índices
CREATE INDEX idx_funcionarios_loja_id ON public.funcionarios(loja_id);
CREATE INDEX idx_funcionarios_usuario_id ON public.funcionarios(usuario_id);
CREATE INDEX idx_funcionarios_ativo ON public.funcionarios(ativo);

-- RLS
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- Policy: Gerente pode ver/editar funcionários da sua loja
CREATE POLICY "funcionarios_gerente_select"
  ON public.funcionarios FOR SELECT
  USING (
    loja_id = (
      SELECT loja_id FROM public.usuarios 
      WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "funcionarios_gerente_insert"
  ON public.funcionarios FOR INSERT
  WITH CHECK (
    loja_id = (
      SELECT loja_id FROM public.usuarios 
      WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "funcionarios_gerente_update"
  ON public.funcionarios FOR UPDATE
  USING (
    loja_id = (
      SELECT loja_id FROM public.usuarios 
      WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );
```

#### 1.2 Criar RPC: `criar_funcionario`

```sql
CREATE OR REPLACE FUNCTION public.criar_funcionario(
  p_email VARCHAR,
  p_nome VARCHAR,
  p_cargo VARCHAR DEFAULT 'operador',
  p_comissao_percentual DECIMAL DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_usuario_id UUID;
  v_loja_id UUID;
  v_funcionario_id UUID;
BEGIN
  -- Validar que chamador é GERENTE
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  
  -- Obter loja_id do gerente
  SELECT loja_id INTO v_loja_id FROM public.usuarios
  WHERE id = v_usuario_id AND perfil IN ('GERENTE', 'DONO', 'ADMIN');
  
  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'Você não tem permissão para criar funcionários';
  END IF;
  
  -- TODO: Integração com auth.users para criar usuário Supabase
  -- Por agora, retornar estrutura esperada
  
  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Funcionário criado. (Integração Supabase pendente)',
    'funcionario_id', v_funcionario_id
  );
END;
$$;
```

---

### Fase 2: API (Backend)

#### 2.1 Server Action: `app/gerente/funcionarios/actions.ts`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import type { Mensagens } from '@/i18n/getMessages'

export async function listarFuncionarios(loja_id: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('loja_id', loja_id)
    .eq('ativo', true)
    .order('nome_exibicao')
  
  if (error) throw new Error(error.message)
  return data
}

export async function criarFuncionario(payload: {
  email: string
  nome: string
  cargo: 'operador' | 'gerente' | 'supervisor'
  comissao_percentual?: number
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  
  if (!user) throw new Error('Não autenticado')
  
  // Chamár RPC criado em 1.2
  const { data, error } = await supabase.rpc(
    'criar_funcionario',
    {
      p_email: payload.email,
      p_nome: payload.nome,
      p_cargo: payload.cargo,
      p_comissao_percentual: payload.comissao_percentual,
    }
  )
  
  if (error) throw new Error(error.message)
  return data
}

export async function ativarDesativarFuncionario(
  funcionario_id: string,
  ativo: boolean
) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('funcionarios')
    .update({ ativo })
    .eq('id', funcionario_id)
  
  if (error) throw new Error(error.message)
}
```

---

### Fase 3: UI (Frontend)

#### 3.1 Página: `/app/admin/funcionarios/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { listarFuncionarios } from './actions'
import { FuncionariosContent } from './_components/FuncionariosContent'

export default async function AdminFuncionariosPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.funcionarios,
    resource: `route:${ROUTES.admin.funcionarios}`,
  })
  
  const supabase = await createClient()
  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .maybeSingle()
  
  const funcionarios = await listarFuncionarios(loja?.id ?? '')
  
  return (
    <FuncionariosContent
      funcionarios={funcionarios}
      idioma={session.idioma}
    />
  )
}
```

#### 3.2 Componente: `FuncionariosContent.tsx`

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { FuncionariosTable } from './FuncionariosTable'
import { FuncionarioFormModal } from './FuncionarioFormModal'
import { useState } from 'react'

export function FuncionariosContent({ funcionarios, idioma }) {
  const [modalAberta, setModalAberta] = useState(false)
  
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1>Funcionários</h1>
        <Button onClick={() => setModalAberta(true)}>
          + Novo Funcionário
        </Button>
      </div>
      
      <FuncionariosTable funcionarios={funcionarios} />
      
      {modalAberta && (
        <FuncionarioFormModal
          open={modalAberta}
          onOpenChange={setModalAberta}
          onSalvar={(dados) => {
            // Chamar action, recarregar, fechar modal
          }}
        />
      )}
    </>
  )
}
```

---

## Dependências e Decisões

### ❓ Decisões Críticas

1. **Integração com Supabase Auth**
   - Como criar novo usuário Supabase desde o RPC?
   - Opção A: Management API de Supabase
   - Opção B: Usar admin API
   - Opção C: Gerente só cadastra, desenvolvedor ativa senha depois

2. **Vincular Comissão**
   - `funcionarios.comissao_percentual` vs tabela `comissoes` separada?
   - Dependência: Precisa saber como comissão é calculada atualmente

3. **Integração com Caixa**
   - `caixas.operador_id` → deve ser `funcionarios.usuario_id`?
   - Precisa validar schema existente de `caixas`

---

## Checklist de Implementação

### Backend

- [ ] Migration: Criar tabela `funcionarios`
- [ ] Migration: Criar índices + RLS policies
- [ ] RPC: `criar_funcionario`
- [ ] RPC: `listar_funcionarios`
- [ ] RPC: `atualizar_funcionario`
- [ ] RPC: `ativar_desativar_funcionario`
- [ ] Validação: Email único por loja?
- [ ] Auditoria: Registrar criação/mudança em tabela audit

### Frontend

- [ ] Page: `/app/admin/funcionarios`
- [ ] Component: `FuncionariosTable`
- [ ] Component: `FuncionarioFormModal`
- [ ] Integrações:
  - [ ] Caixa: Validar que operador_id existe em funcionarios
  - [ ] Comissões: Vincular funcionário a comissão
  - [ ] Auditoria: Mostrar quem fez operação

### Testes

- [ ] Gerente novo consegue criar funcionário ✅
- [ ] Funcionário criado consegue fazer login no PDV ✅
- [ ] Comissão é aplicada corretamente ✅
- [ ] Desativar funcionário impede login ✅

---

## Próximos Passos

1. **Validar decisões críticas** com arquiteto
2. **Implementar backend** (migrations + RPCs)
3. **Implementar frontend** (UI CRUD)
4. **Teste de integração** com PDV
5. **Validar com usuário real**

---

## Risco e Mitigação

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Integração Supabase Auth complexa | ALTO | Usar Management API ou admin SDK |
| Quebra de contrato em `usuarios` | MÉDIO | Criar tabela separada `funcionarios` |
| Performance em listas grandes | BAIXO | Índices em loja_id, ativo |
| RLS policies muito restritivas | MÉDIO | Teste com múltiplos perfis |

