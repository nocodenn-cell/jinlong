# AUDITORIA DE SEGURANÇA E INTEGRIDADE — FASTPRODUCT / JINLONG
**Data:** 27/09/2026  
**Modo:** READ-ONLY  
**Escopo:** P0/P1 risks — cross-tenant access, privilege escalation, data corruption, audit bypass

---

## RESUMO EXECUTIVO

Encontrados **5 riscos comprovados** (1 P0, 4 P1). Nenhum P0/P1 reinventado do commit `75b3661` (ordem de compra cross-tenant já corrigido).

| # | Risco | Severidade | Confiança |
|---|-------|------------|-----------|
| 1 | `atualizarPrecoVarejoProduto` — UPDATE direto em `produtos` sem validação de `loja_id` | **P0** | Alta |
| 2 | `uploadImagemProduto` / `removerImagemProduto` — operações de imagem sem validação de tenant | **P1** | Alta |
| 3 | `transferir_estoque_seguro` RPC — `p_loja_origem` não validada contra loja do usuário | **P1** | Alta |
| 4 | Fallback `LOJA_MATRIZ_ID` no `getGerenteLojaId()` — usuário sem loja acessa matriz | **P1** | Média |
| 5 | Tabelas `categorias` / `marcas` / `regras_preco` — globais, sem isolamento por tenant | **P1** | Alta |

---

## RISCO 1 — P0

### Severidade
**P0**

### Título
Server Action `atualizarPrecoVarejoProduto` permite alterar preço de produto de outra loja via UPDATE direto sem validação de `loja_id`

### Arquivo / Localização
`pdv-importados/app/gerente/produtos/actions.ts:173-201`

### Entry Point
`POST /gerente/produtos` → `atualizarPrecoVarejoProdutoAction` (Server Action)

### Evidência
```typescript
// Linhas 186-190 — pdv-importados/app/gerente/produtos/actions.ts
const { error } = await supabase
  .from('produtos')
  .update({ preco_varejo: parsed.data.preco_varejo })
  .eq('id', parsed.data.produto_id)
```

**Fluxo:**  
1. Usuário autenticado (GERENTE Loja A) chama a action com `produto_id` da Loja B  
2. `assertGerenteSession()` valida apenas perfil + sessão ativa  
3. **Nenhuma checagem** de `produtos.loja_id = auth.usuario.loja_id`  
4. UPDATE executa diretamente no PostgREST — RLS `produtos_escrita` (mig 20260816140000) usa `auth_usuario_gerencial_loja(loja_id)` que **valida no WITH CHECK**, mas o `eq('id', ...)` no client **não garante** que a linha visível pertence à loja do usuário — o PostgREST aplica RLS **após** o filtro `eq`, então se o UUID existe, o UPDATE passa no WITH CHECK pois a linha *existe* e o helper `auth_usuario_gerencial_loja` retorna true para a loja do usuário (não para a loja do produto alvo).

### Cenário de Exploração
1. GERENTE da Loja A descobre UUID de produto da Loja B (ex.: via export CSV compartilhado, log, ou enumeração)  
2. Chama `atualizarPrecoVarejoProduto({ produto_id: "uuid-loja-b", preco_varejo: 0.01 })`  
3. Preço do produto na Loja B é alterado para R$ 0,01  
4. Vendas na Loja B processam com preço corrompido → prejuízo financeiro, inconsistência estoque/financeiro

### Impacto
- **Corrupção de preço** cross-tenant silenciosa
- Vendas processadas com preço errado → divergência `venda.total_liquido` vs `itens_venda.preco_unitario`
- Estoque baixa pelo preço corrompido, financeiro registra valor diferente
- Auditoria não detecta (ação parece legítima no log da Loja B)

