# Matriz de riscos — vazamento cross-tenant

**Premissa:** “tenant” futuro = **empresa**. Hoje o isolamento real é **loja** (e incompleto).  
Severidade assume **segunda empresa** no mesmo projeto Supabase.

| ID | Vetor | Severidade | Evidência | Mitigação ESPEC / etapa |
|---|---|---|---|---|
| XT-01 | Sem tabela `empresas` — segundo cliente compartilha schema | CRITICAL | Migrations: 0 `CREATE TABLE empresas` | Fase 1 DDL aditiva (D17) |
| XT-02 | `sync-outbox` catalog: SELECT all produtos via service_role | CRITICAL | `backend/supabase/functions/sync-outbox/index.ts` (~768–774) | D6: redesenhar sync antes SaaS |
| XT-03 | RLS categorias/marcas/regras/preços/config sem loja | CRITICAL | Policies `USING (true)` / gerencial global (`001`, `077`, `083`, `087`) | D4/D12 + RESTRICTIVE (D16) |
| XT-04 | SEC DEFINER: DONO/ADMIN aceitam `p_loja_id` arbitrário | HIGH | Padrão A em RPCs (ex. estoque/NFe) | Helpers `fp_lojas_permitidas` + fail-closed (D18) |
| XT-05 | Policies `*_gerente_all` (NFe, remessas, movimentos) | HIGH | Inventário ESPEC §; policies live | RESTRICTIVE + rewrite |
| XT-06 | DONO agrega caixas/estoque/vendas de todas as lojas | HIGH | Policies `*_dono_todas_lojas`; UI admin | OK intra-empresa; perigoso inter-empresa |
| XT-07 | `ensureLoja` reusa loja por `codigo` global | HIGH | `provisionamento/actions.ts` ~108–112 | D11 + filtro empresa |
| XT-08 | Fallbacks `LOJA_MATRIZ_ID` | MED | `sessionContext.ts`, `lojaUsuario.ts` | D18 fail-closed |
| XT-09 | Inconsistência helpers gerencial vs Padrão A | MED | `auth_usuario_gerencial_loja` vs RPCs | Unificar helpers (§6 ESPEC) |
| XT-10 | `fiscal_provider_config` write DONO/ADMIN sem WITH CHECK loja | MED | Migration fiscal config | Policy + RPC |
| XT-11 | Storage imagens `produtoId/...` sem loja no path | LOW | OK se RLS produtos segura | D5 escrita isolada |
| XT-12 | Queries por ID conhecido (UUID) em tables com RLS fraca | HIGH | Qualquer tabela XT-03/05 | Empresa guard |

### Testes negativos recomendados (ainda NÃO VALIDADOS em multi-empresa)

1. Usuário empresa A tenta `SELECT` produto de loja empresa B por UUID.  
2. Desktop loja A recebe catálogo só de A (hoje FAIL esperado — XT-02).  
3. DONO A não lista caixas de loja B.  
4. `ensureLoja('MATRIZ')` não reatacha loja de outra empresa.  
5. RPC com `p_loja_id` de outra empresa → 42501 / erro tipado.

Estado atual desses testes: **NÃO VALIDADO** (não há fixture de 2 empresas).
