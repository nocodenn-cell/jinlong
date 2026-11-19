# Mapa atual — arquitetura multiempresa (código × especificação)

**Data:** 2026-10-08  
**Fonte canônica de decisões:** `docs/architecture/ESPEC_MULTIEMPRESA_V1.md` (D1–D19, execução **não autorizada**)  
**Método:** inspeção de migrations, Edge Functions, Server Actions e docs — não pressupõe que a ESPEC já está no schema.

---

## 1. Tenant root atual

| Conceito | Código atual | ESPEC D1–D19 |
|---|---|---|
| Empresa | **Ausente** (`empresas` / `organizations` / `tenants` = 0) | `empresas` + licença |
| Loja | `public.lojas` (`032_lojas_estoque_por_loja.sql`) | `lojas.empresa_id` FK |
| Usuário | `usuarios.id` = `auth.users`; `usuarios.loja_id` NOT NULL; `usuarios.perfil` | `usuario_vinculos` + espelho legado |
| ADMIN plataforma | `perfil='ADMIN'` com escopo global em várias policies | `plataforma_admins` (vazio na Fase 1) |

**Conclusão:** o sistema é **multi-loja em banco compartilhado**, não multi-empresa.

---

## 2. Binding usuário ↔ loja

| Mecanismo | Arquivo | Comportamento |
|---|---|---|
| Coluna legado | `usuarios.loja_id` | Uma loja “home” por usuário |
| Sessão app | `pdv-importados/lib/auth/lojaUsuario.ts` | Lê `loja_id`; fallback `LOJA_MATRIZ_ID` |
| Helpers SQL | `auth_usuario_loja_id`, `auth_usuario_eh_dono`, `auth_usuario_gerencial_loja` | Mistura DONO-global vs loja-scoped |
| Memberships | — | **Não existe** `usuario_vinculos` |

---

## 3. Domínios e escopo

| Domínio | Escopo típico no código | Notas |
|---|---|---|
| Produtos / estoque | `loja_id` + unique barcode por loja | Hardening 20260816 |
| Clientes / fornecedores | Unique documento/CNPJ por loja | `266`, `294` |
| Vendas / caixa | Via caixa → loja | DONO frequentemente vê todas as lojas |
| Financeiro | Contas/ledger por loja | `financeiro_loja_*` |
| Fiscal | `fiscal_provider_config (loja_id, ambiente)` | Token = env var gerada; worker service_role |
| Categorias / marcas / regras preço | Políticas sem filtro de loja (`USING true` / gerencial global) | ESPEC D4/D12: deveriam ser EMPRESA |
| Sync desktop | `sync-outbox` service_role, catálogo **sem** `.eq('loja_id')` | ESPEC D6: fora do 1º corte SaaS |

---

## 4. Superfície service_role

| Superfície | Path |
|---|---|
| Admin client | `pdv-importados/lib/supabase/admin.ts` |
| Provisionamento | `app/admin/provisionamento/actions.ts` (`ensureLoja` por `codigo` **global**) |
| Funcionários / estoque / produto RPC | actions gerente + adapters |
| Edge | `fiscal-worker`, `sync-outbox` |

RLS **não** é a fronteira nesses caminhos — autorização deve ser app/RPC.

---

## 5. Desktop / SQLite

| Item | Achado |
|---|---|
| Cache produtos | Sem coluna `loja_id` (`pdv-local/.../db.rs`) |
| Config | Singleton + `loja_id` opcional |
| Sync | Header `x-loja-id` / env — seletor, não autorização forte |

---

## 6. Gap ESPEC × código (resumo)

| Decisão | Spec | Código |
|---|---|---|
| D1 ADMIN plataforma | Separado | ADMIN = perfil com leitura ampla |
| D3 vínculos | `usuario_vinculos` | Ausente |
| D4/D12 empresa-owned | categorias/marcas/regras | Globais / sem loja |
| D6 sync | Redesenhar antes multi-cliente | Dump full catalog |
| D11 codigo loja | UNIQUE (empresa, codigo) | UNIQUE global |
| D16 RESTRICTIVE | Protótipo | Só PERMISSIVE |
| D17 Fase 1 aditiva | DDL empresas | **Não iniciada** |
| D19 | Docs only no PR da ESPEC | Cumprido (docs) |

---

## 7. Implicação operacional

- **1 empresa / N lojas no mesmo projeto Supabase:** parcialmente suportado (com DONO global).  
- **2+ empresas independentes no mesmo projeto:** **inseguro** sem Fase 1–7 da ESPEC + redesign sync.