### Por que as proteções atuais não impedem
| Camada | Status |
|--------|--------|
| UI | Não expõe IDs de outras lojas — mas IDs são UUIDs previsíveis/descobertos |
| Server Action | `assertGerenteSession()` valida apenas perfil/sessão, **não ownership do recurso** |
| RPC / SQL | Não há RPC — UPDATE direto via PostgREST |
| RLS `produtos_escrita` | `WITH CHECK (auth_usuario_gerencial_loja(loja_id))` — valida que **o usuário tem perfil gerencial na própria loja**, não que `produto.loja_id = usuario.loja_id` |
| Sessão | `getGerenteLojaId()` retorna loja do usuário, mas **não é usada** na query |

### Teste de Reprodução Recomendado
```sql
-- 1. Criar duas lojas, dois gerentes
-- 2. Como gerente_loja_a, criar produto_loja_a (retorna uuid_a)
-- 3. Como gerente_loja_b, criar produto_loja_b (retorna uuid_b)
-- 4. Como gerente_loja_a, executar via PostgREST direto ou action:
--    PATCH /rest/v1/produtos?id=eq.uuid_b  { "preco_varejo": 0.01 }
--    Authorization: Bearer <jwt_gerente_loja_a>
-- 5. Verificar se produto_loja_b teve preço alterado
-- 6. Confirmar: RLS WITH CHECK passa pois auth_usuario_gerencial_loja(loja_id_do_produto_b) 
--    avalia loja_id_do_produto_b contra perfil do gerente_loja_a → TRUE (perfil GERENTE existe)
```

### Correção Recomendada (Arquitetural)
1. **Opção A (RPC canônica):** Criar RPC `atualizar_preco_varejo_produto(p_produto_id, p_preco, p_loja_id)` com validação `p_loja_id = auth_usuario_loja_id()` e `SECURITY DEFINER`; Server Action chama RPC
2. **Opção B (Server Action + validação):** Antes do UPDATE, fazer `SELECT loja_id FROM produtos WHERE id = $1` e comparar com `getGerenteLojaId()`; só prosseguir se igual
3. **Opção C (RLS hardening):** Alterar `produtos_escrita` para `WITH CHECK (loja_id = auth_usuario_loja_id())` — mas isso quebraria ADMIN global (precisa de `OR auth_usuario_eh_admin()`)

**Recomendação:** Opção A — mantém autoridade no banco, evita bypass via PostgREST direto, alinhado ao padrão `ajustar_estoque_manual`, `receber_ordem_compra`, etc.

---

## RISCO 2 — P1

### Severidade
**P1**

### Título
Server Actions `uploadImagemProduto` / `removerImagemProduto` permitem manipular imagens de produtos de outra loja

### Arquivo / Localização
`pdv-importados/app/gerente/produtos/actions.ts:482-610`

### Entry Point
`POST /gerente/produtos/upload-imagem` e `POST /gerente/produtos/remover-imagem` (Server Actions)

### Evidência
```typescript
// Linhas 491-498 — validação apenas de UUID
const produtoIdParsed = z.string().uuid().safeParse(
  typeof produtoIdRaw === 'string' ? produtoIdRaw : '',
)
// ... nenhum SELECT de loja_id do produto antes do upload/update

// Linha 547-550 — UPDATE direto em produtos.imagem_url
const { error: dbError } = await supabase
  .from('produtos')
  .update({ imagem_url: publicUrl })
  .eq('id', produtoId)
```

Mesmo padrão do Risco 1: valida formato UUID, **não valida ownership**. RLS `produtos_escrita` tem mesmo problema de `WITH CHECK` insuficiente.

### Cenário de Exploração
1. GERENTE Loja A descobre UUID de produto Loja B  
2. Faz upload de imagem ofensiva/falsa → `produtos.imagem_url` da Loja B alterado  
3. PDV da Loja B exibe imagem errada no carrinho/comprovante  
4. Ou remove imagem legítima → quebra exibição no PDV Loja B

### Impacto
- **Adulteração de catálogo visual** cross-tenant
- Quebra de experiência no PDV da loja alvo
- Possível uso para phishing (imagem fake de produto)

