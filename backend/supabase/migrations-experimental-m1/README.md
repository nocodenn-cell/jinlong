# Migrations experimentais M1/M2-B (LOCAL ONLY)

| Arquivo | Conteúdo |
|---|---|
| `20261009000000_m1_fundacao_multiempresa.sql` | empresas, vínculos, `fp_*` base, guardas PoC |
| `20261009100000_m2b_empresa_ativa_contexto.sql` | `usuario_contexto_ativo`, `fp_empresa_ativa`, setter, fail-closed |

**NO-GO:** `db push`, apply remoto, produção.

```bash
cd backend && npm run test:m2b-contexto
```
