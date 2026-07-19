# Template oficial de domínio internacionalizado

| Campo | Valor |
|--------|--------|
| **Status** | **Congelado** — modelo de referência |
| **Data** | 2026-07-18 |
| **Prova completa** | Domínio **customers** (Missões 5.1 + 5.3) |
| **ADRs** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md) |
| **Complementos** | [padrao_migracao_dominio.md](./padrao_migracao_dominio.md) · [padrao_consumo_i18n.md](./padrao_consumo_i18n.md) |
| **Escopo deste doc** | Template reutilizável — **não** inicia Products nem move código |

---

## 1. Por que este template existe

Customers é o **primeiro exemplo completo** da cadeia:

```
UI (locale-aware) → actions → adapters → policies/ports (shared-core) → Postgres
                         ↘ codes → catalog mapping → mensagem no locale
```

Products (e os demais) serão **maiores**. Sem congelar o padrão, cada domínio reabre decisões já pagas em customers.

**Uso:** copiar a estrutura e a ordem de missões; adaptar nomes e autoridade; **não** inventar segundo estilo.

---

## 2. Árvore canônica

```
<domínio>                          # ex.: customers | products | inventory
├── shared-core                    # @fastproduct/shared-core/src/<domínio>/
│   ├── types.ts                   # DTOs estáveis (sem I/O, sem SQL)
│   ├── contracts.ts               # ports: Reader | Writer | Updater | *Service
│   ├── errorCodes.ts              # códigos estáveis (domínio ≠ idioma)
│   ├── policies/                  # validate* · decide* (puros + specs)
│   └── index.ts                   # barrel público único
│
├── adapter                        # pdv-importados/app/admin/<rota-ssot>/
│   ├── <domínio>Reader.ts         # list + getById (view quando houver)
│   ├── <domínio>Writer.ts         # create
│   ├── <domínio>Updater.ts        # update (PR separado do Writer)
│   ├── <domínio>Exclusion.ts      # effects + service (se houver delete/LGPD)
│   └── actions.ts                 # auth + orquestra ports + revalidatePath
│
├── messages                       # borda — nunca no core “conhecer idioma”
│   ├── codes                      # errorCodes.ts no shared-core
│   ├── <domínio>Messages.ts       # CODE → chave de catálogo + fmtTemplate
│   └── catálogo app               # pt.json / zh.json (namespace existente)
│
└── UI                             # rota entity-ssot; locale-aware
    ├── page.tsx                   # getMessagesForLocaleInput(sessão)
    └── clients / modais           # props messages + locale (AppLocale)
```

### Mapa customers (referência viva)

| Camada | Path |
|--------|------|
| Core | `shared-core/src/customers/` |
| Codes | `shared-core/src/customers/errorCodes.ts` |
| Adapters | `pdv-importados/app/admin/clientes/customer{Reader,Writer,Updater,Exclusion}.ts` |
| Messages | `pdv-importados/app/admin/clientes/customerMessages.ts` |
| Actions | `pdv-importados/app/admin/clientes/actions.ts` |
| UI SSoT | `pdv-importados/app/admin/clientes/page.tsx` |
| Facade legado | `app/gerente/clientes/actions.ts` (reexport; não remover cedo) |

---

## 3. Responsabilidades por camada

| Camada | Faz | Não faz |
|--------|-----|---------|
| **types** | Shapes de input/row/enums | Nomes de tabela, React, Supabase |
| **contracts** | Ports + comandos/resultados tipados | Implementação I/O |
| **policies** | Validação / decisão; `code` + `error` PT legado (compat) | Locale, cookies, `revalidatePath` |
| **errorCodes** | Constantes `DOMINIO_*` estáveis | Strings traduzidas |
| **Reader/Writer/…** | I/O + map coluna↔DTO; chama policy do core | JSX; ramificar `if (zh)` |
| **\*Messages (borda)** | `code` → `tApp` / catálogo; interpola `{{params}}` | Regras de negócio |
| **actions.ts** | `assert*Session` → port → `localize*Failure` → revalidate | Policy embutida sem teste no core |
| **UI** | Consome `messages` + `locale`; dispara actions | Supabase direto; literais de fluxo novo |