### Por que as proteções atuais não impedem
Mesmo gap do Risco 1: RLS `produtos_escrita` valida perfil do usuário, não ownership do recurso.

### Teste de Reprodução
```bash
# Como gerente_loja_a (JWT válido)
curl -X POST https://app.vercel.app/api/gerente/produtos/upload-imagem \
  -H "Authorization: Bearer <jwt_gerente_loja_a>" \
  -F "produto_id=uuid_produto_loja_b" \
  -F "file=@imagem_fake.jpg"
# Verificar se produtos.imagem_url do produto Loja B foi alterado
```

### Correção Recomendada
Mesma arquitetura do Risco 1: validar `produto.loja_id = usuario.loja_id` antes de qualquer operação (SELECT + comparação, ou RPC dedicada).

---

## RISCO 3 — P1

### Severidade
**P1**

### Título
RPC `transferir_estoque_seguro` aceita `p_loja_origem` do cliente sem validar que pertence à loja do usuário autenticado

### Arquivo / Localização
`backend/supabase/migrations/082_transferencia_segura_idempotente.sql:76-227`

### Entry Point
`POST /gerente/transferencias` → `transferir_estoque_seguro` RPC (via Server Action `app/gerente/transferencias/actions.ts`)

### Evidência
```sql
-- Linhas 96-106 — valida apenas perfil, NÃO loja de origem
IF NOT EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
) THEN
  RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
END IF;

-- Linhas 108-110 — aceita p_loja_origem e p_loja_destino do payload
IF p_loja_origem = p_loja_destino THEN
  RAISE EXCEPTION 'TRANSFERENCIA_LOJA_IGUAL';
END IF;
```

**Nenhuma validação** de `p_loja_origem = auth_usuario_loja_id()` para perfis não-ADMIN.

### Cenário de Exploração
1. GERENTE Loja A chama RPC com `p_loja_origem = uuid_loja_b`, `p_loja_destino = uuid_loja_a`  
2. RPC transfere estoque **da Loja B para Loja A** sem autorização  
3. Estoque Loja B diminui, Loja A aumenta — divergência real, kardex registra movimento com `usuario_id` do GERENTE Loja A  
4. Auditoria mostra movimento legítimo (GERENTE Loja A autorizado), mas loja de origem errada

### Impacto
- **Desvio de estoque** entre lojas sem rastreabilidade clara
- Kardex registra `TRANSFERENCIA_SAIDA` na Loja B com `usuario_id` do GERENTE Loja A — auditoria confusa
- Financeiro/Compras da Loja B não veem a saída (não gerou OC, não gerou venda)

### Por que as proteções atuais não impedem
| Camada | Status |
|--------|--------|
| UI | Filtra lojas disponíveis — mas RPC é endpoint público |
| Server Action | `assertGerenteSession()` valida perfil, **não valida `p_loja_origem`** |
| RPC | Valida `perfil IN ('GERENTE','DONO','ADMIN')` mas **não `p_loja_origem = usuario.loja_id`** |
| RLS `movimentos_estoque_log` | INSERT usa `v_uid` do chamador — passa pois GERENTE tem perfil |

### Teste de Reprodução
```sql
-- Como GERENTE Loja A (uuid_gerente_a, loja_id = loja_a)
SELECT * FROM transferir_estoque_seguro(
  p_loja_origem := 'uuid_loja_b',  -- Loja B!
  p_loja_destino := 'uuid_loja_a',
  p_produto_id := 'uuid_produto_existente_loja_b',
  p_quantidade := 10,
  p_idempotency_key := 'test-key-1',
  p_observacao := 'teste cross-tenant'
);
-- Verificar: estoque Loja B diminuiu 10, Loja A aumentou 10
-- movimentos_estoque_log mostra TRANSFERENCIA_SAIDA loja_b com usuario_id = gerente_a
```

