# M2-A — Contrato de empresa ativa

**Status:** DESENHO (não implementado) · **Data:** 2026-10-08  
**Base código:** `main` @ `ea917430`  
**Referências:** `ESPEC_MULTIEMPRESA_V1.md` §6–§9 · `GATE_M1_M2_VALIDACAO.md` (#493) · PoC `fp_*` (#493)

---

## 1. Problema

Hoje o runtime é **multi-loja unitário**: um `usuarios.loja_id` por pessoa (`sessionConsistency.ts:33,67-76`). Não há `empresas` / `usuario_vinculos` na `main`. O PoC M1 (#493) prova RLS por loja, mas um usuário dual **vê ambas** as empresas sem seletor (V-P0-03).

Objetivo M2-A: especificar como o sistema escolherá **uma empresa ativa por vez**, com fail-closed, sem tratar header/cookie/claim do cliente como autorização.

---

## 2. Alternativas comparadas

| # | Modelo | Segurança | Abas | Complexidade | Perf | Compat Supabase |
|---|---|---|---|---|---|---|
| A | Contexto **persistido no servidor** (tabela `usuario_contexto_ativo` + cookie espelho) | Alta se toda request revalida vínculo | Mesma empresa em todas as abas (desejável) | Média | 1 lookup indexado | Nativo (SSR cookies + RPC DEFINER restrita) |
| B | Contexto **explícito por request** (header/body `empresa_id`) validado contra vínculos | Boa se validação SSOT; ruim se header for confiança | Permite abas com empresas diferentes → **viola** “uma ativa” | Baixa app / alta disciplina | Validação por request | Fácil, mas facilita inconsistência UX |
| C | **JWT claim** `empresa_id` | Fraca na revogação; claim antigo até refresh | Depende do token compartilhado | Alta (custom JWT / hooks) | Menor I/O | Conflita com refresh Supabase; claim não é vínculo |

### Recomendação: **Híbrido A + validação B**

1. **Identidade:** apenas JWT Supabase verificado (`auth.getUser` / `auth.uid()`).  
2. **Seleção de empresa ativa:** persistida no servidor (`usuario_contexto_ativo`), escrita **somente** por RPC/Server Action que prova vínculo ativo. Cookie httpOnly opcional = cache da seleção, **nunca** autorização sozinha.  
3. **Por request:** cliente pode *sugerir* `empresa_id`/`loja_id` (troca explícita); servidor **revalida** contra `usuario_vinculos` + contexto persistido. Divergência → fail-closed.  
4. **Banco:** após validação, servidor pode `set_config('request.fp.empresa_id', …, true)` na conexão usada pela request (initplan dos helpers). Cliente **não** pode setar GUC confiável via PostgREST.

**Por que não C:** revogar vínculo não invalida JWT imediatamente; claim seria segunda fonte de verdade.  
**Por que não B puro:** duas abas com empresas diferentes quebram caixa/sessão mental e ESPEC §9.  
**Por que A+B:** uma empresa ativa global por usuário; parâmetros de request só selecionam *dentro* do autorizado.

---

## 3. Fontes de verdade

| Campo | Fonte de verdade | Derivado | Param. cliente (só seleção) |
|---|---|---|---|
| `auth_user_id` | `auth.users` / JWT verificado | — | Não |
| `ativo` (pessoa) | `usuarios.ativo` | — | Não |
| `empresa_id` (ativa) | `usuario_contexto_ativo.empresa_id` ∩ `usuario_vinculos` | — | Pode sugerir troca |
| `loja_id` (ativa) | Vínculo OPERADOR **ou** seleção GERENTE/DONO ⊆ lojas da empresa | — | Pode sugerir dentro do set |
| `operador_id` | `auth_user_id` (ou `funcionario_id` quando domínio RH) | — | Não |
| `perfil` / `papel` | `usuario_vinculos.papel` (futuro SSOT); espelho `usuarios.perfil` até corte | Espelho legado | Não |
| `permissoes` | Papel + (futuro) grants; não inventar ACL nova no M2 | — | Não |
| `eh_plataforma` | `plataforma_admins` | — | Não |

**Regra:** `empresa_id` / `loja_id` vindos do cliente **nunca** autorizam. Autoriza o conjunto `(auth.uid → vínculos ativos → contexto persistido revalidado)`.

---

## 4. Fluxos

### 4.1 Login

1. Auth Supabase OK → carregar `usuarios` + (futuro) `usuario_vinculos` ativos.  
2. 0 vínculos (e não plataforma) → bloqueio (`SEM_VINCULO` / estende `sem_loja`).  
3. 1 empresa → gravar contexto ativo = essa empresa; loja = regra §4.3.  
4. >1 empresa → **não** gravar empresa; middleware bloqueia com `EMPRESA_ATIVA_OBRIGATORIA` até seleção.  
5. Cliente 1 (só Matriz): passo 3 ≡ comportamento atual.

### 4.2 Troca de empresa

1. Server Action `selecionarEmpresaAtiva(empresaId)` com sessão autenticada.  
2. Prova vínculo ativo; senão `EMPRESA_NAO_AUTORIZADA`.  
3. **Caixa aberto:** se existir caixa `ABERTO` do operador em loja da empresa anterior → **bloquear troca** (`CAIXA_ABERTO_BLOQUEIA_TROCA`) ou exigir fechamento (decisão produto — default: bloquear).  
4. Atualiza `usuario_contexto_ativo`; limpa loja ativa se não pertencer à nova empresa.  
5. Todas as abas (mesmo cookie) passam a ver a nova empresa na próxima request.

### 4.3 Loja ativa

| Papel | Regra |
|---|---|
| OPERADOR | Loja do único vínculo na empresa; sem escolha |
| GERENTE 1 loja | Essa loja |
| GERENTE N lojas | Seleção explícita; sem seleção → telas que exigem loja falham fechado |
| DONO | `loja_id` null = consolidado empresa; ou loja escolhida |

### 4.4 Expiração / revogação

| Evento | Efeito |
|---|---|
| Logout / idle | Invalida sessão Auth + contexto (ou deixa órfão até próximo login) |
| `usuario_vinculos.ativo=false` | Próxima request: revalidação falha → `SEM_VINCULO` / `EMPRESA_NAO_AUTORIZADA` |
| `usuarios.ativo=false` | Já bloqueado hoje (`sessionConsistency`) |
| Empresa `SUSPENSA`/`CANCELADA` | `fp_empresa_operacional` → bloqueio escrita; leitura política a decidir (default: bloqueio total operacional) |

### 4.5 Abas simultâneas

- Mesma empresa ativa (cookie/DB compartilhado).  
- Tentativa de operar empresa B numa aba enquanto ativa = A: request com `empresa_id=B` sem troca formal → **ou** rejeita, **ou** exige Action de troca (recomendado: rejeita com `EMPRESA_DIVERGENTE`).  
- Não permitir duas empresas “efetivas” em paralelo no mesmo usuário.

---

## 5. Contratos API / DB (conceitual)

### 5.1 Tipo de contexto (servidor)

```ts
type TenantContext = {
  authUserId: string
  empresaId: string
  lojaId: string | null
  papel: 'DONO' | 'GERENTE' | 'OPERADOR'
  ehPlataforma: boolean
  vinculos: ReadonlyArray<{ empresaId: string; lojaId: string | null; papel: string }>
}
```

### 5.2 Resolução (algoritmo — testado em `test-m2a-contrato-empresa-ativa.mjs`)

Ordem fail-closed:

1. Sem `authUserId` → `NAO_AUTENTICADO`  
2. `usuarios.ativo=false` → `USUARIO_INATIVO`  
3. Sem vínculos ativos → `SEM_VINCULO`  
4. Resolver `empresaId`: solicitado ∪ persistido ∪ (único automático); se >1 e nenhum → `EMPRESA_ATIVA_OBRIGATORIA`  
5. Empresa ∉ vínculos → `EMPRESA_NAO_AUTORIZADA`  
6. Se `lojaId` solicitado: loja.empresa_id ≠ empresa → `LOJA_FORA_DA_EMPRESA`; sem vínculo DONO/GERENTE/OPERADOR na loja → `LOJA_NAO_AUTORIZADA`  
7. OK → contexto

### 5.3 Helpers SQL (futuro M2-B, não agora)

| Helper | Comportamento |
|---|---|
| `fp_empresa_ativa()` | Lê GUC `request.fp.empresa_id` **ou** tabela contexto; vazio → null |
| `fp_lojas_permitidas` | Intersecta com `empresa_id = fp_empresa_ativa()` quando GUC setada |
| `fp_pode_loja` | false se empresa ativa null (fail-closed dual) |

Compat: cliente 1 com uma empresa → GUC sempre setada → equivalência.

### 5.4 Integração com código atual

| Hoje (`main`) | Futuro |
|---|---|
| `getRawSession` + `usuarios.loja_id` | + `empresaId`, `vinculos[]`, `lojaId` resolvido |
| `getGerenteLojaId` → `?? LOJA_MATRIZ_ID` (`sessionContext.ts:18`) | Erro se null; sem fallback Matriz |
| `adminPolicy` `sem_loja` | + `EMPRESA_ATIVA_OBRIGATORIA` |
| sync `x-loja-id` | Dispositivo→loja no servidor; header só seleciona no set |

---

## 6. Estados de erro (fail-closed)

| Código | HTTP / UX | Quando |
|---|---|---|
| `NAO_AUTENTICADO` | 401 / login | Sem JWT válido |
| `USUARIO_INATIVO` | 403 | `usuarios.ativo=false` |
| `SEM_VINCULO` | 403 | Sem vínculos (não plataforma) |
| `EMPRESA_ATIVA_OBRIGATORIA` | 403 + seletor | Dual sem seleção |
| `EMPRESA_NAO_AUTORIZADA` | 403 | Empresa pedida fora dos vínculos |
| `LOJA_FORA_DA_EMPRESA` | 403 | Loja de outra empresa |
| `LOJA_NAO_AUTORIZADA` | 403 | Loja fora do vínculo |
| `EMPRESA_NAO_OPERACIONAL` | 403 | Licença/status |
| `CAIXA_ABERTO_BLOQUEIA_TROCA` | 409 | Troca com caixa aberto |
| `EMPRESA_DIVERGENTE` | 409 | Request sugere outra empresa sem Action de troca |
| `CONTEXTO_API_DB_DIVERGENTE` | 409 | GUC/cookie ≠ revalidação DB |

---

## 7. Compatibilidade e rollback

### Compat (cliente 1 / Matriz)

- Um vínculo E1 + loja Matriz ⇒ sessão resolve a mesma loja de hoje.  
- Manter `usuarios.perfil` / `usuarios.loja_id` como espelho até corte (ESPEC D17).  
- Não remover `LOJA_MATRIZ_ID` literal no M2-A (só desenho); M2-B fase: instrumentar → erro.

### Rollback

1. Parar de setar GUC / ler contexto ativo.  
2. `fp_lojas_permitidas` volta a união de todos os vínculos (comportamento M1 PoC).  
3. Dropar tabela `usuario_contexto_ativo` se criada.  
4. Frontend seletor desligado → usuários single-empresa intactos.

### O que M2-A **não** faz

- Migrations, policies, alteração de `sessionConsistency`, sync-outbox, frontend.

---

## 8. Evidência do algoritmo

Suite local: `backend/scripts/test-m2a-contrato-empresa-ativa.mjs`  
Artefato: `/opt/cursor/artifacts/m2a-contrato-empresa-ativa.json` (10 casos PASS).