### Fluxo runtime

```
┌──────────────────────────────────────────────────────────────┐
│ UI (entity-ssot)                                             │
│ getMessagesForLocaleInput → messages + locale                │
│ labels do catálogo · toasts com string já resolvida          │
└────────────────────────────┬─────────────────────────────────┘
                             │ Server Action
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ actions.ts (borda)                                           │
│ auth · idioma da sessão · localize*Failure(code)             │
└────────────────────────────┬─────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Reader          Writer         ExclusionService
              │              │              │
              │              ▼              ▼
              │         validate*      decide*
              │         (core)         (core)
              ▼              │              │
         Postgres ◄──────────┴──────────────┘
         (tabelas · views · RLS · RPCs — autoridade real)
```

---

## 4. Messages: codes + catalog mapping

### 4.1 Regra

```
Domínio  →  "o que falhou"     → CustomerErrorCode + params?
Borda    →  "como dizer isso"  → CODE_TO_KEY → tApp(idioma, key)
UI       →  "onde mostrar"     → toast / alert (string pronta)
```

Nenhum domínio **conhece idioma** (ADR-005 §6).

### 4.2 Contrato de resultado (padrão)

```ts
// Falha de mutação — adapters / actions
| { ok: false; error: string; code?: DomainErrorCode; params?: { … } }

// Policy de validação
| { ok: false; code: DomainErrorCode; error: string }  // error = PT legado p/ specs
```

- **`code`:** obrigatório em falhas de domínio novas.  
- **`error`:** string PT congelada enquanto houver testes legado / callers antigos.  
- **Action:** se `code` → `localize*Failure`; se só infra (Postgres) → passa `error` cru.

### 4.3 Mapping na borda (espelho customers)

```ts
// app/admin/<domínio>/<domínio>Messages.ts
const CODE_TO_KEY: Record<DomainErrorCode, string> = {
  PRODUCT_NAME_INVALID: 'produtos.err_nome_invalido',
  // …
}

resolveDomainMessage(idioma, code, params?)
localizeDomainFailure(idioma, result)  // → { ok: false; error: string }
```

Chaves novas: **paridade PT + ZH** no mesmo PR. Fallback `en-US` → pt-BR via núcleo i18n.

Detalhe de consumo UI: [padrao_consumo_i18n.md](./padrao_consumo_i18n.md).

---

## 5. UI locale-aware

### Obrigatório em rota SSoT nova ou tocada

1. Server Component: `getMessagesForLocaleInput(session.idioma)` (não `getMessages` solto em código novo).  
2. Passar `{ messages, locale, legacyIdioma? }` aos clients.  
3. `data-locale={locale}` no wrapper da página quando útil.  
4. Labels/toasts/erros de fluxo via catálogo ou string já resolvida na action.  
5. Formatting novo: `@shared-core/src/formatting` (não `toLocaleString` ad hoc).

### Proibido

- `if (idioma === 'zh')` para copy  
- Segundo dicionário inline no componente  
- next-intl / prefixo de URL (DEC-007) sem ADR  
- Mover JSON para shared-core “de passagem”

### Legado

Pasta `gerente/<domínio>` pode reexportar actions e hospedar clients 1–2 releases. **Não** expandir CRUD novo em gerente — entity-ssot aponta `/admin/*`.

---

## 6. Autoridade: Postgres vs TypeScript

O template **exige** inventário de autoridade **antes** de extrair código.

| Tipo de regra | Onde mora a verdade | No contrato do domínio |
|---------------|---------------------|------------------------|
| Cálculo / invariante no DB | RPC, trigger, generated column | Port documenta “delegado a RPC X”; **não** reimplementar em TS |
| Validação de formulário / LGPD / gating UI | Policy pura no core | `validate*` / `decide*` + codes |
| Persistência | Adapter | Map DTO ↔ colunas; sem regra de preço/estoque inventada |
| Mensagem ao usuário | Borda i18n | codes → catálogo |