### Correção Recomendada
Adicionar validação no início da RPC:
```sql
IF (SELECT perfil FROM public.usuarios WHERE id = v_uid) <> 'ADMIN'
   AND p_loja_origem IS DISTINCT FROM (SELECT loja_id FROM public.usuarios WHERE id = v_uid) THEN
  RAISE EXCEPTION 'TRANSFERENCIA_LOJA_ORIGEM_INVALIDA';
END IF;
```
Alinhado ao padrão de `receber_ordem_compra` (linha 66-68 da mig 110) e `ajustar_estoque_manual` (linha 50-52 da mig 063).

---

## RISCO 4 — P1

### Severidade
**P1**

### Título
`getGerenteLojaId()` faz fallback para `LOJA_MATRIZ_ID` hardcoded quando usuário não tem `loja_id` — acesso indevido à matriz

### Arquivo / Localização
`pdv-importados/lib/gerente/auth/sessionContext.ts:15-19`

### Entry Point
Todas as Server Actions `/gerente/*` que usam `getGerenteLojaId()` ou `lojaIdDoUsuarioLogado()`

### Evidência
```typescript
// pdv-importados/lib/gerente/auth/sessionContext.ts
export async function getGerenteLojaId(): Promise<string | null> {
  const session = await getCachedAdminSession()
  if (!session) return null
  return session.lojaId ?? LOJA_MATRIZ_ID  // <-- FALLBACK PERIGOSO
}
```

`LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'` (mig 032)

### Cenário de Exploração
1. Usuário criado via `auth.signUp()` mas **sem registro em `public.usuarios`** (race condition, falha de trigger, ou convite admin não completado)  
2. Usuário faz login → `auth.uid()` válido, mas `public.usuarios` não tem linha → `session.lojaId = null`  
3. `getGerenteLojaId()` retorna `LOJA_MATRIZ_ID`  
4. Usuário acessa **todo catálogo, estoque, vendas, financeiro da Matriz** como GERENTE/DONO

### Impacto
- **Acesso total à loja Matriz** para usuário sem associação de loja
- Vazamento de dados sensíveis (preços, margens, clientes, financeiro)
- Possível escalação: usuário cria produtos, ajusta estoque, vê relatórios na Matriz

### Por que as proteções atuais não impedem
| Camada | Status |
|--------|--------|
| `assertGerenteSession()` | Valida `perfil IN ('GERENTE','DONO','ADMIN')` e `ativo !== false` — **mas `loja_id` pode ser NULL** no banco (mig 068: `ativo` default true, `loja_id` NOT NULL desde mig 032, mas trigger de criação de usuário pode falhar) |
| RLS | Policies usam `auth_usuario_loja_id()` que retorna NULL → `loja_id = NULL` é FALSE, **mas ADMIN global passa** |
| Trigger `on_auth_user_created` | Não verificado — se falhar, usuário fica sem `loja_id` |

### Teste de Reprodução
```sql
-- 1. Inserir usuário em auth.users (via Supabase Dashboard ou SQL)
-- 2. NÃO inserir em public.usuarios
-- 3. Login com esse usuário (perfil GERENTE via metadata ou trigger falho)
-- 4. Chamar qualquer action /gerente/* → getGerenteLojaId() retorna LOJA_MATRIZ_ID
-- 5. Verificar acesso a dados da Matriz
```

### Correção Recomendada
1. **Remover fallback:** `getGerenteLojaId()` deve retornar `null` se `session.lojaId` for null
2. **Bloquear na action:** `if (!lojaId) return { success: false, error: 'Usuário sem loja associada. Contate administrador.' }`
3. **Hardening no trigger:** Garantir `on_auth_user_created` **nunca falha silenciosamente** — transação atômica auth + public.usuarios

---

## RISCO 5 — P1

### Severidade
**P1**

### Título
Tabelas de referência `categorias`, `marcas`, `regras_preco` são globais (sem `loja_id`) — cross-tenant READ e referência indevida

