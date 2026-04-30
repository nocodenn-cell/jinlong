# Feature Flags - Plano de Simplificação (Abordagem B - Futuro)

**Objetivo:** Reduzir de 2 ambientes (staging/prod) para 1 ambiente com feature flags.

---

## Situação Atual vs Futuro

### Atual (Complexo)
```
staging (projeto separado) -> prod (projeto separado)
  - Deploy manual para cada ambiente
  - Configuração duplicada
  - Testes manuais em ambos
```

### Futuro (Simplificado)
```
main branch (único projeto) + feature flags
  - Deploy automático via preview/produção
  - Configuração única
  - Flags controlam funcionalidades
```

---

## Arquitetura Proposta

### 1. Sistema de Flags

```typescript
// lib/featureFlags/index.ts
interface FeatureFlags {
  // Funcionalidades
  etiquetasTermicas: boolean
  relatoriosAvancados: boolean
  fiscalNfce: boolean
  
  // Controle de deploy
  modoManutencao: boolean
  usuariosLimitados: boolean
  
  // Experimentos
  novoCheckout: boolean
  precoDinamico: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  etiquetasTermicas: true,      // Já implementado
  relatoriosAvancados: false,   // Em desenvolvimento
  fiscalNfce: false,           // Futuro
  modoManutencao: false,
  usuariosLimitados: false,
  novoCheckout: false,
  precoDinamico: false,
}
```

### 2. Storage das Flags

**Opção A: Supabase (Recomendado)**
```sql
CREATE TABLE feature_flags (
  id SERIAL PRIMARY KEY,
  flag_name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (flag_name, enabled, description) VALUES
('etiquetasTermicas', true, 'Etiquetas térmicas já implementadas'),
('relatoriosAvancados', false, 'Relatórios avançados em desenvolvimento'),
('fiscalNfce', false, 'Integração NFC-e futura');
```

**Opção B: Vercel Environment Variables**
```bash
NEXT_PUBLIC_FEATURE_ETIQUETAS=true
NEXT_PUBLIC_FEATURE_RELATORIOS=false
NEXT_PUBLIC_FEATURE_FISCAL=false
```

### 3. Hook de Flags

```typescript
// hooks/useFeatureFlags.ts
export function useFeatureFlags() {
  const { data: flags, loading } = useSWR<FeatureFlags>(
    '/api/feature-flags',
    fetcher,
    { revalidateOnFocus: false }
  )
  
  const isEnabled = useCallback((flag: keyof FeatureFlags) => {
    return flags?.[flag] ?? DEFAULT_FLAGS[flag]
  }, [flags])
  
  return { flags, loading, isEnabled }
}
```

### 4. API Endpoint

```typescript
// app/api/feature-flags/route.ts
export async function GET() {
  const flags = await getFeatureFlagsFromDb()
  return NextResponse.json(flags)
}
```

---

## Implementação por Fases

### Fase 1: Infraestrutura (1 semana)
1. Criar tabela `feature_flags`
2. Implementar hook `useFeatureFlags`
3. Criar endpoint `/api/feature-flags`
4. Painel admin para gerenciar flags

### Fase 2: Migração Funcionalidades (2 semanas)
1. Envolver componentes existentes com flags
2. Testar com flags ligadas/desligadas
3. Documentar flags existentes

### Fase 3: Simplificação Deploy (1 semana)
1. Eliminar ambiente staging
2. Deploy único para produção
3. Usar preview branches para testes

---

## Exemplos de Uso

### Componente com Flag
```typescript
// EtiquetasPage.tsx
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

export function EtiquetasPage() {
  const { isEnabled } = useFeatureFlags()
  
  if (!isEnabled('etiquetasTermicas')) {
    return <div>Funcionalidade indisponível</div>
  }
  
  return <EtiquetasPageImpl />
}
```

### Feature Toggle Rápido
```typescript
// admin/feature-flags/page.tsx
export async function toggleFlag(flagName: string) {
  await updateFlagInDb(flagName, !getCurrentValue(flagName))
  revalidateTag('feature-flags')
}
```

---

## Benefícios Esperados

### Imediatos
- **Zero configuração de staging**
- **Deploy único via GitHub Actions**
- **Testes em preview branches**

### Médio Prazo
- **Lançamentos seguros (dark launch)**
- **Rollback instantâneo**
- **A/B testing nativo**

### Longo Prazo
- **Multi-tenant via flags**
- **Experimentação contínua**
- **Onboarding de clientes controlado**

---

## Riscos e Mitigações

### Risco: Flags esquecidas
**Mitigação:** Dashboard de flags + alertas

### Risco: Performance
**Mitigação:** Cache com SWR + revalidate on demand

### Risco: Complexidade acidental
**Mitigação:** Limite de 10 flags ativas

---

## Cronograma

| Semana | Atividade |
|--------|-----------|
| 1 | Infraestrutura (tabela, hook, API) |
| 2 | Painel admin + documentação |
| 3-4 | Migração componentes existentes |
| 5 | Eliminação staging + deploy único |

---

## Próximos Passos

1. **Aprovar plano** com time
2. **Criar issue no GitHub** com tracking
3. **Começar Fase 1** na próxima sprint
4. **Documentar** decisões arquitetônicas

---

## Referências

- [LaunchDarkly Feature Flags](https://docs.launchdarkly.com/)
- [Vercel Edge Config](https://vercel.com/docs/edge-config)
- [React Feature Flags Best Practices](https://www.patterns.dev/posts/feature-flags)