**Exemplo crítico (Products):** preço tem autoridade em Postgres (`calcular_preco_produto`), **não** no TypeScript. O contrato de products deve declarar isso explicitamente — qualquer helper TS é no máximo espelho/read-model, nunca segunda calculadora.

Checklist no inventário (missão 0):

- [ ] Lista de RPCs que são SSoT de regra  
- [ ] Lista do que **pode** ser policy TS (validação de input, decisões sem I/O)  
- [ ] Lista do que **não** pode ser reescrito em TS (preço, estoque atômico, etc.)

---

## 7. Ordem de missões (obrigatória)

Não pular. Especialmente em Products.

| Fase | Nome | Entrega | Código de produto? |
|------|------|---------|-------------------|
| **0** | Inventário e autoridade | Tabelas, RPCs, writers, callers, entity-ssot, **quem calcula o quê** | Docs (+ guard se preciso) |
| **1** | ADR do domínio | Fronteiras, ports alvo, o que fica no Postgres | Doc |
| **2** | Domínio puro | `types` + `contracts` + `policies` + `errorCodes` + specs | Sim — sem wire app (ou mínimo) |
| **3** | Contratos fechados | Doc de adapters (Reader/Writer/…) | Doc |
| **4** | Reader | Listagem (+ `getById` se pós-write precisar de view) | Sim |
| **5** | Writer → Updater → Exclusion | Uma mutação por PR | Sim |
| **6** | i18n na borda | `*Messages` + actions localizam + page `catalogAdapter` | Sim |
| **7** | Facade legado | `gerente/*` reexporta | Sim |
| **8** | Colocation UI | Opcional; sem redesign | Sim |

### Regra de ouro

```
inventário → ADR → contratos → código → i18n na borda
```

**Não** começar por CRUD de tela. **Não** mover telas na fundação.

Detalhe de fatiamento CRUD: [padrao_migracao_dominio.md](./padrao_migracao_dominio.md) §4–5.

---

## 8. Sequência de domínios (plataforma)

| Ordem | Domínio | Pasta core | UI SSoT | Nota |
|------:|---------|------------|---------|------|
| ✅ | **customers** | `customers/` | `/admin/clientes` | Modelo completo (este template) |
| 1 | **products** | `products/` | `/admin/catalogo` | Começar pela missão 0 (abaixo) |
| 2 | **inventory** | `inventory/` | `/admin/estoque` | Estoque ≠ cadastro de produto |
| 3 | **cash** | `cash/` | caixa / fechamento | Após inventory estável |
| 4 | **sales / PDV** | `sales/` (+ pdv) | `/caixa` | Maior acoplamento — por último |

Satélites (fornecedores, taxonomias) podem intercalarse se o inventário mostrar baixo risco — **não** furar a fila de Products sem missão explícita.

---

## 9. Próximo domínio: Products — Missão 0

### Missão Products 0 — Inventário e autoridade

**Objetivo:** mapear o terreno **sem** extrair CRUD e **sem** mover telas.

**Mapear obrigatoriamente:**

| Área | Perguntas |
|------|-----------|
| Tabelas | `produtos`, preços, imagens, vínculos categoria/marca/fornecedor, códigos de barras / GTIN |
| RPCs | create com estoque inicial, listagens filtradas, **`calcular_preco_produto`**, demais mutações |
| Writers | Quais actions/adapters escrevem hoje? Quem é dono? |
| Preços | Onde a autoridade mora? (esperado: **Postgres**) |
| Estoque inicial | RPC atômica vs round-trips; entity-ssot / mig 270 |
| Imagens | Storage vs colunas; quem sobe/apaga |
| Categorias / marcas | CRUD próprio vs embed no produto |
| Fornecedores | Link vs cadastro inline legado (`FornecedorCombobox`) |
| Códigos de barras | Lookup PDV × admin; variantes de chave |

**Entregáveis sugeridos:**