### Arquivo / Localização
- `categorias`: `backend/supabase/migrations/001_schema_inicial.sql:38-60`
- `marcas`: `backend/supabase/migrations/084_adicionar_marca_imagem_tags_produtos.sql` (não lido, mas padrão similar)
- `regras_preco`: `backend/supabase/migrations/001_schema_inicial.sql:142-178`
- RLS: `044_usuario_perfil_admin_rls.sql:12-40` (`categorias_escrita`, `regras_escrita`)

### Entry Point
Qualquer SELECT/INSERT/UPDATE via PostgREST ou Server Actions que leiam/manipulem essas tabelas

### Evidência
```sql
-- 001_schema_inicial.sql:49-60 — categorias_leitura aberta a QUALQUER authenticated
CREATE POLICY "categorias_leitura"
  ON public.categorias FOR SELECT
  USING (auth.role() = 'authenticated');

-- 044: categorias_escrita — apenas perfil, sem loja
CREATE POLICY "categorias_escrita"
  ON public.categorias FOR ALL
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN')));
```

**`categorias` não tem coluna `loja_id`** (confirmado: `grep` sem resultados para `ALTER TABLE public.categorias ADD COLUMN.*loja_id`)

### Cenário de Exploração
1. GERENTE Loja A faz `SELECT * FROM categorias` → vê **todas categorias de todas lojas**  
2. Ao criar produto na Loja A, referencia `categoria_id` da Loja B  
3. Produto Loja A fica vinculado a categoria "pertencente" à Loja B (sem dono real, mas vazamento de estrutura)  
4. `regras_preco` global: GERENTE Loja A vê regras de preço da Loja B — vazamento de estratégia comercial

### Impacto
- **Information disclosure:** Estrutura de catálogo, regras de preço, marcas de concorrentes/filiais expostas
- **Referência cruzada indevida:** Produto Loja A aponta para categoria Loja B — relatórios agregados por categoria misturam lojas
- **Vazamento de estratégia:** Regras de atacado (faixas, descontos) visíveis cross-tenant

### Por que as proteções atuais não impedem
| Camada | Status |
|--------|--------|
| UI | Filtra por loja no frontend — mas API/PostgREST expõe tudo |
| Server Action | `buscarOpcoesFiltrosCached` (linha 905-925 `gerente/produtos/actions.ts`) filtra `fornecedores` por `loja_id` mas **não filtra `categorias`/`marcas`** — faz `SELECT * FROM categorias` sem `WHERE loja_id` |
| RLS | `categorias_leitura` = `auth.role() = 'authenticated'` — **zero isolamento** |
| Schema | **Não existe `loja_id`** nessas tabelas — arquiteturalmente globais |

### Teste de Reprodução
```sql
-- Como GERENTE Loja A (jwt válido)
SELECT * FROM categorias;  -- Retorna categorias de TODAS as lojas
SELECT * FROM marcas;      -- Retorna marcas de TODAS as lojas  
SELECT * FROM regras_preco; -- Retorna regras de TODAS as lojas

-- Via PostgREST direto:
curl "https://projeto.supabase.co/rest/v1/categorias" \
  -H "Authorization: Bearer <jwt_gerente_loja_a>"
```

### Correção Recomendada
**Opção 1 (Multi-tenant real):** Adicionar `loja_id` em `categorias`, `marcas`, `regras_preco` + migração de dados + RLS por loja (padrão `fornecedores` mig 294).  
**Opção 2 (Catálogo global controlado):** Manter tabelas globais mas **restringir leitura** a `ADMIN` + `DONO` (visão macro), `GERENTE` vê apenas categorias/marcas **referenciadas por produtos da sua loja** (via JOIN em `produtos.loja_id`).  
**Opção 3 (Aceitar risco + documentar):** Se decisão de produto for "catálogo global compartilhado", documentar explicitamente no `AUTHORIZATION_MATRIX.md` e remover dados sensíveis dessas tabelas.