1. Doc `docs/architecture/inventario_products.md` (ou equivalente)  
2. Matriz **autoridade** (Postgres vs TS vs UI)  
3. Lista de callers (admin, PDV, sync, financeiro)  
4. GO/NO-GO para Missão Products 1 (ADR)

**Fora da Missão 0:**

- Mover código para `shared-core/src/products`  
- Alterar schema / RPC  
- Redesign de `/admin/catalogo`  
- next-intl  

### Depois da Missão 0 (orientação)

```
Products 0  inventário + autoridade
    ↓
Products 1  ADR products (fronteiras + ports + “preço = RPC”)
    ↓
Products 2+ types/contracts/policies → Reader → Writer… → i18n borda
```

Este template **autoriza o formato**; **não** autoriza iniciar Products 0 até missão explícita do time (pode ser a próxima).

---

## 10. Checklist de kickoff (copiar por domínio)

### Missão 0

- [ ] Tabelas + RPCs + writers mapeados  
- [ ] Autoridade Postgres vs TS explícita (itens que **não** reimplementar)  
- [ ] UI SSoT e entity-ssot confirmados  
- [ ] Callers cross-domínio listados  
- [ ] Sem mudança de schema “já que estamos aqui”

### Ao criar pasta no core

- [ ] `types` + `contracts` + `policies` + `errorCodes` + `index`  
- [ ] Specs das policies (comportamento legado congelado)  
- [ ] `DOMAIN_DIRS` / `guard:domain` atualizado  
- [ ] Zero import de `app/` no core  

### Ao ligar a borda

- [ ] Adapters sob `app/admin/<ssot>/`  
- [ ] Actions finas + `localize*Failure`  
- [ ] Page com `getMessagesForLocaleInput`  
- [ ] Chaves PT/ZH paritárias  
- [ ] Facade `gerente/*` se necessário — sem apagar UI legado no mesmo PR  

### Aceite

- [ ] Comportamento observável idêntico  
- [ ] Policies no caminho quente  
- [ ] Domínio não conhece idioma  
- [ ] Regras de autoridade DB respeitadas  

---

## 11. Anti-padrões (não repetir em Products)

| Anti-padrão | Por quê |
|-------------|---------|
| Começar pelo modal CRUD | Pula inventário; perde autoridade de preço/estoque |
| Recalcular preço em TypeScript | Viola SSoT Postgres |
| Domínio retorna frase no locale do user | Quebra i18n / ADR-005 |
| Big-bang: types+writer+UI+i18n num PR | Review inviável; rollback opaco |
| Segundo pacote / `modules/shared` | Dois núcleos |
| Remover `gerente/*` no PR do Writer | Quebra imports; usar facade |
| Instalar next-intl “só no catálogo” | Dual stack; DEC-007 |
| Tratar inventory como submódulo de products na mesma missão | Fronteiras diferentes (entity-ssot) |

---

## 12. GO / NO-GO

| Critério | Status |
|----------|--------|
| Customers completo como prova (core + adapters + i18n + UI) | OK |
| Árvore e ordem de missões documentadas | OK |
| Autoridade Postgres destacada para Products | OK |
| Iniciar extração Products / mover telas neste doc | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Adotar este arquivo como **template oficial** dos próximos domínios | **GO** |
| Sequência customers → products → inventory → cash → sales | **GO** (orientação) |
| Pular Missão 0 de Products e ir direto a CRUD | **NO-GO** |
| Reimplementar `calcular_preco_produto` em TS | **NO-GO** |

---

## Referências

- Spike / contratos customers: [customers_contracts_adapters.md](./customers_contracts_adapters.md)  
- Migração fatiada: [padrao_migracao_dominio.md](./padrao_migracao_dominio.md)  
- Consumo i18n: [padrao_consumo_i18n.md](./padrao_consumo_i18n.md)  
- Inventário frontend: [inventario_frontend_boundary.md](./inventario_frontend_boundary.md)  
- Entity-ssot: regra de workspace (produto → `/admin/catalogo`)  

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Template oficial de domínio internacionalizado (modelo customers) | 2026-07-18 |