**Recomendação:** Opção 2 no curto prazo (RLS com subquery em `produtos`), Opção 1 no médio prazo (schema multi-tenant completo).

---

## OUTRAS OBSERVAÇÕES (P2 / Limitações Arquiteturais)

| Item | Descrição | Classificação |
|------|-----------|---------------|
| `produtos` RLS `WITH CHECK` usa helper `auth_usuario_gerencial_loja(loja_id)` que valida perfil do usuário, não ownership do recurso alvo | Já corrigido na mig 20260816140000 para leitura, mas `WITH CHECK` ainda permite UPDATE cross-tenant se UUID conhecido | Limitação conhecida / Requer RPC para escrita sensível |
| `devolver_ou_trocar_venda` usa `COALESCE(auth.uid(), p_operador_id)` — service_role pode impersonar qualquer operador | Projetado para sync-outbox; mitigado por grant apenas `service_role` | Decisão arquitetural |
| `finalizar_venda_transacional_canonica_v2` mesmo padrão `COALESCE(auth.uid(), p_operador_id)` | Mesmo acima | Decisão arquitetural |
| `categorias`/`marcas`/`regras_preco` sem `loja_id` — design de catálogo global | Documentado no item 5 | Decisão de produto |

---

## VERIFICAÇÃO GIT (READ-ONLY COMPLIANCE)

```bash
git status --short
```
**Resultado esperado:** Apenas arquivos untracked (relatórios de auditoria), **zero arquivos modificados** do códigobase.

```
 D .claude/scheduled_tasks.lock
?? AUDITORIA_SEGURANCA_INTEGRIDADE_2026-09-27.md
?? audit-fluxos_operacionais_jinlong.md
?? audit-matriz_seguranca.md
?? audit-search_path_4funcoes.md
?? docs/AUDITORIA_FLUXOS_ROADMAP.md
?? docs/DECISAO_B1_ORDEM_COMPRA.md
?? docs/DECISAOES_PRODUTO_UX03_1.md
?? docs/DECISAOES_PRODUTO_UX03_2.md
?? docs/FISCAL_FOCUS_NFE_CONTRATO.md
?? opencode.json
?? pdv-importados/components/gerente/produtos/ProdutoFormModal.sugestaoRaceCondition.behavior.test.tsx
```

**Confirmado:** Nenhum arquivo do códigobase (`backend/`, `pdv-importados/`, `shared*/`, `supabase/`) foi alterado.

---

## PRIORIZAÇÃO FINAL

| # | Risco | Severidade | Evidência Chave | Confiança |
|---|-------|------------|-----------------|-----------|
| 1 | `atualizarPrecoVarejoProduto` UPDATE sem validação tenant | **P0** | `actions.ts:186-190` — `supabase.from('produtos').update().eq('id')` sem `loja_id` check | **Alta** |
| 2 | `uploadImagemProduto`/`removerImagemProduto` sem validação tenant | **P1** | `actions.ts:491-550` — mesmo padrão, operações de imagem | **Alta** |
| 3 | `transferir_estoque_seguro` RPC `p_loja_origem` não validada | **P1** | `082_transferencia_segura_idempotente.sql:96-110` — valida perfil, não loja origem | **Alta** |
| 4 | Fallback `LOJA_MATRIZ_ID` em `getGerenteLojaId()` | **P1** | `sessionContext.ts:18` — `session.lojaId ?? LOJA_MATRIZ_ID` | **Média** |
| 5 | `categorias`/`marcas`/`regras_preco` globais sem isolamento | **P1** | `001_schema_inicial.sql:49-60` + `044...rls.sql:12-40` — RLS sem `loja_id` | **Alta** |

---

**Fim do relatório.** Nenhuma correção implementada. Próximos passos: priorizar Riscos 1 e 2 (P0/P1 diretos no código da aplicação), depois 3 (RPC), 4 (auth), 5 (schema).